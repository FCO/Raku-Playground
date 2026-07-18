// Saga system: listing, per-saga locked progression, every level's reference
// solution must beat its level, Next-level flow, dom-level re-runs.
const { test, expect } = require("@playwright/test");
const { boot, waitIdle, runProgram, bannerState } = require("./helpers");

test.describe.configure({ mode: "serial" });

let page;
let sagas;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await boot(page);
    await page.selectOption("#speed", "80");
    sagas = await page.evaluate(() =>
        window.__playground.sagas.map((s) => ({ id: s.id, n: s.levels.length })));
});

test.afterAll(async ({ browser }) => {
    // guard the teardown: a hung browser shutdown must not fail the run
    await page.close().catch(() => {});
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]).catch(() => {});
});

test("saga select lists every saga plus free play", async () => {
    const values = await page.$$eval("#saga option", (opts) => opts.map((o) => o.value));
    for (const saga of await page.evaluate(() => window.__playground.sagas.map((s) => s.id)))
        expect(values).toContain(saga);
    expect(values).toContain("free");
});

test("instructions panel shows goal and explanations", async () => {
    await page.evaluate(() => window.__playground.setSaga("learn-raku"));
    await expect(page.locator("#lvl-name")).toHaveText("Issuing Commands");
    expect(await page.locator("#lvl-explain p").count()).toBeGreaterThanOrEqual(3);
});

test("levels beyond progress are locked and jumping ahead is refused", async () => {
    await page.evaluate(() => window.__playground.setSaga("learn-raku"));
    expect(await page.$eval("#level option[value='1']", (o) => o.disabled)).toBe(true);
    expect(await page.$eval("#level option[value='1']", (o) => o.textContent)).toContain("🔒");
    await page.evaluate(() => window.__playground.setLevel("5"));
    expect(await page.inputValue("#level")).toBe("0");
});

test("every saga's solutions win in sequence and unlock the whole saga", async () => {
    for (const saga of sagas) {
        await page.evaluate((id) => window.__playground.setSaga(id), saga.id);
        for (let i = 0; i < saga.n; i++) {
            await page.evaluate((i) => window.__playground.setLevel(String(i)), i);
            expect(await page.inputValue("#level"), `${saga.id} level ${i + 1} selectable`).toBe(String(i));
            const solution = await page.evaluate((i) => window.__playground.levels[i].solution, i);
            await runProgram(page, solution);
            const banner = await bannerState(page);
            expect(banner, `${saga.id} level ${i + 1} banner`).not.toBeNull();
            expect(banner.success, `${saga.id} level ${i + 1}: ${banner.text}`).toBe(true);
        }
        const labels = await page.$$eval("#level option", (opts) =>
            opts.map((o) => ({ t: o.textContent, d: o.disabled })));
        for (const l of labels) {
            expect(l.t.startsWith("✓"), `${saga.id}: ${l.t}`).toBe(true);
            expect(l.d).toBe(false);
        }
    }
});

test("success banner offers Next level and it advances", async () => {
    await page.evaluate(() => { window.__playground.setSaga("learn-raku"); window.__playground.setLevel("0"); });
    await runProgram(page, "move-forward xx 3;\ncollect-gem;");
    const banner = await bannerState(page);
    expect(banner.success).toBe(true);
    expect(banner.hasNext).toBe(true);
    await page.click("#world .banner .next-level");
    expect(await page.inputValue("#level")).toBe("1");
});

test("grammars renders match highlights via the worker channel, re-runs cleanly", async () => {
    await page.evaluate(() => { window.__playground.setSaga("grammars"); window.__playground.setLevel("0"); });
    const solution = await page.evaluate(() => window.__playground.levels[0].solution);
    await runProgram(page, solution);
    await runProgram(page, solution); // re-run: preview cleared, marks not duplicated
    const marks = await page.$$eval("#preview mark", (els) => els.map((m) => m.textContent));
    expect(marks).toEqual(["gem"]);
    const banner = await bannerState(page);
    expect(banner.success, banner && banner.text).toBe(true);
});

test("controls are locked while a run is playing", async () => {
    await page.evaluate(() => { window.__playground.setSaga("learn-raku"); window.__playground.setLevel("0"); });
    await page.selectOption("#speed", "800"); // slow enough to observe mid-playback
    await page.evaluate(() => {
        const { editor, runCode } = window.__playground;
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: "move-forward xx 3;" } });
        runCode();
    });
    await page.waitForFunction(() => window.__playground.isPlaying());
    await expect(page.locator("#saga")).toBeDisabled();
    await expect(page.locator("#level")).toBeDisabled();
    await expect(page.locator("#run")).toBeDisabled();
    await waitIdle(page);
    await expect(page.locator("#saga")).toBeEnabled();
    await page.selectOption("#speed", "80");
});
