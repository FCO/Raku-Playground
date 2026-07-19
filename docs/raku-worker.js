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
// The elevator saga streams presentation events (car moved, doors, board/…)
// on the same reliable stdout channel with a distinct ASCII sentinel: one line
// per sim tick, ';'-separated events of '|'-separated integer fields
// ("type|t|arg…"). We parse them here, feed the ElevatorPresenter (so `done`
// can report a result) and forward each event as a command for the main thread
// to animate. ASCII-only, like @@RX@@, so NQP_STDOUT's HTML-encoding leaves it
// intact.
const EV = "@@EV@@";
// The snake saga uses the same channel with its own ASCII sentinel: one line per
// tick, ';'-separated events of '|'-separated integer fields ("type|t|arg…").
// Parsed here, fed to the SnakePresenter (honest result), and forwarded as
// commands for the main thread to animate.
const SN = "@@SN@@";
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
    if (s.startsWith(EV) || s.startsWith(SN)) {
        for (const chunk of s.slice(EV.length).trimEnd().split(";")) {
            if (!chunk) continue;
            const parts = chunk.split("|");
            const nums = parts.slice(1).map(Number);
            const cmd = { ev: parts[0], t: nums[0], a: nums.slice(1) };
            if (sim && sim.event) sim.event(cmd);
            self.postMessage({ type: "command", cmd });
        }
        return;
    }
    self.postMessage({ type: "stdout", text: s });
};

// Tallies the elevator event stream into a result the `done` message reports.
// Transported/moves/waits come straight from the (trusted) engine's events, so
// the pass/fail check is honest regardless of what the user's control code does.
class ElevatorPresenter {
    constructor(goal) { this.goal = goal || {}; this.transported = 0; this.moves = 0; this.waits = []; this.elapsed = 0; }
    event(ev) {
        if (ev.t > this.elapsed) this.elapsed = ev.t;
        if (ev.ev === "a") this.transported++;
        else if (ev.ev === "t") this.moves++;
        else if (ev.ev === "b") this.waits.push(ev.a[4]);
    }
    result() {
        const g = this.goal;
        const maxWait = this.waits.length ? Math.max(...this.waits) : 0;
        const avgWait = this.waits.length ? this.waits.reduce((x, y) => x + y, 0) / this.waits.length : 0;
        let success = this.transported >= (g.transport || 0);
        if (g.maxMoves) success = success && this.moves <= g.maxMoves;
        if (g.maxWait) success = success && maxWait <= g.maxWait * 1000;
        return { success, transported: this.transported, moves: this.moves, maxWait, avgWait, elapsed: this.elapsed };
    }
}

// Tallies the snake event stream into an honest pass/fail. Length/food/death
// come straight from the (trusted) engine's events, so the result is independent
// of what the user's move() claims. Player is snake id 0.
class SnakePresenter {
    constructor(goal) {
        this.goal = goal || {};
        this.tick = 0;
        this.food = {};     // snakeId -> food eaten
        this.maxLen = {};   // snakeId -> max length seen
        this.dead = {};     // snakeId -> true
        this.ended = false; // saw the engine's 'e' event → a full sim actually ran
    }
    event(ev) {
        if (ev.t > this.tick) this.tick = ev.t;
        const s = ev.a[0];
        if (ev.ev === "x") this.food[s] = (this.food[s] || 0) + 1;
        else if (ev.ev === "k") this.maxLen[s] = Math.max(this.maxLen[s] || 0, ev.a[1]);
        else if (ev.ev === "d") this.dead[s] = true;
        else if (ev.ev === "e") this.ended = true;
    }
    result() {
        const g = this.goal;
        const alive = !this.dead[0];
        const food = this.food[0] || 0;
        const length = this.maxLen[0] || 0;
        // A level can only pass if the engine ran to completion (emitted 'e').
        // A compile/runtime error throws out of evalP6 before that, so it must
        // fail — never let "no death event seen" read as "survived".
        let success = false;
        if (this.ended) {
            if (g.food != null) success = food >= g.food;          // death after eating still counts
            else if (g.length != null) success = length >= g.length;
            else success = alive && this.tick >= (g.survive || 0);  // survive to the goal tick
        }
        return { success, ended: this.ended, alive: this.ended && alive, food, length, ticks: this.tick, opponentDead: !!this.dead[1] };
    }
}

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
        // Single-file build: world-sim.js and perl6.js are concatenated into
        // this worker's blob (after this glue), so there's nothing to fetch —
        // poll for evalP6, which the inlined perl6.js defines as it runs.
        if (self.PERL6_EMBEDDED) {
            self.postMessage({ type: "progress", fraction: 1, phase: "compile" });
            const t0 = Date.now();
            const poll = setInterval(() => {
                if (typeof self.evalP6 === "function") {
                    clearInterval(poll);
                    self.postMessage({ type: "ready" });
                } else if (Date.now() - t0 > 120_000) {
                    clearInterval(poll);
                    self.postMessage({ type: "load-error", message: "embedded perl6.js did not initialize within 120s" });
                }
            }, 50);
            return;
        }

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
    sim = msg.level
        ? (msg.level.sim === "elevator" ? new ElevatorPresenter(msg.level.goal)
            : msg.level.sim === "snake" ? new SnakePresenter(msg.level.goal)
            : new self.WorldSim(msg.level))
        : null;
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
