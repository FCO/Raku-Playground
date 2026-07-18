// First-run onboarding tour (docs/tour.js). The tour appears on load, before
// the 77 MB runtime is ready, so this spec never waits for runtime idle — it
// only drives the overlay itself, which keeps it fast.
const { test, expect } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

let page;

// Fresh page with a cleared "tour seen" flag → the tour auto-starts.
async function freshPage(browser) {
    const p = await browser.newPage();
    await p.goto("/", { waitUntil: "domcontentloaded" });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "domcontentloaded" });
    return p;
}

const SEEN_KEY = "raku-playground-tour-seen";
const total = (page) =>
    page.$eval(".tour-counter", (el) => Number(el.textContent.split("/")[1]));
const current = (page) =>
    page.$eval(".tour-counter", (el) => Number(el.textContent.split("/")[0]));

test.beforeAll(async ({ browser }) => {
    page = await freshPage(browser);
});

test.afterAll(async ({ browser }) => {
    // guard the teardown: a hung browser shutdown must not fail the run
    await page.close().catch(() => {});
    await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 15000))]).catch(() => {});
});

test("auto-starts on first visit with a welcome card", async () => {
    await page.waitForSelector(".tour-card", { timeout: 10_000 });
    expect(await current(page)).toBe(1);
    expect(await total(page)).toBeGreaterThanOrEqual(5); // several panes/buttons
    // step 1 is the centered welcome — no spotlight hole shown
    expect(await page.$eval(".tour-hole", (el) => el.hidden)).toBe(true);
    await expect(page.locator(".tour-back")).toBeHidden(); // no Back on step 1
});

test("Next advances the counter and lights a spotlight on real targets", async () => {
    await page.click(".tour-next"); // → step 2 (#saga)
    expect(await current(page)).toBe(2);
    await expect(page.locator(".tour-back")).toBeVisible();
    // a targeted step shows the spotlight hole over a positive-sized rect
    expect(await page.$eval(".tour-hole", (el) => el.hidden)).toBe(false);
    const rect = await page.$eval(".tour-hole", (el) => el.getBoundingClientRect().toJSON());
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    await page.click(".tour-back"); // back to welcome
    expect(await current(page)).toBe(1);
});

test("clicking the dimmed area does not dismiss the tour", async () => {
    // click a far corner of the scrim, away from the card
    await page.mouse.click(20, 20);
    await page.waitForTimeout(150);
    await expect(page.locator(".tour-card")).toHaveCount(1);
    expect(await current(page)).toBe(1);
});

test("Skip closes the tour, records the flag, and it doesn't reappear on reload", async () => {
    await page.click(".tour-skip");
    await expect(page.locator(".tour-card")).toHaveCount(0);
    expect(await page.evaluate((k) => localStorage.getItem(k), SEEN_KEY)).toBe("1");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400); // give the double-rAF auto-start a chance
    await expect(page.locator(".tour-card")).toHaveCount(0);
});

test("the ? button replays the tour on demand", async () => {
    await page.click("#help");
    await page.waitForSelector(".tour-card", { timeout: 5_000 });
    expect(await current(page)).toBe(1);
    // Esc closes it again
    await page.keyboard.press("Escape");
    await expect(page.locator(".tour-card")).toHaveCount(0);
});
