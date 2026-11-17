import { expect, test } from "@playwright/test";

// A default build has NEXT_PUBLIC_ALLOW_INDEXING unset: the site must tell crawlers to stay away.
test.describe("storefront smoke", () => {
  test("home renders the shell", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("main#main")).toBeVisible();
    await expect(page).toHaveTitle(/Femxo/);
  });

  test("product page renders (not-found state without a backend)", async ({ page }) => {
    const res = await page.goto("/p/does-not-exist");
    expect([200, 404]).toContain(res?.status());
    await expect(page.locator("main#main")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("login page renders", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Sign in to Femxo" })).toBeVisible();
    await expect(page.getByLabel("Mobile number")).toBeVisible();
  });

  test("pages carry noindex and robots.txt disallows everything", async ({ page, request }) => {
    await page.goto("/login");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const body = await robots.text();
    expect(body).toMatch(/User-Agent: \*/i);
    expect(body).toMatch(/Disallow: \/\s*$/m);
    expect(body).not.toMatch(/Allow: \//);
  });

  test("an enforced CSP is sent and the page runs under it", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && /Content Security Policy/i.test(m.text()) && errors.push(m.text()));
    const res = await page.goto("/login");
    const headers = res!.headers();
    const csp = headers["content-security-policy"] ?? "";
    expect(headers["content-security-policy-report-only"]).toBeUndefined();
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline'/); // the static shell's inline bootstrap needs it (see src/lib/csp.ts)
    expect(csp).not.toContain("*");
    // The only third party is Razorpay Checkout, and only the origins it needs.
    expect((csp.match(/https:\/\/[a-z.-]+/g) ?? []).every((origin) => origin.endsWith("razorpay.com"))).toBe(true);
    expect(csp).toContain("frame-src https://api.razorpay.com https://checkout.razorpay.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/connect-src 'self'/);
    await expect(page.getByRole("heading", { name: "Sign in to Femxo" })).toBeVisible();
    // Hydration worked: the mobile field accepts input.
    await page.getByLabel("Mobile number").fill("9876543210");
    await expect(page.getByLabel("Mobile number")).toHaveValue(/9876543210/);
    expect(errors).toEqual([]);
  });
});
