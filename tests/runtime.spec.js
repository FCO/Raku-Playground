// Runtime shim + free-play behavior: stdout decoding, stderr routing,
// exceptions, exit, and the preview pane.
const { test, expect } = require("@playwright/test");
const { boot, waitIdle, runProgram, outputText, stderrText, clearOutput } = require("./helpers");

test.describe.configure({ mode: "serial" });

let page;

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toContainText("Loading Raku runtime");
    await expect(page.locator("#run")).toBeDisabled();
    await boot(page);
    await page.evaluate(() => window.__playground.setSaga("free"));
});

test.afterAll(async ({ browser }) => {
    // guard the teardown: a hung browser shutdown must not fail the run
    await page.close().catch(() => {});
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]).catch(() => {});
});

test("runtime becomes ready and Run enables", async () => {
    await expect(page.locator("#status")).toHaveText("Ready");
    await expect(page.locator("#run")).toBeEnabled();
});

test("Cmd/Ctrl+Enter runs the code from any focus", async () => {
    await clearOutput(page);
    await page.evaluate(() => {
        const { editor } = window.__playground;
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: "say 'via shortcut';" } });
    });
    await page.click("#output"); // focus explicitly OUTSIDE the editor
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await waitIdle(page);
    expect(await outputText(page)).toContain("via shortcut");
    // and from inside the editor (CodeMirror's own keymap)
    await clearOutput(page);
    await page.click("#editor .cm-content");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await waitIdle(page);
    expect(await outputText(page)).toContain("via shortcut");
});

test("say prints to the output pane", async () => {
    await clearOutput(page);
    await runProgram(page, 'say 42;');
    expect(await outputText(page)).toMatch(/(^|\n)42\n?/);
});

test("HTML-encoded stdout is decoded, not rendered", async () => {
    await clearOutput(page);
    await runProgram(page, 'say "<b>&</b>";');
    expect(await outputText(page)).toContain("<b>&</b>");
    expect(await page.locator("#output b").count()).toBe(0);
});

test("note goes to the stderr style", async () => {
    await clearOutput(page);
    await runProgram(page, 'note "warning-here";');
    expect(await stderrText(page)).toContain("warning-here");
});

test("die message is shown", async () => {
    await clearOutput(page);
    await runProgram(page, 'die "boom-here";');
    expect(await outputText(page)).toContain("boom-here");
});

test("compile errors render as clean text", async () => {
    await clearOutput(page);
    await runProgram(page, 'say $undeclared;');
    const out = await outputText(page);
    expect(out).toContain("not declared");
    expect(out).not.toContain("span style");
});

test("exit is clean and the runtime stays usable", async () => {
    await clearOutput(page);
    await runProgram(page, 'say "before-exit"; exit; say "after-exit";');
    expect((await stderrText(page)).trim()).toBe("");
    await runProgram(page, 'say "still-alive";');
    expect(await outputText(page)).toContain("still-alive");
});

test("free-play preview: placeholder, DOM example renders, cleared on next run", async () => {
    expect(await page.$eval("#preview", (el) => el.matches(":empty"))).toBe(true);
    await clearOutput(page);
    await page.click("#example");
    await page.evaluate(() => window.__playground.runCode());
    await waitIdle(page);
    await expect(page.locator("#preview h2")).toHaveText("Hello from Raku!");
    expect(await page.locator("#preview p").count()).toBe(3);
    expect(await outputText(page)).toContain("rendered!");
    await runProgram(page, 'say 42;');
    expect(await page.$eval("#preview", (el) => el.matches(":empty"))).toBe(true);
});
