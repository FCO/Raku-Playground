// Browser tests for the playground. Uses Playwright's bundled Chromium
// everywhere (`npx playwright install chromium` once) — the system Chrome
// channel hangs at shutdown often enough to fail whole runs. Serves docs/
// with the Raku static server (tools/serve.raku) unless one is already
// running on :8000.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "tests",
    timeout: 360_000,        // the 77MB runtime takes a while on first load
    expect: { timeout: 15_000 },
    // The runtime runs in a Web Worker, so each browser now has two hot threads
    // (page + worker). Running 3 browsers at once oversubscribes CI's 2 cores
    // and slows every run ~5x, so go single-file on CI; keep parallelism locally.
    workers: process.env.CI ? 1 : 3,
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
