// Elevator saga: the whole simulation runs in Raku inside the worker and streams
// presentation events (@@EV@@ lines) the main thread animates. Verifies each
// level's reference solution wins, a no-op program fails, and the event/animation
// plumbing (cars, HUD, Next-level) works end to end.
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
    await page.evaluate(() => window.__playground.setSaga("elevator"));
    levels = await page.evaluate(() => window.__playground.levels.map((l) => l.name));
    // unlock the whole saga so tests can jump to any level
    await page.evaluate((n) => {
        localStorage.setItem("raku-playground-progress:elevator",
            JSON.stringify([...Array(n).keys()]));
        window.__playground.setSaga("elevator");
    }, levels.length);
});

test.afterAll(async () => {
    await page.close().catch(() => {});
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]).catch(() => {});
});

test("the Raku engine boots and the first solution transports people", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    const solution = await page.evaluate(() => window.__playground.levels[0].solution);
    await runProgram(page, solution);
    const banner = await bannerState(page);
    expect(banner, "no banner").not.toBeNull();
    expect(banner.success, banner.text).toBe(true);
    expect(banner.text).toMatch(/Transported \d+/);
    // cars and HUD were rendered
    expect(await page.locator("#building .bldg-car").count()).toBe(1);
    expect(await page.locator("#building .bldg-hud").innerText()).toMatch(/🧍/);
});

test("a do-nothing program fails the level", async () => {
    await page.evaluate(() => window.__playground.setLevel("0"));
    await runProgram(page, "sub init(@e, @f) { }\nsub update($dt, @e, @f) { }");
    const banner = await bannerState(page);
    expect(banner.success).toBe(false);
    expect(banner.text).toMatch(/try again/i);
});

test("every elevator solution wins and offers Next", async () => {
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

test("the Two Cars level actually renders two cars", async () => {
    const idx = levels.indexOf("Two Cars");
    await page.evaluate((i) => window.__playground.setLevel(String(i)), idx);
    expect(await page.locator("#building .bldg-car").count()).toBe(2);
});
