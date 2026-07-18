import { EditorView, basicSetup, keymap, StreamLanguage, perl, oneDark } from "./vendor/codemirror.js";
import { runtime } from "./raku-runtime.js";
import { World, PRELUDE, sleep, nextLevelButton } from "./world.js";
import { SAGAS } from "./sagas/index.js";
import { startTour, maybeAutoStartTour } from "./tour.js";

const statusEl = document.getElementById("status");
const loadBar = document.getElementById("load-bar");
const runButton = document.getElementById("run");
const stopButton = document.getElementById("stop");
const stepButton = document.getElementById("step");
const clearButton = document.getElementById("clear");
const hintButton = document.getElementById("hint-btn");
const helpButton = document.getElementById("help");
const sagaSelect = document.getElementById("saga");
const levelSelect = document.getElementById("level");
const speedSelect = document.getElementById("speed");
const outputEl = document.getElementById("output");
const previewEl = document.getElementById("preview");
const worldEl = document.getElementById("world");

const SAMPLE = `say "Hello from Raku! \u{1F98B}";\nsay [+] 1..10;\n`;

let world = null;       // active World in puzzle mode, null otherwise
let domLevel = null;    // active dom-type level (preview-pane world), null otherwise
let playing = false;    // animation playback (or step session) in progress
let stepSession = false;
let stepping = false;   // a single stepOnce animation is in flight
let runCount = 0;
const domBanner = document.getElementById("dom-banner");

function appendOutput(text, className) {
    const span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = text;
    outputEl.appendChild(span);
    outputEl.scrollTop = outputEl.scrollHeight;
}

runtime.onStdout = (text) => appendOutput(text);
runtime.onStderr = (text) => appendOutput(text.endsWith("\n") ? text : text + "\n", "stderr");
// Puzzle commands stream from the worker mid-run; collect them for playback.
runtime.onCommand = (cmd) => { if (world) world.commands.push(cmd); };
// Grammars: a highlight payload the worker computed; draw it into the preview.
runtime.onRender = (payload) => renderMatches(payload);

const STATUS_TEXT = {
    ready: "Ready",
    running: "Running…",
    error: "Runtime failed to load — see output",
};

// Updated live by runtime.onProgress; shown while state === "loading".
let loadStatus = "Starting Raku runtime…";

runtime.onProgress = (fraction, phase) => {
    loadStatus = phase === "download"
        ? `Downloading Raku runtime… ${Math.round(fraction * 100)}%`
        : "Compiling runtime… (first load only)";
    loadBar.hidden = false;
    loadBar.firstElementChild.style.width = `${Math.round(fraction * 100)}%`;
    if (runtime.state === "loading") refreshControls();
};

function refreshControls() {
    const state = runtime.state;
    const idle = state === "ready" && !playing;
    const statusText = state === "loading" ? loadStatus : (STATUS_TEXT[state] ?? state);
    statusEl.textContent = playing ? "Playing…" : statusText;
    statusEl.className = `status ${playing ? "running" : state}`;
    runButton.disabled = !idle;
    runButton.textContent = state === "loading" ? "Loading…" : "Run";
    stepButton.disabled = !(idle || (stepSession && !stepping));
    // Stop is available only while the worker is actually executing (a run in
    // the worker) — the one moment it can be interrupted (by terminating it).
    stopButton.hidden = state !== "running";
    // switching level or saga mid-run would tangle playback, progress and UI state
    sagaSelect.disabled = playing;
    levelSelect.disabled = playing;
    // Progress bar: during loading, onProgress owns it (determinate download).
    // Otherwise show an indeterminate sliding stripe while a run is in flight.
    if (state !== "loading") {
        if (playing) {
            loadBar.firstElementChild.style.width = "";  // let CSS size the stripe
            loadBar.classList.add("indeterminate");
            loadBar.hidden = false;
        } else {
            loadBar.hidden = true;
            loadBar.classList.remove("indeterminate");
        }
    }
}

runtime.onStateChange(() => refreshControls());

function setEditorText(text) {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
}

// ---------- progression (tracked per saga) ----------

// storage may be unavailable (blocked cookies, some file:// setups) or hold
// corrupted values — none of that may prevent the playground from booting
function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* progress just won't persist */ }
}
function storageRemove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
}

const progressKey = (sagaId) => `raku-playground-progress:${sagaId}`;

// pre-saga versions stored Learn Raku progress under a plain key — migrate it
{
    const legacy = storageGet("raku-playground-progress");
    if (legacy !== null && storageGet(progressKey("learn-raku")) === null) {
        storageSet(progressKey("learn-raku"), legacy);
        storageRemove("raku-playground-progress");
    }
}

let currentSaga = SAGAS[0];
let progress = new Set();

function loadProgress() {
    let stored;
    try { stored = JSON.parse(storageGet(progressKey(currentSaga.id)) ?? "[]"); } catch { stored = []; }
    progress = new Set(Array.isArray(stored) ? stored : []);
}

// first level not yet completed — the furthest one that may be played
function maxUnlocked() {
    let i = 0;
    while (progress.has(i)) i++;
    return i;
}

function markComplete(i) {
    if (progress.has(i)) return;
    progress.add(i);
    storageSet(progressKey(currentSaga.id), JSON.stringify([...progress].sort((a, b) => a - b)));
    refreshLevelLabels();
}

function refreshLevelLabels() {
    const max = maxUnlocked();
    for (const opt of levelSelect.options) {
        const i = Number(opt.value);
        const locked = i > max;
        opt.disabled = locked;
        opt.textContent = `${progress.has(i) ? "✓ " : locked ? "🔒 " : ""}${i + 1}. ${currentSaga.levels[i].name}`;
    }
}

// ---------- sagas / levels / modes ----------

let currentLevel = "0";

// One place owns the per-mode UI state and cross-mode teardown; the drift
// between hand-maintained flag blocks was a bug factory.
function applyMode(mode) { // "puzzle" | "dom" | "free"
    stepSession = false;
    stepping = false;
    domBanner.hidden = true;
    worldEl.hidden = mode !== "puzzle";
    previewEl.hidden = mode === "puzzle";
    speedSelect.hidden = mode !== "puzzle";
    stepButton.hidden = mode !== "puzzle";
    previewEl.replaceChildren();
    if (mode !== "puzzle") {
        world = null;
        worldEl.replaceChildren(); // drop any stale board (and its banner)
    }
    if (mode !== "dom") domLevel = null;
}

function setSaga(value) {
    if (playing) return; // mid-run switches tangle playback, progress and UI
    sagaSelect.value = value;
    if (value === "free") {
        levelSelect.hidden = true;
        enterFreePlay();
        return;
    }
    levelSelect.hidden = false;
    currentSaga = SAGAS.find((s) => s.id === value) ?? SAGAS[0];
    loadProgress();
    levelSelect.replaceChildren(...currentSaga.levels.map((level, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${i + 1}. ${level.name}`;
        return opt;
    }));
    refreshLevelLabels();
    // land on the furthest unlocked level (or the last one when all are done)
    setLevel(String(Math.min(maxUnlocked(), currentSaga.levels.length - 1)));
}

function enterFreePlay() {
    if (playing) return;
    currentLevel = "free";
    applyMode("free");
    showInstructions({
        name: "Free play",
        goal: "Write any Raku you like — output appears in the pane below.",
        steps: [],
    });
    setEditorText(SAMPLE);
    refreshControls();
}

function setLevel(value) {
    if (playing) return; // mid-run switches tangle playback, progress and UI
    if (Number(value) > maxUnlocked()) {
        levelSelect.value = currentLevel; // locked — refuse and restore selection
        return;
    }
    currentLevel = value;
    levelSelect.value = value;

    const idx = Number(value);
    const level = currentSaga.levels[idx];
    const dom = level.type === "dom";
    applyMode(dom ? "dom" : "puzzle");

    if (dom) {
        domLevel = level;
    } else {
        world = new World(level, worldEl);
        world.onFinished = (res) => { if (res.success) markComplete(idx); };
        world.onNext = idx + 1 < currentSaga.levels.length ? () => setLevel(String(idx + 1)) : null;
        world.render();
        applyView();
    }
    showInstructions(level);
    setEditorText(level.starter);
    refreshControls();
}

function showDomResult() {
    const idx = Number(currentLevel);
    let res;
    try {
        res = domLevel.check(previewEl, { output: outputEl.innerText });
    } catch (e) {
        res = { success: false, message: String(e) };
    }
    if (res === true) res = { success: true };
    if (!res) res = { success: false };
    domBanner.className = `dom-banner ${res.success ? "success" : "failure"}`;
    domBanner.textContent = res.success
        ? "Level complete! 🎉"
        : `Not yet — ${res.message ?? "compare the preview with the goal"}`;
    if (res.success) {
        markComplete(idx);
        if (idx + 1 < currentSaga.levels.length)
            domBanner.append(" ", nextLevelButton(() => setLevel(String(idx + 1))));
    }
    domBanner.hidden = false;
}

function showInstructions(level) {
    document.getElementById("lvl-name").textContent = level.name;
    document.getElementById("lvl-goal").textContent = level.goal;
    const more = document.getElementById("lvl-more");
    // phones: name + goal stay visible, the teaching text folds away —
    // a tall clipped panel reads as panes painted over each other
    more.open = window.matchMedia("(min-width: 701px)").matches;
    more.hidden = level.steps.length === 0 && !(level.explain?.length);
    const steps = document.getElementById("lvl-steps");
    steps.replaceChildren(...level.steps.map((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        return li;
    }));
    renderExplain(level.explain);
    const hint = document.getElementById("lvl-hint");
    hint.hidden = true;
    hint.textContent = level.hint ?? "";
    hintButton.hidden = !level.hint;
}

// paragraphs of plain text; `code`, **bold** and *italic* markers supported
function renderInline(el, text) {
    for (const part of text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)) {
        if (!part) continue;
        if (part.startsWith("**") && part.endsWith("**")) {
            const b = document.createElement("strong");
            b.textContent = part.slice(2, -2);
            el.appendChild(b);
        } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            const i = document.createElement("em");
            i.textContent = part.slice(1, -1);
            el.appendChild(i);
        } else {
            el.appendChild(document.createTextNode(part));
        }
    }
}

function renderExplain(paragraphs) {
    const box = document.getElementById("lvl-explain");
    box.replaceChildren(...(paragraphs ?? []).map((para) => {
        const p = document.createElement("p");
        para.split("`").forEach((part, i) => {
            if (i % 2) {
                const c = document.createElement("code");
                c.textContent = part;
                p.appendChild(c);
            } else if (part) {
                renderInline(p, part);
            }
        });
        return p;
    }));
}

// ---------- drag to rotate the board ----------

// the CSS custom properties on #world are the source of truth for the
// default angles; JS only takes over once it needs to change them
const worldStyle = getComputedStyle(worldEl);
const view = {
    rx: parseFloat(worldStyle.getPropertyValue("--rotX")) || 55,
    rz: parseFloat(worldStyle.getPropertyValue("--rotZ")) || 45,
};

function applyView() {
    worldEl.style.setProperty("--rotX", `${view.rx}deg`);
    worldEl.style.setProperty("--rotZ", `${view.rz}deg`);
    // negated copies for the sprite counter-rotation: WebKit rejects
    // calc() inside transform function arguments
    worldEl.style.setProperty("--rotXneg", `${-view.rx}deg`);
    worldEl.style.setProperty("--rotZneg", `${-view.rz}deg`);
    // Camelia's stare direction is a screen projection — recompute when the board turns
    world?.setHeading(world.arrowFacing, 0);
}

let dragFrom = null;
worldEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    dragFrom = { x: e.clientX, y: e.clientY, rx: view.rx, rz: view.rz };
    worldEl.setPointerCapture(e.pointerId);
});
worldEl.addEventListener("pointermove", (e) => {
    if (!dragFrom) return;
    // grab metaphor: the near edge follows the pointer — dragging right
    // spins the board counterclockwise, so the horizontal delta subtracts
    view.rz = dragFrom.rz - (e.clientX - dragFrom.x) * 0.4;
    view.rx = Math.min(85, Math.max(15, dragFrom.rx - (e.clientY - dragFrom.y) * 0.3));
    applyView();
});
worldEl.addEventListener("pointerup", () => { dragFrom = null; });
worldEl.addEventListener("pointercancel", () => { dragFrom = null; });
applyView();

window.addEventListener("resize", () => world?.fitBoard());

// ---------- running ----------

// Grammars: draw the worker-computed match highlights into the preview pane.
// Payload: { text, ranges: [[from, to], …] } (char offsets). The matching ran
// in the worker (pure Raku); we only build the <pre>/<mark> DOM here. Slice via
// the spread so astral characters count as one position, matching Raku offsets.
function renderMatches({ text, ranges }) {
    const chars = [...text];
    const pre = document.createElement("pre");
    pre.className = "rx-specimen";
    let pos = 0;
    for (const [from, to] of ranges) {
        if (from > pos) pre.appendChild(document.createTextNode(chars.slice(pos, from).join("")));
        const mark = document.createElement("mark");
        mark.textContent = chars.slice(from, to).join("");
        pre.appendChild(mark);
        pos = to;
    }
    if (pos < chars.length) pre.appendChild(document.createTextNode(chars.slice(pos).join("")));
    previewEl.appendChild(pre);
}

function buildSource() {
    const src = editor.state.doc.toString();
    // any saga may carry a prelude; puzzle levels get the command PRELUDE first
    const parts = [];
    if (world) parts.push(PRELUDE);
    if ((world || domLevel) && currentSaga.prelude) parts.push(currentSaga.prelude);
    parts.push(src);
    return parts.join("\n");
}

// Runs in the worker; puzzle commands stream into world.commands via onCommand.
async function runUserCode() {
    const level = world ? { grid: world.level.grid, start: world.level.start } : null;
    const result = await runtime.run(buildSource(), level);
    if (world) {
        world.finalResult = result;
        // Expose the final sim snapshot now (before playback/step animates), so
        // world.sim.{x,y,dead,collected} is readable throughout playback.
        if (result) world.sim = result;
    }
}

async function record() {
    runCount++;
    appendOutput(`— Run #${runCount} (${new Date().toLocaleTimeString()}) —\n`, "run-separator");
    if (world) {
        world.reset();
        world.render();
    } else {
        previewEl.replaceChildren();
        domBanner.hidden = true;
    }
    statusEl.textContent = STATUS_TEXT.running;
    statusEl.className = "status running";
    runButton.disabled = true;
    stepButton.disabled = true;
    await runUserCode();
}

async function runCode() {
    if (runtime.state !== "ready" || playing) return;
    stepSession = false;
    playing = true; // set before any await so the UI can't re-enter mid-run
    refreshControls();
    try {
        await record();
        if (world) await world.playAll(Number(speedSelect.value));
        else if (domLevel) showDomResult();
    } finally {
        playing = false;
        refreshControls();
    }
}

async function stepCode() {
    if (!world) return;
    if (!stepSession) {
        if (runtime.state !== "ready" || playing) return;
        playing = true;
        stepSession = true;
        refreshControls();
        await record();
        if (world.commands.length === 0) {  // nothing recorded, finish at once
            world.finish();
            playing = false;
            stepSession = false;
        }
        refreshControls();
        return;
    }
    if (stepping) return; // a step animation is already in flight
    stepping = true;
    refreshControls();
    try {
        const more = await world.stepOnce();
        if (!more) {
            world.finish();
            playing = false;
            stepSession = false;
        }
    } finally {
        stepping = false;
        refreshControls();
    }
}

// ---------- editor / wiring ----------

const INDENT = "    "; // 4 spaces

// Tab / Shift-Tab indentation. Empty or single-line selection: Tab inserts
// spaces at the cursor. Any multi-line selection, and all dedents, operate
// line-by-line on every line the selection touches.
function changeIndent(view, dedent) {
    const { state } = view;
    const multiline = state.selection.ranges.some(
        (r) => state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number
    );
    if (!dedent && !multiline) {
        view.dispatch(state.update(state.replaceSelection(INDENT), {
            scrollIntoView: true,
            userEvent: "input",
        }));
        return true;
    }
    const lines = new Set();
    for (const r of state.selection.ranges) {
        const from = state.doc.lineAt(r.from).number;
        const to = state.doc.lineAt(r.to).number;
        for (let n = from; n <= to; n++) lines.add(n);
    }
    const changes = [];
    for (const n of lines) {
        const line = state.doc.line(n);
        if (dedent) {
            const m = /^(?: {1,4}|\t)/.exec(line.text); // strip up to 4 spaces or one tab
            if (m) changes.push({ from: line.from, to: line.from + m[0].length });
        } else {
            changes.push({ from: line.from, insert: INDENT });
        }
    }
    if (changes.length)
        view.dispatch(state.update({ changes, userEvent: dedent ? "delete.dedent" : "input.indent" }));
    return true; // always consume Tab/Shift-Tab so focus stays in the editor
}

const editor = new EditorView({
    doc: SAMPLE,
    parent: document.getElementById("editor"),
    extensions: [
        keymap.of([
            { key: "Mod-Enter", run: () => { runCode(); return true; } },
            { key: "Tab", run: (view) => changeIndent(view, false) },
            { key: "Shift-Tab", run: (view) => changeIndent(view, true) },
            // accessibility escape hatch: Tab is captured, so Escape releases focus
            { key: "Escape", run: (view) => { view.contentDOM.blur(); return true; } },
        ]),
        basicSetup,
        StreamLanguage.define(perl),
        oneDark,
    ],
});

sagaSelect.replaceChildren(
    ...SAGAS.map((saga) => {
        const opt = document.createElement("option");
        opt.value = saga.id;
        opt.textContent = saga.title;
        opt.title = saga.description;
        return opt;
    }),
    new Option("Free play", "free"),
);
sagaSelect.addEventListener("change", () => setSaga(sagaSelect.value));
levelSelect.addEventListener("change", () => setLevel(levelSelect.value));

runButton.addEventListener("click", runCode);
stepButton.addEventListener("click", stepCode);
stopButton.addEventListener("click", () => runtime.cancel());

// Cmd+Enter (mac) / Ctrl+Enter (elsewhere) runs from anywhere — the editor's
// own Mod-Enter keymap only fires while it has focus
document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        runCode();
    }
});
clearButton.addEventListener("click", () => { outputEl.textContent = ""; });
hintButton.addEventListener("click", () => {
    document.getElementById("lvl-hint").hidden = false;
});
helpButton.addEventListener("click", () => startTour());

// Exposed for scripted testing.
window.__playground = {
    editor,
    runtime,
    runCode,
    stepCode,
    setSaga: (v) => setSaga(String(v)),
    setLevel: (v) => (String(v) === "free" ? setSaga("free") : setLevel(String(v))),
    getWorld: () => world,
    isPlaying: () => playing,
    sagas: SAGAS,
    get levels() { return currentSaga.levels; },
    progress: () => [...progress],
    startTour,
};

setSaga(SAGAS[0].id);
maybeAutoStartTour();  // first-time visitors get the tour while the runtime loads
runtime.init();

// Cache the 77 MB runtime across visits with a service worker — but only on a
// real (https) deployment. Localhost is excluded so the dev server and the
// Playwright suite (which loads a fresh page per spec) never hit a stale
// cache; file:// (the single-file build) is excluded for the same reason.
if ("serviceWorker" in navigator
    && location.protocol === "https:"
    && !/^(localhost|127\.|\[?::1)/.test(location.hostname)) {
    const build = window.__BUILD__ || "dev";
    navigator.serviceWorker.register(`sw.js?v=${build}`).catch(() => { /* caching is best-effort */ });
}
