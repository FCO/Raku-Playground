// Snake Arena saga: the whole simulation runs in Raku inside the worker and
// streams presentation events (@@SN@@ lines) the main thread animates. Verifies
// each level's reference solution wins, a suicidal program fails, and the
// event/animation plumbing (grid, snake segments, food, HUD, Next-level) works.
const { test, expect, chromium } = require("@playwright/test");
const { boot, waitIdle, runProgram, bannerState } = require("./helpers");

test.describe.configure({ mode: "serial" });

let page;
let browser;
let levels;

test.beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await boot(page);
    await page.selectOption("#speed", "80"); // fastest playback
    await page.evaluate(() => window.__playground.setSaga("snake"));
    levels = await page.evaluate(() => window.__playground.levels.map((l) => l.name));
    // unlock the whole saga so tests can jump to any level
    await page.evaluate((n) => {
        localStorage.setItem("raku-playground-progress:snake",
            JSON.stringify([...Array(n).keys()]));
        window.__playground.setSaga("snake");
    }, levels.length);
});

test.afterAll(async () => {
    await page.close().catch(() => {});
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]).catch(() => {});
});

test("the Raku engine boots and the first solution survives", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    const solution = await page.evaluate(() => window.__playground.levels[0].solution);
    await runProgram(page, solution);
    const banner = await bannerState(page);
    expect(banner, "no banner").not.toBeNull();
    expect(banner.success, banner.text).toBe(true);
    // grid, snake segments and HUD were rendered
    expect(await page.locator("#arena .arena-grid").count()).toBe(1);
    expect(await page.locator("#arena .arena-seg.s0").count()).toBeGreaterThan(0);
    expect(await page.locator("#arena .bldg-hud").innerText()).toMatch(/🐍/);
});

test("a suicidal program fails the level", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    // always drive into the left wall → dies before the survive goal
    await runProgram(page, "sub move($you, $board) { 'left' }");
    const banner = await bannerState(page);
    expect(banner.success).toBe(false);
    expect(banner.text).toMatch(/try again/i);
});

test("a program that fails to compile does NOT pass the level", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    // typo: $jead is undeclared → the whole unit fails to compile, no sim runs.
    // The engine never emits its end-of-run event, so the level must fail.
    await runProgram(page, "sub move($you, $board) { my $head = $you.head; $jead.x }");
    const banner = await bannerState(page);
    expect(banner.success, banner && banner.text).toBe(false);
    // and the compile error is surfaced in the output pane
    expect(await page.locator("#output").innerText()).toMatch(/not declared|Undeclared/i);
});

test("every snake solution wins and offers Next", async () => {
    const n = levels.length;
    for (let i = 0; i < n; i++) {
        await page.evaluate((i) => window.__playground.setLevel(String(i)), i);
        expect(await page.inputValue("#level"), `level ${i + 1} selectable`).toBe(String(i));
        const solution = await page.evaluate((i) => window.__playground.levels[i].solution, i);
        await runProgram(page, solution);
        const banner = await bannerState(page);
        expect(banner, `level ${i + 1} (${levels[i]}) banner`).not.toBeNull();
        expect(banner.success, `level ${i + 1} (${levels[i]}): ${banner.text}`).toBe(true);
        if (i + 1 < n) expect(banner.hasNext, `level ${i + 1} Next`).toBe(true);
    }
});

test("the Rival Run level renders a second snake", async () => {
    const idx = levels.indexOf("Rival Run");
    await page.evaluate((i) => window.__playground.setLevel(String(i)), idx);
    const solution = await page.evaluate((i) => window.__playground.levels[i].solution, idx);
    await runProgram(page, solution);
    expect(await page.locator("#arena .arena-seg.s1").count()).toBeGreaterThan(0);
});
