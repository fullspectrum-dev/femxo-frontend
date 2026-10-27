import { expect, test } from "@playwright/test";

// Signing in is always in the header bar, whatever the screen: phones, tablets, laptops, wide monitors.
const WIDTHS = [320, 360, 390, 414, 600, 768, 1024, 1279, 1280, 1440, 1920];

for (const width of WIDTHS) {
  test(`the header offers sign in, and fits, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Nothing in the bar spills past the screen, and the page doesn't scroll sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const controls = header.locator("a:visible, button:visible");
    for (let i = 0; i < (await controls.count()); i++) {
      const box = await controls.nth(i).boundingBox();
      if (!box || box.y > 120) continue; // the bar itself, not the open phone menu
      expect(box.x, `control ${i} starts on screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `control ${i} ends on screen`).toBeLessThanOrEqual(width);
    }

    if (width >= 1280) {
      // Room for both ways in, side by side.
      await expect(header.getByRole("link", { name: "Customer sign in" })).toBeVisible();
      await expect(header.getByRole("link", { name: "Staff sign in" })).toBeVisible();
    } else {
      // One "Sign in" button, in the bar (not hidden inside the phone menu), opening both ways in.
      const button = header.getByRole("button", { name: "Sign in" });
      await expect(button).toBeVisible();
      await button.click();
      const customer = header.getByRole("link", { name: /Customer sign in/ }).first();
      const staff = header.getByRole("link", { name: /Staff sign in/ }).first();
      await expect(customer).toBeVisible();
      await expect(staff).toBeVisible();
      for (const link of [customer, staff]) {
        const box = (await link.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await expect(staff).toHaveAttribute("href", "/login");
      await page.keyboard.press("Escape");
      await expect(staff).toBeHidden();
    }
  });
}
