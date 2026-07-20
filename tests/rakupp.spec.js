// Smoke test for the rakupp runtime (the WASM C++ Raku interpreter, docs/rakujs.*)
// selected via ?runtime=rakupp. The default runtime (perl6.js) is covered by the
// other specs; this file proves the toggle boots rakupp, streams plain stdout/
// stderr, and that the in-Raku puzzle-world port (docs/world-engine.js) animates
// a solution to success. rakupp is ~4.9 MB, so it loads fast.
const { test, expect, chromium } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

let page;
let browser;

test.beforeAll(async () => {
    // Own browser per spec file (see CLAUDE.md): a worker can run several files,
    // and closing a shared fixture browser in one afterAll strands the next file.
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.goto("/?runtime=rakupp", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("raku-playground-tour-seen", "1");
    });
    await page.reload({ waitUntil: "domcontentloaded" }); // reload keeps ?runtime=
    await page.waitForFunction(
        () => window.__playground && window.__playground.runtime.state === "ready",
        undefined, { timeout: 200_000, polling: 500 });
    await page.selectOption("#speed", "80").catch(() => {});
});

test.afterAll(async () => {
    await page.close().catch(() => {});
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]).catch(() => {});
});

const waitIdle = (p) =>
    p.waitForFunction(() => window.__playground.runtime.state === "ready" && !window.__playground.isPlaying(),
        undefined, { timeout: 120_000, polling: 250 }).then(() => p.waitForTimeout(400));

async function run(p, code) {
    await p.evaluate((src) => {
        const { editor, runCode } = window.__playground;
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: src } });
        runCode();
    }, code);
    await waitIdle(p);
}

const banner = (p) => p.evaluate(() => {
    const el = [...document.querySelectorAll("#world .banner, #dom-banner")]
        .find((b) => !b.hidden && b.offsetParent !== null);
    return el ? { text: el.textContent.trim(), success: el.classList.contains("success") } : null;
});

test("the rakupp runtime is the active one", async () => {
    expect(await page.evaluate(() => window.__playground.runtime.runtimeName)).toBe("rakupp");
});

test("free play streams plain stdout and stderr", async () => {
    await page.evaluate(() => window.__playground.setSaga("free"));
    await run(page, 'say 41 + 1;\nnote "an-error-line";\nsay "hi " ~ "rakupp";');
    const out = await page.locator("#output").innerText();
    expect(out).toMatch(/\b42\b/);
    expect(out).toMatch(/hi rakupp/);
    expect(await page.$$eval("#output .stderr", (els) => els.map((e) => e.textContent).join("")))
        .toMatch(/an-error-line/);
});

test("the in-Raku puzzle world animates a solution to success", async () => {
    await page.evaluate(() => window.__playground.setSaga("learn-raku"));
    const solution = await page.evaluate(() => window.__playground.levels[0].solution);
    await run(page, solution);
    const b = await banner(page);
    expect(b).not.toBeNull();
    expect(b.success).toBe(true);
});

test("an output-checked saga level passes on rakupp", async () => {
    await page.evaluate(() => window.__playground.setSaga("containers"));
    const solution = await page.evaluate(() => window.__playground.levels[0].solution);
    await run(page, solution);
    const b = await banner(page);
    expect(b && b.success).toBe(true);
});

test("a perl6Only level does not block progression on rakupp", async () => {
    // quoting[1] (interpolating «» word-quotes) needs perl6.js. After clearing
    // level 0, the gap level must not lock level 2 — levelBlocked() skips it.
    await page.evaluate(() => window.__playground.setSaga("quoting"));
    const sol0 = await page.evaluate(() => window.__playground.levels[0].solution);
    await run(page, sol0); // complete level 0 so the gap at 1 is the only thing between us and 2
    await page.evaluate(() => window.__playground.setLevel("2")); // Heredocs, past the gap
    expect(await page.inputValue("#level")).toBe("2");
});
