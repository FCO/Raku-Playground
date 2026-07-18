// Main-thread client for the Raku runtime, which now lives in a Web Worker
// (docs/raku-worker.js). Rakudo compiles and runs off the UI thread, so a run
// never freezes the page and a runaway loop can be terminated (`cancel`).
//
// Public surface kept close to the old synchronous shim so playground.js barely
// changes: `state`, `onStateChange`, `onStdout`, `onStderr`, `onProgress`, plus
// `onCommand` (puzzle command stream) and `onRender` (grammars). `run` is now
// async and resolves with the puzzle result (or null).

const BUILD = (typeof window !== "undefined" && window.__BUILD__) || "dev";
// Wall-clock guard: a `loop { }` that issues no commands spins the worker
// forever (the per-command guard never trips). The UI stays live, but auto-kill
// the zombie so a forgotten tab doesn't leak a busy thread.
const RUN_TIMEOUT_MS = 30_000;

// perl6.js emits HTML through NQP_STDOUT (entity-encoded text, ANSI colors as
// <span>s — e.g. compile errors). The worker can't decode it (no DOMParser), so
// we do it here: parse and take textContent, which unescapes entities and drops
// the tags without executing anything.
const htmlParser = new DOMParser();
const decodeStdout = (s) => htmlParser.parseFromString(s, "text/html").documentElement.textContent;

const listeners = [];
let state = "uninitialized";
let worker = null;
let runSeq = 0;
let pending = null;      // { id, resolve, timer }

function changeState(newState) {
    if (state === newState) return;
    const oldState = state;
    state = newState;
    for (const cb of listeners) cb(oldState, newState);
}

function spawn() {
    // Single-file build inlines the whole worker (glue + world-sim + perl6.js)
    // in a <script type="text/plain" id="worker-src"> block — run it from a blob
    // URL. Otherwise load the worker file (served build).
    const embedded = typeof document !== "undefined" && document.getElementById("worker-src");
    const workerUrl = embedded
        ? URL.createObjectURL(new Blob([embedded.textContent], { type: "text/javascript" }))
        : `raku-worker.js?v=${BUILD}`;
    worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
        const m = e.data;
        switch (m.type) {
            case "progress": runtime.onProgress(m.fraction, m.phase); break;
            case "ready": changeState("ready"); break;
            case "load-error": changeState("error"); runtime.onStderr(m.message); break;
            case "stdout": runtime.onStdout(decodeStdout(m.text)); break;
            case "stderr": runtime.onStderr(m.text); break;
            case "command": runtime.onCommand(m.cmd); break;
            case "render": runtime.onRender(m.payload); break;
            case "done":
                if (pending && pending.id === m.id) {
                    const p = pending;
                    pending = null;
                    clearTimeout(p.timer);
                    changeState("ready");
                    p.resolve(m.result);
                }
                break;
        }
    };
    worker.onerror = (e) => {
        changeState("error");
        runtime.onStderr(`worker error: ${e.message || e}`);
    };
}

export const runtime = {
    get state() { return state; },

    onStateChange(cb) { listeners.push(cb); },

    // Overridable sinks.
    onStdout(_text) {},
    onStderr(_text) {},
    onProgress(_fraction, _phase) {},
    onCommand(_cmd) {},       // puzzle: a recorded command streamed mid-run
    onRender(_payload) {},    // grammars: a highlight payload to draw

    init() {
        if (state !== "uninitialized")
            throw new Error(`Raku runtime: can't init in state ${state}`);
        changeState("loading");
        spawn();
    },

    // Async: resolves with the puzzle result ({success, fell, collected}) or
    // null. Commands stream via onCommand while it runs; the UI stays free.
    run(source, level = null) {
        if (state !== "ready")
            throw new Error(`Raku runtime: can't run in state ${state}`);
        changeState("running");
        return new Promise((resolve) => {
            const id = ++runSeq;
            const timer = setTimeout(() => {
                runtime.onStderr(`Run exceeded ${RUN_TIMEOUT_MS / 1000}s — stopped.`);
                runtime.cancel();
                if (pending && pending.id === id) { pending = null; resolve(null); }
            }, RUN_TIMEOUT_MS);
            pending = { id, resolve, timer };
            worker.postMessage({ type: "run", id, source, level });
        });
    },

    // Kill the current run (the only way to interrupt a synchronous evalP6) and
    // bring a fresh runtime back up. Powers the Stop button and the timeout.
    cancel() {
        if (worker) worker.terminate();
        // Resolve the in-flight run (with null) so awaiting UI code unblocks and
        // animates whatever streamed before the kill.
        if (pending) { clearTimeout(pending.timer); const p = pending; pending = null; p.resolve(null); }
        changeState("loading");
        spawn();
    },
};
