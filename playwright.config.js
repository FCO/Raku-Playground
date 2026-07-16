// Browser tests for the playground. Uses Playwright's bundled Chromium
// everywhere (`npx playwright install chromium` once) — the system Chrome
// channel hangs at shutdown often enough to fail whole runs. Serves docs/
// with the Raku static server (tools/serve.raku) unless one is already
// running on :8000.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "tests",
    timeout: 240_000,        // the 77MB runtime takes a while on first load
    expect: { timeout: 15_000 },
    workers: 3,              // one per spec file; specs are serial inside
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
