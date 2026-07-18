// The Raku runtime, running in a Web Worker. Rakudo (perl6.js) is compiled
// here, off the UI thread, so a run never freezes the page and a runaway loop
// can be killed by terminating the worker (see raku-runtime.js `cancel`).
//
// Verified (gate): perl6.js boots under a worker's `self` with only `window`
// aliased (no `document` needed), and `EVAL :lang<JavaScript>` reaches worker
// globals — so the puzzle bridge (self.PG) and stdout work exactly as on main.

const BUILD = new URLSearchParams(self.location.search).get("v") || "dev";
// Decompressed size of perl6.js, for the download %; see raku-runtime.js.
const ESTIMATED_UNCOMPRESSED_BYTES = 77_540_424;

// perl6.js reaches NQP_STDOUT via the global; alias window→self so its
// main-thread access pattern resolves. NQP_STDOUT must exist before it loads.
self.window = self;
// perl6.js hands NQP_STDOUT HTML (entity-encoded, ANSI colors as <span>s); the
// main thread decodes it with DOMParser (workers have none). We forward it raw
// — except lines the grammars prelude emits with the RX sentinel, which carry a
// highlight payload (specimen codepoints, then match ranges) we turn into a
// render message rather than printing. The marker and delimiter must be ASCII:
// NQP_STDOUT HTML-encodes non-ASCII (e.g. § → &sect;), which would hide it. `@`
// and the digits/commas of the payload pass through escapeXML untouched.
const RX = "@@RX@@";
self.NQP_STDOUT = (s) => {
    s = String(s);
    if (s.startsWith(RX)) {
        const [cps, ranges] = s.slice(RX.length).trimEnd().split("@");
        self.postMessage({
            type: "render",
            payload: {
                text: String.fromCodePoint(...cps.split(",").filter(Boolean).map(Number)),
                ranges: ranges ? ranges.split(";").filter(Boolean).map((r) => r.split(",").map(Number)) : [],
            },
        });
        return;
    }
    self.postMessage({ type: "stdout", text: s });
};

// stderr is hard-wired to console.error inside perl6.js; forward it only during
// a run (+ a short grace window, since it can flush a tick late).
let running = false;
let stderrOpenUntil = 0;
const origConsoleError = console.error.bind(console);
console.error = (...args) => {
    origConsoleError(...args);
    if (running || Date.now() < stderrOpenUntil)
        self.postMessage({ type: "stderr", text: args.join(" ") });
};

// The puzzle simulation lives here; commands are fire-and-forget (also streamed
// to the main thread to animate), queries are answered locally & synchronously.
let sim = null;
self.PG = {
    command: (name, line) => {
        const cmd = sim ? sim.command(name, line) : null;
        if (cmd) self.postMessage({ type: "command", cmd });
    },
    query: (name) => (sim ? sim.query(name) : 0),
};

async function load() {
    try {
        importScripts(`world-sim.js?v=${BUILD}`); // defines self.WorldSim

        // Stream the download so the page can show real progress, then compile
        // from a blob (importScripts blocks the worker, not the UI).
        const res = await fetch(`perl6.js?v=${BUILD}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
            self.postMessage({ type: "progress", fraction: Math.min(received / total, 0.99), phase: "download" });
        }
        self.postMessage({ type: "progress", fraction: 1, phase: "compile" });

        const blob = new Blob(chunks, { type: "text/javascript" });
        chunks.length = 0;
        const url = URL.createObjectURL(blob);
        importScripts(url);
        URL.revokeObjectURL(url);

        if (typeof self.evalP6 !== "function")
            throw new Error("perl6.js loaded but evalP6 was not defined");
        self.postMessage({ type: "ready" });
    } catch (e) {
        self.postMessage({ type: "load-error", message: String(e && (e.stack || e.message || e)) });
    }
}

self.onmessage = (e) => {
    const msg = e.data;
    if (msg.type !== "run") return;
    sim = msg.level ? new self.WorldSim(msg.level) : null;
    running = true;
    try {
        self.evalP6(msg.source);
    } catch (err) {
        // Raku exit() throws an Exit exception — a clean end-of-run.
        if (!(err && err.constructor && err.constructor.name === "Exit"))
            self.postMessage({ type: "stderr", text: err && err.message ? err.message : String(err) });
    } finally {
        running = false;
        stderrOpenUntil = Date.now() + 250;
        self.postMessage({ type: "done", id: msg.id, result: sim ? sim.result() : null });
    }
};

load();
