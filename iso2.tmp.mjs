import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const candidates = [
    ["plain-range-seq", "say (1 ... 5).join(' ');"],
    ["deduced-geometric", "my \\s = 1, 2, 4 ... 64; say s.join(' ');"],
    ["one-arg-whatever", "my \\s = 1, * * 2 ... 64; say s.join(' ');"],
    ["lazy-gather", "my \\g = lazy gather { for 1..Inf -> $i { take $i * $i } }; say g[4];"],
    ["fib-via-anon-state", "my \\fib = (1..Inf).map({ state ($a, $b) = 1, 1; my $r = $a; ($a, $b) = $b, $a + $b; $r }); say fib[^8].join(' ');"],
];
for (const [name, code] of candidates) {
    const page = await browser.newPage();
    await page.goto("http://localhost:8000/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__playground && window.__playground.runtime.state === "ready", undefined, { timeout: 240000, polling: 500 });
    await page.evaluate(() => window.__playground.setSaga("free"));
    await page.evaluate((src) => {
        const { editor, runCode } = window.__playground;
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: src } });
        runCode();
    }, code);
    try {
        await page.waitForFunction(() => window.__playground.runtime.state === "ready" && !window.__playground.isPlaying(), undefined, { timeout: 25000 });
        const out = (await page.locator("#output").innerText()).split("—").pop().trim();
        console.log(`${name}: OK -> ${out.replaceAll("\n", " ⏎ ").slice(0, 140)}`);
    } catch {
        console.log(`${name}: FROZE`);
    }
    await page.close();
}
await browser.close();
