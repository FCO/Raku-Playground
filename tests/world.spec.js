// Puzzle-world mechanics: falling, bumping, xx semantics, command return
// values, the runaway guard after a fall, and step-through mode.
const { test, expect } = require("@playwright/test");
const { boot, runProgram, outputText, clearOutput, bannerState, worldState } = require("./helpers");

test.describe.configure({ mode: "serial" });

let page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await boot(page);
    await page.selectOption("#speed", "80");
    // unlock everything in learn-raku so tests can jump to any level
    await page.evaluate(() => {
        localStorage.setItem("raku-playground-progress:learn-raku",
            JSON.stringify([...Array(16).keys()]));
        window.__playground.setSaga("learn-raku");
    });
});

test.afterAll(async ({ browser }) => { await page.close(); await browser.close(); });

test("falling into water fails gracefully", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    await runProgram(page, "move-forward for ^5;");
    const banner = await bannerState(page);
    expect(banner.success).toBe(false);
    expect(banner.text).toContain("fell");
    expect((await worldState(page)).dead).toBe(true);
});

test("walking into a rock bumps without falling", async () => {
    await page.evaluate(() => window.__playground.setLevel("5"));
    await runProgram(page, "move-forward xx 7;");
    const ws = await worldState(page);
    expect(ws.dead).toBe(false);
    expect(ws.x).toBe(7);
    expect((await bannerState(page)).success).toBe(false);
});

test("xx repeats the action, even as the final statement", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    await runProgram(page, "move-forward xx 3;\ncollect-gem;");
    expect((await bannerState(page)).success).toBe(true);
    await runProgram(page, "collect-gem;\nmove-forward xx 3");
    const ws = await worldState(page);
    expect(ws.commands).toBe(4);
    expect(ws.x).toBe(4);
});

test("command return values are safe (x misuse, say)", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    await clearOutput(page);
    await runProgram(page, "move-forward x 3;\ncollect-gem;");
    expect(await outputText(page)).not.toContain("Type check failed");
    expect((await worldState(page)).x).toBe(2); // x evaluates once — a single step
    await clearOutput(page);
    await runProgram(page, "say move-forward;");
    expect(await outputText(page)).toMatch(/(^|\n)True\n?/);
});

test("post-fall runaway loop hits the command guard instead of freezing", async () => {
    await page.evaluate(() => window.__playground.setLevel("10")); // ring: never blocked
    await clearOutput(page);
    await runProgram(page, "while gems-left {\n move-forward;\n collect-gem if is-on-gem;\n}");
    expect(await outputText(page)).toContain("Runaway program");
    expect((await worldState(page)).dead).toBe(true);
});

test("Camelia's eyes stare where she is going (and she stays upright)", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    const look = () => page.$eval("#world .bfly-head", (el) => ({
        x: el.style.getPropertyValue("--look-x"),
        y: el.style.getPropertyValue("--look-y"),
    }));
    const east = await look(); // facing E: looking down-right on screen
    expect(east.x).toMatch(/px/);
    await runProgram(page, "turn-left;");
    const north = await look(); // facing N: vertical gaze flips upward
    expect(north.y).not.toBe(east.y);
    // she must be standing: no rotation anywhere in her sprite chain
    const rotated = await page.$eval("#world .camelia", (el) =>
        [...el.querySelectorAll("*")].some((n) => /rotate\(/.test(n.style.transform ?? "")));
    expect(rotated).toBe(false);
});

test("board scales to fit a phone-sized screen", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
        await page.evaluate(() => window.__playground.setLevel("0"));
        const { board, world } = await page.evaluate(() => ({
            board: document.querySelector("#world .board").getBoundingClientRect().toJSON(),
            world: document.getElementById("world").getBoundingClientRect().toJSON(),
        }));
        expect(board.width).toBeLessThanOrEqual(world.width);   // fits horizontally
        expect(board.width).toBeGreaterThan(world.width * 0.5); // …but stays substantial
        const scale = await page.$eval("#world .board", (el) =>
            parseFloat(el.style.getPropertyValue("--scale")));
        expect(scale).toBeLessThanOrEqual(1);
        expect(scale).toBeGreaterThan(0.2);
    } finally {
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.evaluate(() => window.__playground.setLevel("0")); // re-fit at desktop size
    }
});

test("step mode advances exactly one command per click", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    await page.evaluate(() => {
        const { editor } = window.__playground;
        editor.dispatch({
            changes: { from: 0, to: editor.state.doc.length, insert: "move-forward; move-forward; move-forward; collect-gem;" },
        });
    });
    await page.evaluate(() => window.__playground.stepCode()); // records
    await page.waitForFunction(() => window.__playground.getWorld()?.commands.length === 4);
    for (const expected of [1, 2]) {
        await page.evaluate(() => window.__playground.stepCode());
        await page.waitForFunction((n) => window.__playground.getWorld().playIndex === n, expected);
    }
    expect((await worldState(page)).playIndex).toBe(2);
    await page.evaluate(() => window.__playground.stepCode());
    await page.waitForFunction(() => window.__playground.getWorld().playIndex === 3);
    await page.evaluate(() => window.__playground.stepCode());
    await page.waitForFunction(() => !window.__playground.isPlaying());
    expect((await bannerState(page)).success).toBe(true);
});
