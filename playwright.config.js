// Browser tests for the playground. Uses Playwright's bundled Chromium
// everywhere (`npx playwright install chromium` once) — the system Chrome
// channel hangs at shutdown often enough to fail whole runs. Serves docs/
// with the Raku static server (tools/serve.raku) unless one is already
// running on :8000.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "tests",
    timeout: 600_000,        // 77MB runtime + Web Worker execution under CI contention
    expect: { timeout: 15_000 },
    // One browser per spec file (each afterAll closes its own browser — sharing
    // one browser across files would let the first teardown close it for the
    // rest). The runtime now runs in a Web Worker, so 3 browsers on CI's 2 cores
    // contend and run slower; the generous timeout above and interval polling in
    // waitIdle (not frame-rate, which steals cycles from the worker) absorb it.
    workers: 3,
    reporter: [["list"]],
    forbidOnly: !!process.env.CI,
    use: {
        baseURL: "http://localhost:8000",
        headless: true,
        viewport: { width: 1400, height: 900 },
    },
    webServer: {
        command: "raku tools/serve.raku --port=8000 --dir=docs",
        port: 8000,
        reuseExistingServer: true,
    },
});
