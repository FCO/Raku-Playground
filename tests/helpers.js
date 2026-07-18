// Shared helpers for the playground browser tests. The page exposes
// window.__playground = { editor, runtime, runCode, stepCode, setSaga,
// setLevel, getWorld, isPlaying, sagas, levels, progress } for scripting.

const idle = () =>
    window.__playground.runtime.state === "ready" && !window.__playground.isPlaying();

// Fresh page: navigate, wipe stored progress, wait for the runtime.
async function boot(page) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
        () => window.__playground && window.__playground.runtime.state === "ready",
        undefined,
        { timeout: 200_000, polling: 500 },
    );
}

async function waitIdle(page) {
    // Poll at an interval rather than every frame: the runtime is in a worker,
    // and frame-rate polling on the page thread steals cycles from it.
    await page.waitForFunction(idle, undefined, { timeout: 120_000, polling: 250 });
    await page.waitForTimeout(400); // stderr grace window
}

// Set the editor content and run it through the real UI path.
async function runProgram(page, code) {
    await page.evaluate((src) => {
        const { editor, runCode } = window.__playground;
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: src } });
        runCode();
    }, code);
    await waitIdle(page);
}

const outputText = (page) => page.locator("#output").innerText();

const stderrText = (page) =>
    page.$$eval("#output .stderr", (els) => els.map((el) => el.textContent).join(""));

const clearOutput = (page) => page.click("#clear");

// The visible result banner: the puzzle world's or the dom strip.
function bannerState(page) {
    return page.evaluate(() => {
        const el = [...document.querySelectorAll("#world .banner, #dom-banner")]
            .find((b) => !b.hidden && b.offsetParent !== null);
        return el ? {
            text: el.textContent,
            success: el.classList.contains("success"),
            hasNext: el.querySelector(".next-level") !== null,
        } : null;
    });
}

function worldState(page) {
    return page.evaluate(() => {
        const w = window.__playground.getWorld();
        return w ? {
            x: w.sim.x, y: w.sim.y, dead: w.sim.dead, collected: w.sim.collected,
            hud: document.querySelector("#world .hud").textContent,
            playIndex: w.playIndex, commands: w.commands.length,
        } : null;
    });
}

module.exports = { boot, waitIdle, runProgram, outputText, stderrText, clearOutput, bannerState, worldState };
