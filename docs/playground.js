import { EditorView, basicSetup, keymap, StreamLanguage, perl, oneDark } from "./vendor/codemirror.js";
import { runtime } from "./raku-runtime.js";
import { World, PRELUDE, sleep, nextLevelButton } from "./world.js";
import { SAGAS } from "./sagas/index.js";

const statusEl = document.getElementById("status");
const runButton = document.getElementById("run");
const stepButton = document.getElementById("step");
const clearButton = document.getElementById("clear");
const exampleButton = document.getElementById("example");
const hintButton = document.getElementById("hint-btn");
const sagaSelect = document.getElementById("saga");
const levelSelect = document.getElementById("level");
const speedSelect = document.getElementById("speed");
const outputEl = document.getElementById("output");
const previewEl = document.getElementById("preview");
const worldEl = document.getElementById("world");

// Handle for Raku code in free play: EVAL :lang<JavaScript>, 'return PREVIEW'
window.PREVIEW = previewEl;

const SAMPLE = `say "Hello from Raku! \u{1F98B}";\nsay [+] 1..10;\n`;

const DOM_EXAMPLE = `my \\doc     = EVAL :lang<JavaScript>, 'return document';
my \\preview = EVAL :lang<JavaScript>, 'return PREVIEW';

my \\h = doc.createElement('h2');
h.appendChild: doc.createTextNode('Hello from Raku!');
preview.appendChild: h;

for <red green blue> -> $color {
    my \\p = doc.createElement('p');
    p.appendChild: doc.createTextNode("a $color paragraph");
    p.setAttribute: 'style', "color: $color";
    preview.appendChild: p;
}

say 'rendered!';
`;

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

const STATUS_TEXT = {
    loading: "Loading Raku runtime (~77 MB), this takes a while…",
    ready: "Ready",
    running: "Running…",
    error: "Runtime failed to load — see output",
};

function refreshControls() {
    const state = runtime.state;
    const idle = state === "ready" && !playing;
    statusEl.textContent = playing ? "Playing…" : (STATUS_TEXT[state] ?? state);
    statusEl.className = `status ${playing ? "running" : state}`;
    runButton.disabled = !idle;
    runButton.textContent = state === "loading" ? "Loading…" : "Run";
    stepButton.disabled = !(idle || (stepSession && !stepping));
    // switching level or saga mid-run would tangle playback, progress and UI state
    sagaSelect.disabled = playing;
    levelSelect.disabled = playing;
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
    exampleButton.hidden = mode !== "free";
    speedSelect.hidden = mode !== "puzzle";
    stepButton.hidden = mode !== "puzzle";
    previewEl.replaceChildren();
    if (mode !== "puzzle") {
        world = null;
        window.PG = undefined;
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
        goal: "Write any Raku you like. Output appears below; DOM built via the PREVIEW handle appears in the preview pane.",
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
        window.PG = {
            command: (name) => world.command(name),
            query: (name) => world.query(name),
        };
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
        res = domLevel.check(previewEl);
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

// paragraphs of plain text; `backticked` fragments become <code>
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
                p.appendChild(document.createTextNode(part));
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

function evalUserCode() {
    const src = editor.state.doc.toString();
    // any saga may carry a prelude; puzzle levels get the command PRELUDE first
    const parts = [];
    if (world) parts.push(PRELUDE);
    if ((world || domLevel) && currentSaga.prelude) parts.push(currentSaga.prelude);
    parts.push(src);
    runtime.run(parts.join("\n"));
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
    // Let the browser paint before the synchronous eval blocks the thread.
    statusEl.textContent = STATUS_TEXT.running;
    statusEl.className = "status running";
    runButton.disabled = true;
    stepButton.disabled = true;
    await sleep(20);
    evalUserCode();
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

const editor = new EditorView({
    doc: SAMPLE,
    parent: document.getElementById("editor"),
    extensions: [
        keymap.of([{ key: "Mod-Enter", run: () => { runCode(); return true; } }]),
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
clearButton.addEventListener("click", () => { outputEl.textContent = ""; });
exampleButton.addEventListener("click", () => {
    setEditorText(DOM_EXAMPLE);
    editor.focus();
});
hintButton.addEventListener("click", () => {
    document.getElementById("lvl-hint").hidden = false;
});

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
};

setSaga(SAGAS[0].id);
runtime.init();
