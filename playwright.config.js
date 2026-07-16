// Browser tests for the playground. Uses the locally installed Chrome
// (channel: "chrome") so no browser download is needed, and serves docs/
// with Python's static server unless one is already running on :8000.
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
        // locally: the installed Chrome (no download); CI: Playwright's chromium
        channel: process.env.CI ? undefined : "chrome",
        headless: true,
        viewport: { width: 1400, height: 900 },
    },
    webServer: {
        command: "python3 -m http.server 8000 --directory docs",
        port: 8000,
        reuseExistingServer: true,
    },
});
