// Editor keybindings (docs/playground.js): Tab / Shift-Tab indentation and the
// Escape focus-release hatch. These act on the CodeMirror editor alone, so this
// spec never waits for the 77 MB runtime — it only drives the editor, which is
// present immediately. The first-run tour is suppressed (its Esc handler would
// otherwise swallow the Escape test).
const { test, expect, chromium } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

let page;
let browser;

// Read / replace the whole editor document via the exposed testing handle.
const docText = () =>
    page.evaluate(() => window.__playground.editor.state.doc.toString());
const setDoc = (text) =>
    page.evaluate((text) => {
        const e = window.__playground.editor;
        e.dispatch({
            changes: { from: 0, to: e.state.doc.length, insert: text },
            selection: { anchor: text.length },
        });
        e.focus();
    }, text);
const hasFocus = () => page.evaluate(() => window.__playground.editor.hasFocus);

test.beforeAll(async () => {
    // Own browser per spec file (not the worker-scoped fixture): a worker can
    // run several files, and closing a fixture browser in one file's afterAll
    // would leave the next file on that worker with a closed browser.
    browser = await chromium.launch();
    page = await browser.newPage();
    // Suppress the first-run tour so its capture-phase Esc handler doesn't
    // swallow the Escape our focus-release test presses.
    await page.addInitScript(() =>
        localStorage.setItem("raku-playground-tour-seen", "1"));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__playground && window.__playground.editor);
});

test.afterAll(async () => {
    // guard the teardown: a hung browser shutdown must not fail the run
    await page.close().catch(() => {});
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]).catch(() => {});
});

test("Tab inserts four spaces at the cursor", async () => {
    await setDoc("say 1;");
    await page.keyboard.press("End");
    await page.keyboard.press("Tab");
    expect(await docText()).toBe("say 1;    ");
});

test("Tab on a multi-line selection indents every line", async () => {
    await setDoc("a\nb\nc");
    await page.keyboard.press("ControlOrMeta+a"); // select all (Mod-a — Meta on macOS, Control on CI)
    await page.keyboard.press("Tab");
    expect(await docText()).toBe("    a\n    b\n    c");
});

test("Shift-Tab dedents every selected line", async () => {
    await setDoc("    a\n    b\n    c");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Shift+Tab");
    expect(await docText()).toBe("a\nb\nc");
});

test("Shift-Tab removes at most four leading spaces per line", async () => {
    await setDoc("      x"); // 6 spaces
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Shift+Tab");
    expect(await docText()).toBe("  x"); // 4 removed, 2 remain
});

test("Escape releases editor focus", async () => {
    await page.evaluate(() => window.__playground.editor.focus());
    expect(await hasFocus()).toBe(true);
    await page.keyboard.press("Escape");
    expect(await hasFocus()).toBe(false);
});
