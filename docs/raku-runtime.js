// Minimal runtime shim for Rakudo compiled to JavaScript (perl6.js).
// Modeled on the experimental "webperl6" patch from WebPerl, but standalone:
// perl6.js only needs window.NQP_STDOUT defined before it loads, and exposes
// window.evalP6(code) once initialized. There is no NQP_STDERR hook — Rakudo
// writes stderr through console.error (resolved at call time), so we wrap it.

const LOAD_TIMEOUT_MS = 120_000;
// stderr is buffered inside perl6.js and may flush a tick after evalP6
// returns, so keep forwarding console.error to the pane briefly after a run.
const STDERR_GRACE_MS = 250;
// Decompressed size of perl6.js. On production it arrives gzipped, so the
// response's Content-Length is the *compressed* size (~10 MB) while the
// stream yields these decompressed bytes — we track progress against this.
// Update it if perl6.js is re-vendored (must be ≥ the real size or the bar
// finishes early and stalls at 99%).
const ESTIMATED_UNCOMPRESSED_BYTES = 77_540_424;
// Cache-busting build id, stamped into index.html at deploy time; "dev"
// locally. Versioning perl6.js is what makes the service worker cache safe.
const BUILD = (typeof window !== "undefined" && window.__BUILD__) || "dev";

const listeners = [];
let state = "uninitialized";
let evalP6 = null;
let stderrOpenUntil = 0;

function changeState(newState) {
    if (state === newState) return;
    const oldState = state;
    state = newState;
    for (const cb of listeners) cb(oldState, newState);
}

export const runtime = {
    get state() { return state; },

    onStateChange(cb) { listeners.push(cb); },

    // Overridable output sinks.
    onStdout(_text) {},
    onStderr(_text) {},
    // Load progress: fraction is 0..1; phase is "download" or "compile".
    onProgress(_fraction, _phase) {},

    init() {
        if (state !== "uninitialized")
            throw new Error(`Raku runtime: can't init in state ${state}`);
        changeState("loading");

        // NQP_STDOUT is handed HTML (ansi-to-html with escapeXML): user text
        // arrives entity-encoded, ANSI colors as real <span> tags — e.g.
        // compile errors and die() messages. DOMParser decodes entities and
        // drops the tags without executing anything.
        const parser = new DOMParser();
        window.NQP_STDOUT = (str) => {
            const text = parser.parseFromString(String(str), "text/html").documentElement.textContent;
            runtime.onStdout(text);
        };

        const origConsoleError = console.error.bind(console);
        console.error = (...args) => {
            origConsoleError(...args);
            if (state === "running" || Date.now() < stderrOpenUntil)
                runtime.onStderr(args.join(" "));
        };

        // Single-file build: perl6.js is inlined in a <script> tag that runs
        // after this bundle — poll for evalP6 instead of injecting a src.
        // Nothing to download, so we're straight into the compile phase.
        if (window.PERL6_EMBEDDED) {
            runtime.onProgress(1, "compile");
            const t0 = Date.now();
            const poll = setInterval(() => {
                if (typeof window.evalP6 === "function") {
                    clearInterval(poll);
                    evalP6 = window.evalP6;
                    changeState("ready");
                } else if (Date.now() - t0 > LOAD_TIMEOUT_MS) {
                    clearInterval(poll);
                    changeState("error");
                    runtime.onStderr("embedded perl6.js did not initialize within 120 seconds");
                }
            }, 150);
            return;
        }

        // Stream the download so we can report real progress, then compile
        // from a blob URL. A plain <script src="perl6.js"> gives no progress
        // signal; HTTP caching (and the service worker on prod) still apply
        // to the fetch exactly as they did to the script tag.
        const url = `perl6.js?v=${BUILD}`;

        const timeoutId = setTimeout(() => {
            if (state === "loading") {
                changeState("error");
                runtime.onStderr("perl6.js failed to initialize within 120 seconds");
            }
        }, LOAD_TIMEOUT_MS);

        (async () => {
            let objectUrl = null;
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                // Content-Length is the compressed size when gzipped, so only
                // trust it as the total when the body isn't content-encoded.
                const encoded = res.headers.get("content-encoding");
                const declared = Number(res.headers.get("content-length")) || 0;
                const total = (!encoded && declared) ? declared : ESTIMATED_UNCOMPRESSED_BYTES;

                const reader = res.body.getReader();
                const chunks = [];
                let received = 0;
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    received += value.length;
                    runtime.onProgress(Math.min(received / total, 0.99), "download");
                }

                // Download done. The synchronous compile is next and blocks the
                // UI thread, so switch to the compile phase and yield once to
                // let it paint before the freeze.
                runtime.onProgress(1, "compile");
                await new Promise((r) => setTimeout(r));

                // Hand the bytes to a Blob, then drop our references so the
                // ~77 MB of chunks can be GC'd instead of lingering in the JS
                // heap alongside the blob while the compile runs (matters on
                // memory-tight devices — phones — and CI).
                const blob = new Blob(chunks, { type: "text/javascript" });
                chunks.length = 0;
                objectUrl = URL.createObjectURL(blob);
                const script = document.createElement("script");
                script.onload = () => {
                    clearTimeout(timeoutId);
                    URL.revokeObjectURL(objectUrl);
                    if (typeof window.evalP6 !== "function") {
                        changeState("error");
                        runtime.onStderr("perl6.js loaded but window.evalP6 was not set (runtime crashed during init)");
                        return;
                    }
                    evalP6 = window.evalP6;
                    changeState("ready");
                };
                script.onerror = () => {
                    clearTimeout(timeoutId);
                    URL.revokeObjectURL(objectUrl);
                    changeState("error");
                    runtime.onStderr(`Failed to execute ${url}`);
                };
                script.src = objectUrl;
                document.head.appendChild(script);
            } catch (e) {
                clearTimeout(timeoutId);
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                changeState("error");
                runtime.onStderr(`Failed to load ${url}: ${e && e.message ? e.message : e}`);
            }
        })();
    },

    // Synchronous: the UI thread blocks while Raku code runs.
    run(code) {
        if (state !== "ready")
            throw new Error(`Raku runtime: can't run in state ${state}`);
        changeState("running");
        try {
            evalP6(code);
        } catch (e) {
            // Raku's exit() throws an Exit exception — a clean end-of-run.
            if (!(e && e.constructor && e.constructor.name === "Exit"))
                runtime.onStderr(e && e.message ? e.message : String(e));
        } finally {
            stderrOpenUntil = Date.now() + STDERR_GRACE_MS;
            changeState("ready");
        }
    },
};
