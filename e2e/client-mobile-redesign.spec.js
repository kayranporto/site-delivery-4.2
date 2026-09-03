import { test, expect } from "@playwright/test";

const mobileWidths = [360, 390, 430, 768];

for (const width of mobileWidths) {
  test(`navegação do cliente funciona em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");

    const nav = page.locator(".client-bottom-nav");
    await expect(nav).toBeVisible();
    await expect(nav.locator("a")).toHaveCount(5);
    await expect(nav.getByLabel("Início")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("body")).toHaveClass(/client-mobile-shell/);

    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      navBottom: Math.round(document.querySelector(".client-bottom-nav").getBoundingClientRect().bottom),
      viewportHeight: window.innerHeight
    }));
    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.navBottom).toBe(metrics.viewportHeight);
  });
}

test("busca recebe foco e estado ativo pelo atalho inferior", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#buscar");
  await expect(page.locator("#campoBusca")).toBeFocused();
  await expect(page.locator('.client-bottom-nav [data-nav-key="search"]')).toHaveAttribute("aria-current", "page");
});

test("navegação some no checkout e continua oculta no desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/html/checkout.html");
  await expect(page.locator(".client-bottom-nav")).toHaveCount(0);

  await page.setViewportSize({ width: 1180, height: 800 });
  await page.goto("/");
  await expect(page.locator(".client-bottom-nav")).toBeHidden();
});
