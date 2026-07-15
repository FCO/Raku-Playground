// Minimal runtime shim for Rakudo compiled to JavaScript (perl6.js).
// Modeled on the experimental "webperl6" patch from WebPerl, but standalone:
// perl6.js only needs window.NQP_STDOUT defined before it loads, and exposes
// window.evalP6(code) once initialized. There is no NQP_STDERR hook — Rakudo
// writes stderr through console.error (resolved at call time), so we wrap it.

const LOAD_TIMEOUT_MS = 120_000;
// stderr is buffered inside perl6.js and may flush a tick after evalP6
// returns, so keep forwarding console.error to the pane briefly after a run.
const STDERR_GRACE_MS = 250;

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
        if (window.PERL6_EMBEDDED) {
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

        const script = document.createElement("script");
        script.async = true;
        script.defer = true;
        // Order matters: 1. add to DOM, 2. set handlers, 3. set src.
        document.head.appendChild(script);

        const timeoutId = setTimeout(() => {
            changeState("error");
            runtime.onStderr("perl6.js failed to initialize within 120 seconds");
        }, LOAD_TIMEOUT_MS);

        script.onload = () => {
            clearTimeout(timeoutId);
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
            changeState("error");
            runtime.onStderr(`Failed to load ${script.src}`);
        };

        script.src = "perl6.js";
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
