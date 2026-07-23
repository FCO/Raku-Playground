// First-run onboarding tour: a spotlight coach-mark walkthrough of the panes
// and buttons. Dims the page, cuts a bright "hole" around one element at a
// time (box-shadow trick), and floats a tooltip card next to it. Auto-runs
// once (persisted in localStorage under raku-playground-tour-seen); the header
// "?" button replays it anytime.
//
// Self-contained on purpose (no imports): the single-file build bundles this
// via the playground.js import, and there are no external deps to inline.

const SEEN_KEY = "raku-playground-tour-seen";

// Failure-tolerant storage (blocked cookies / some file:// setups throw) —
// same tolerant pattern the progress code uses in playground.js.
function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* the flag just won't persist */ }
}

// { target: CSS selector | null, title, body }. A null target = a centered
// card with no spotlight (welcome / finish). HTML in body is trusted — these
// strings are authored here, never user input.
const STEPS = [
    {
        target: null,
        title: "Welcome to Raku Playground \u{1F98B}",
        body: "Run Raku right in your browser — no install. Here's a quick tour of the parts. Use <b>Next</b> / <b>Back</b>, or skip anytime.",
    },
    {
        target: "#saga",
        title: "Sagas",
        body: "Pick a course. Each saga is a themed set of lessons — Learn Raku, Quoting, Grammars, and more.",
    },
    {
        target: "#level",
        title: "Levels",
        body: "Lessons within the saga. They unlock in order as you finish them; <b>Free play</b> is always open for experimenting.",
    },
    {
        target: "#instructions",
        title: "Instructions",
        body: "The level's goal, plus step-by-step guidance, an explanation, and a hint under “Steps &amp; explanation”.",
    },
    {
        target: "#editor",
        title: "Editor",
        body: "Write your Raku code here, with syntax highlighting. This is where you solve each level.",
    },
    {
        target: "#run",
        title: "Run",
        body: "Runs your code (⌘/Ctrl-Enter). While it runs a <b>Stop</b> button appears here so you can cancel a runaway loop.",
    },
    {
        target: "#step",
        title: "Step",
        body: "On puzzle levels, walk through your program one command at a time to see exactly what each line does.",
    },
    {
        target: "#speed",
        title: "Speed",
        body: "How fast the puzzle animation plays back — slow it down to follow along, or speed it up once you know the answer.",
    },
    {
        target: "#world",
        title: "The world",
        body: "Watch Camelia follow your commands and collect gems. <b>Drag to rotate</b> the board for a better view.",
    },
    {
        target: "#output",
        title: "Output",
        body: "Everything your program prints (<code>say</code>, <code>note</code>) shows here. <b>Clear output</b> empties it.",
    },
    {
        target: "#runtime",
        title: "Runtime",
        body: "Choose which Raku runs your code. <b>Rakudo (perl6.js)</b> is the default — the complete, battle-tested engine. <b>rakupp</b> is a compact WebAssembly build that's far smaller to download and can feel faster, but it's still <b>experimental</b>: a few lessons need Rakudo and show a ⚠ when rakupp is selected. <b>Rakudo (WASM MoarVM)</b> is the real Rakudo compiler on WebAssembly — full language support like the default, in a lighter download. Switching reloads the page.",
    },
    {
        target: null,
        title: "You're all set!",
        body: "Press <b>Run</b> to try the first level. Reopen this tour anytime with the <b>?</b> button in the header.",
    },
];

const MARGIN = 12;   // gap between spotlight and card / viewport edge
const PAD = 6;       // spotlight padding around the target

let overlay = null;  // { root, hole, card, ... } while the tour is open
let steps = [];      // the visible steps for this run (hidden targets filtered per-step)
let index = 0;

function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

// Resolve a step's target element, or null for centered steps.
function targetOf(step) {
    return step.target ? document.querySelector(step.target) : null;
}

function build() {
    const root = document.createElement("div");
    root.className = "tour-root";

    const hole = document.createElement("div");
    hole.className = "tour-hole";

    const card = document.createElement("div");
    card.className = "tour-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "tour-title");
    card.tabIndex = -1;

    const counter = document.createElement("div");
    counter.className = "tour-counter";

    const title = document.createElement("h3");
    title.className = "tour-title";
    title.id = "tour-title";

    const body = document.createElement("p");
    body.className = "tour-body";

    const buttons = document.createElement("div");
    buttons.className = "tour-buttons";

    const skip = document.createElement("button");
    skip.className = "tour-skip";
    skip.textContent = "Skip tour";
    skip.addEventListener("click", () => end(true));

    const spacer = document.createElement("span");
    spacer.className = "tour-spacer";

    const back = document.createElement("button");
    back.className = "tour-back";
    back.textContent = "Back";
    back.addEventListener("click", () => go(index - 1));

    const next = document.createElement("button");
    next.className = "tour-next";
    next.addEventListener("click", () => go(index + 1));

    buttons.append(skip, spacer, back, next);
    card.append(counter, title, body, buttons);
    root.append(hole, card);
    document.body.appendChild(root);

    overlay = { root, hole, card, counter, title, body, back, next };

    // The tour ends only via an explicit action — the "Skip tour" button, the
    // final "Done", or Esc. Clicking the dimmed area does nothing on purpose,
    // so an accidental click-out never dismisses it.
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", position);
}

function onKey(e) {
    if (!overlay) return;
    if (e.key === "Escape") { e.preventDefault(); end(true); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); go(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
}

function go(i) {
    if (i < 0) return;
    if (i >= steps.length) { end(true); return; }
    index = i;
    render();
}

function render() {
    const step = steps[index];
    overlay.counter.textContent = `${index + 1} / ${steps.length}`;
    overlay.title.textContent = step.title;
    overlay.body.innerHTML = step.body;
    overlay.back.hidden = index === 0;
    overlay.next.textContent = index === steps.length - 1 ? "Done" : "Next";
    position();
    overlay.card.focus();
}

// Place the spotlight over the current target and the card in the best-fitting
// free space around it; centered (no spotlight) for null-target steps.
function position() {
    if (!overlay) return;
    const step = steps[index];
    const el = targetOf(step);
    const card = overlay.card;
    const hole = overlay.hole;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!el || !isVisible(el)) {
        hole.hidden = true;
        overlay.root.classList.add("tour-centered");
        card.style.left = "";
        card.style.top = "";
        return;
    }

    overlay.root.classList.remove("tour-centered");
    hole.hidden = false;
    const r = el.getBoundingClientRect();
    const hx = Math.max(0, r.left - PAD);
    const hy = Math.max(0, r.top - PAD);
    const hw = Math.min(vw, r.right + PAD) - hx;
    const hh = Math.min(vh, r.bottom + PAD) - hy;
    hole.style.left = `${hx}px`;
    hole.style.top = `${hy}px`;
    hole.style.width = `${hw}px`;
    hole.style.height = `${hh}px`;

    // On phones we pin the card to the bottom (CSS handles it); skip float math.
    if (window.matchMedia("(max-width: 700px)").matches) {
        card.style.left = "";
        card.style.top = "";
        return;
    }

    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const below = vh - (hy + hh);
    const above = hy;
    const right = vw - (hx + hw);

    let left;
    let top;
    if (below >= ch + MARGIN) {            // prefer below the target
        top = hy + hh + MARGIN;
        left = clamp(hx, MARGIN, vw - cw - MARGIN);
    } else if (above >= ch + MARGIN) {     // then above
        top = hy - ch - MARGIN;
        left = clamp(hx, MARGIN, vw - cw - MARGIN);
    } else if (right >= cw + MARGIN) {     // then to the right
        left = hx + hw + MARGIN;
        top = clamp(hy, MARGIN, vh - ch - MARGIN);
    } else {                               // then to the left
        left = clamp(hx - cw - MARGIN, MARGIN, vw - cw - MARGIN);
        top = clamp(hy, MARGIN, vh - ch - MARGIN);
    }
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function end(markSeen) {
    if (!overlay) return;
    if (markSeen) storageSet(SEEN_KEY, "1");
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", position);
    overlay.root.remove();
    overlay = null;
    steps = [];
    index = 0;
}

// Force-open the tour (ignores the seen flag). Skips steps whose target is
// currently hidden (e.g. #world/#speed/#step in free/dom mode).
export function startTour() {
    if (overlay) return;
    steps = STEPS.filter((s) => !s.target || isVisible(document.querySelector(s.target)));
    if (steps.length === 0) return;
    index = 0;
    build();
    render();
}

// Auto-run once for first-time visitors. Deferred so layout has settled.
export function maybeAutoStartTour() {
    if (storageGet(SEEN_KEY)) return;
    requestAnimationFrame(() => requestAnimationFrame(startTour));
}
