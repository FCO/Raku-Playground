import { EditorView, basicSetup, keymap, StreamLanguage, perl, oneDark } from "./vendor/codemirror.js";
import { runtime } from "./raku-runtime.js";
import { LEVELS, World, PRELUDE } from "./world.js";

const statusEl = document.getElementById("status");
const runButton = document.getElementById("run");
const stepButton = document.getElementById("step");
const clearButton = document.getElementById("clear");
const exampleButton = document.getElementById("example");
const hintButton = document.getElementById("hint-btn");
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

let world = null;       // active World in puzzle mode, null in free play
let playing = false;    // animation playback (or step session) in progress
let stepSession = false;
let runCount = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    stepButton.disabled = !(idle || stepSession);
}

runtime.onStateChange(() => refreshControls());

function setEditorText(text) {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
}

// ---------- progression ----------

const PROGRESS_KEY = "raku-playground-progress";
let progress = new Set(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "[]"));

// first level not yet completed — the furthest one that may be played
function maxUnlocked() {
    let i = 0;
    while (progress.has(i)) i++;
    return i;
}

function markComplete(i) {
    if (progress.has(i)) return;
    progress.add(i);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...progress].sort((a, b) => a - b)));
    refreshLevelLabels();
}

function refreshLevelLabels() {
    for (const opt of levelSelect.options) {
        if (opt.value === "free") continue;
        const i = Number(opt.value);
        const locked = i > maxUnlocked();
        opt.disabled = locked;
        opt.textContent = `${progress.has(i) ? "✓ " : locked ? "🔒 " : ""}${i + 1}. ${LEVELS[i].name}`;
    }
}

// ---------- levels / modes ----------

let currentLevel = "0";

function setLevel(value) {
    if (value !== "free" && Number(value) > maxUnlocked()) {
        levelSelect.value = currentLevel; // locked — refuse and restore selection
        return;
    }
    currentLevel = value;
    levelSelect.value = value;
    stepSession = false;
    const free = value === "free";
    worldEl.hidden = free;
    previewEl.hidden = !free;
    exampleButton.hidden = !free;
    speedSelect.hidden = free;
    stepButton.hidden = free;

    if (free) {
        world = null;
        window.PG = undefined;
        showInstructions({
            name: "Free play",
            goal: "Write any Raku you like. Output appears below; DOM built via the PREVIEW handle appears in the preview pane.",
            steps: [],
        });
        setEditorText(SAMPLE);
    } else {
        const idx = Number(value);
        const level = LEVELS[idx];
        world = new World(level, worldEl);
        window.PG = {
            command: (name) => world.command(name),
            query: (name) => world.query(name),
        };
        world.onFinished = (res) => { if (res.success) markComplete(idx); };
        world.onNext = idx + 1 < LEVELS.length ? () => setLevel(String(idx + 1)) : null;
        world.render();
        applyView();
        showInstructions(level);
        setEditorText(level.starter);
    }
    refreshControls();
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

const view = { rx: 55, rz: 45 };

function applyView() {
    worldEl.style.setProperty("--rotX", `${view.rx}deg`);
    worldEl.style.setProperty("--rotZ", `${view.rz}deg`);
}

let dragFrom = null;
worldEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    dragFrom = { x: e.clientX, y: e.clientY, rx: view.rx, rz: view.rz };
    worldEl.setPointerCapture(e.pointerId);
});
worldEl.addEventListener("pointermove", (e) => {
    if (!dragFrom) return;
    view.rz = dragFrom.rz + (e.clientX - dragFrom.x) * 0.4;
    view.rx = Math.min(85, Math.max(15, dragFrom.rx - (e.clientY - dragFrom.y) * 0.3));
    applyView();
});
worldEl.addEventListener("pointerup", () => { dragFrom = null; });
worldEl.addEventListener("pointercancel", () => { dragFrom = null; });
applyView();

// ---------- running ----------

function evalUserCode() {
    const src = editor.state.doc.toString();
    runtime.run(world ? `${PRELUDE}\n${src}` : src);
}

async function record() {
    runCount++;
    appendOutput(`— Run #${runCount} (${new Date().toLocaleTimeString()}) —\n`, "run-separator");
    if (world) {
        world.reset();
        world.render();
    } else {
        previewEl.replaceChildren();
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
    const more = await world.stepOnce();
    if (!more) {
        world.finish();
        playing = false;
        stepSession = false;
    }
    refreshControls();
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

levelSelect.replaceChildren(
    ...LEVELS.map((level, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${i + 1}. ${level.name}`;
        return opt;
    }),
    new Option("Free play", "free"),
);
refreshLevelLabels();
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
    setLevel: (v) => setLevel(String(v)),
    getWorld: () => world,
    isPlaying: () => playing,
    levels: LEVELS,
    progress: () => [...progress],
};

setLevel("0");
runtime.init();
