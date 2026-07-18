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

// ---- Shiki Raku highlighting + theme chooser ----

// distinct inline token colors codemirror-shiki paints onto .cm-content spans
const tokenColors = () =>
    page.$$eval(".cm-content span[style*='color']", (ss) =>
        [...new Set(ss.map((s) => s.style.color))]);

test("the theme chooser lists the bundled Shiki themes", async () => {
    const opts = await page.$$eval("#theme option", (os) => os.map((o) => o.value));
    expect(opts.length).toBeGreaterThanOrEqual(6);
    expect(opts[0]).toBe("one-dark-pro"); // default matches the previous look
});

test("Raku code gets real syntax colors from the Shiki grammar", async () => {
    await setDoc('my $x = "hi"; # c\nsay $x xx 2;');
    // the highlighter loads async; wait for coloured token spans to appear
    await page.waitForFunction(
        () => document.querySelectorAll(".cm-content span[style*='color']").length > 2,
        null, { timeout: 20000 });
    expect((await tokenColors()).length).toBeGreaterThanOrEqual(3); // keyword/var/string/comment differ
});

// background colour the theme paints on the line-number gutter
const gutterBg = () =>
    page.$eval(".cm-gutters", (el) => getComputedStyle(el).backgroundColor);
// colours present on a given 1-based editor line (proves it re-highlighted)
const lineColors = (n) =>
    page.evaluate((n) => {
        const line = document.querySelectorAll(".cm-content .cm-line")[n - 1];
        return line ? [...line.querySelectorAll("span[style*='color']")].length : 0;
    }, n);

test("switching theme recolors the WHOLE editor, gutter included, and persists", async () => {
    // preceding test left a 2-line doc; both lines must recolour, not just the cursor line
    const beforeTokens = (await tokenColors()).join();
    const beforeGutter = await gutterBg();
    expect(await lineColors(2)).toBeGreaterThan(0);

    await page.selectOption("#theme", "nord");
    // token colours change AND the non-cursor line 2 still has colour (full re-highlight)
    await page.waitForFunction(
        (prev) => {
            const now = [...new Set([...document.querySelectorAll(".cm-content span[style*='color']")]
                .map((s) => s.style.color))].join();
            return now && now !== prev;
        },
        beforeTokens, { timeout: 20000 });
    expect(await lineColors(2)).toBeGreaterThan(0);       // line 2 recoloured, not left stale
    expect(await gutterBg()).not.toBe(beforeGutter);      // gutter follows the theme
    expect(await page.evaluate(() => localStorage.getItem("raku-playground-theme"))).toBe("nord");

    // choice survives a reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__playground && window.__playground.editor);
    expect(await page.$eval("#theme", (el) => el.value)).toBe("nord");
});
