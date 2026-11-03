// Accessibility (axe, WCAG 2.1 A/AA) and mobile layout checks for the screens
// sellers and door staff use all day. Runs in the desktop and mobile projects.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedWorld, uiLogin } from "./helpers.mjs";

const SELLER_SCREENS = ["/examinations", "/dashboard/tickets", "/dashboard/scan", "/dashboard/day-closure"];
const PUBLIC_SCREENS = ["/login", "/results", "/tickets/verify"];

async function audit(page, path) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, `axe violations on ${path}`).toEqual([]);

  // No sideways scrolling: content must fit the viewport width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
}

test.describe("accessibility and mobile layout", () => {
  let world;
  test.beforeAll(async () => {
    world = await seedWorld();
  });

  for (const path of PUBLIC_SCREENS)
    test(`public ${path}`, async ({ page }) => {
      await audit(page, path);
    });

  for (const path of SELLER_SCREENS)
    test(`seller ${path}`, async ({ page }) => {
      await uiLogin(page, world.users.SELLER);
      await audit(page, path);
    });

  test("scan screen keeps a large touch target and focus on the input", async ({ page }, testInfo) => {
    await uiLogin(page, world.users.SELLER);
    await page.goto("/dashboard/scan");
    const input = page.getByLabel("QR kod və ya yoxlama keçidi");
    await expect(input).toBeFocused();
    await input.fill("x".repeat(20));
    const box = await page.getByRole("button", { name: "Yoxla" }).boundingBox();
    // 44px on phones (door staff); WCAG 2.2 SC 2.5.8 minimum (24px) elsewhere.
    expect(box.height).toBeGreaterThanOrEqual(testInfo.project.name === "mobile" ? 44 : 24);
  });
});
