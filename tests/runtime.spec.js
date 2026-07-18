// Runtime shim + free-play behavior: stdout decoding, stderr routing,
// exceptions, exit, and off-thread (worker) execution.
const { test, expect, chromium } = require("@playwright/test");
const { boot, waitIdle, runProgram, outputText, stderrText, clearOutput } = require("./helpers");

test.describe.configure({ mode: "serial" });

let page;
let browser;

test.beforeAll(async () => {
    // Own browser per spec file (not the worker-scoped fixture): a worker can
    // run several files, and closing a fixture browser in one file's afterAll
    // would leave the next file on that worker with a closed browser.
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Loading copy is dynamic now (Starting/Downloading N%/Compiling), so
    // assert the loading state rather than a specific phrase.
    await expect(page.locator("#status")).toHaveClass(/loading/);
    await expect(page.locator("#run")).toBeDisabled();
    await boot(page);
    await page.evaluate(() => window.__playground.setSaga("free"));
});

test.afterAll(async () => {
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

test("free-play is text-only (runtime runs in the worker, no DOM)", async () => {
    await clearOutput(page);
    await runProgram(page, 'say "hi from free play";');
    expect(await outputText(page)).toContain("hi from free play");
    expect(await page.$eval("#preview", (el) => el.matches(":empty"))).toBe(true);
});

test("a run executes off the main thread (async, non-blocking)", async () => {
    await clearOutput(page);
    // The run is asynchronous: the runtime flips to "running" synchronously
    // after the call returns and control comes back to us *before* it finishes —
    // impossible if evalP6 still blocked the UI thread (the old behavior). While
    // it runs, a main-thread timer keeps firing (the thread isn't frozen).
    const r = await page.evaluate(async () => {
        const { editor, runCode, runtime } = window.__playground;
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: "say [+] 1..2000000;" } });
        let ticks = 0;
        const iv = setInterval(() => { ticks++; }, 5);
        const p = runCode();
        const runningRightAfterCall = runtime.state === "running";
        await p;
        clearInterval(iv);
        return { runningRightAfterCall, readyAfter: runtime.state === "ready", ticks };
    });
    expect(r.runningRightAfterCall).toBe(true);
    expect(r.readyAfter).toBe(true);
    expect(r.ticks).toBeGreaterThan(0); // the main thread ran timers during the run
    expect(await outputText(page)).toContain("2000001000000");
});
