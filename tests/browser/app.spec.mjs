import { test, expect } from "@playwright/test";
test("commercial page, signup and mobile widths", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 375, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Tu ganadería, en orden." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `landing ${width}`,
    ).toBe(true);
  }
  await page.screenshot({ path: ".local/landing.png", fullPage: true });
  await page.getByRole("link", { name: "Empieza tu prueba" }).click();
  await expect(
    page.getByRole("heading", { name: "Crear una cuenta" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("demo routes render, metrics are real and mutations are blocked", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?demo=1");
  await expect(
    page.getByRole("heading", { name: "Así se ve una finca en orden." }),
  ).toBeVisible();
  await expect(page.locator(".metrics")).toContainText("26");
  await expect(page.locator(".metrics")).not.toContainText("—");
  await page.screenshot({ path: ".local/dashboard.png", fullPage: true });
  for (const route of [
    "animales",
    "animal/DEMO-001",
    "nacimientos",
    "situacion",
    "planeacion",
    "salida",
    "sanidad",
    "tareas",
    "calendario",
    "predios",
    "lluvias",
    "ventas",
    "finanzas",
    "facturas",
    "cuenta",
  ]) {
    await page.evaluate((route) => {
      location.hash = "#/" + route;
    }, route);
    await expect(page.locator("#loading-global")).toBeHidden({
      timeout: 20000,
    });
    await expect(page.locator("#app-main")).not.toBeEmpty();
    await page.waitForTimeout(100);
  }
  const response = await page.request.post("/api/rpc", {
    data: { demo: true, fn: "saveAnimal", args: [{ codigo: "HACK" }] },
  });
  expect(response.status()).toBe(403);
  expect(errors).toEqual([]);
});
test("workspace remains inside small screens", async ({ page }) => {
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?demo=1");
    await expect(page.locator(".metrics")).toContainText("26");
    await expect(page.locator("#loading-global")).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `workspace ${width}`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await expect
    .poll(() =>
      page.locator("#sidebar").evaluate((e) => e.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Menú", exact: true }).click();
  await expect(page.locator("#sidebar")).toHaveClass(/sidebar-open/);
  await page.locator('#sidebar .nav-link[data-view="animales"]').click();
  await expect(page.locator("#sidebar")).not.toHaveClass(/sidebar-open/);
  await page.goto("/?demo=1");
  await expect(page.locator(".metrics")).toContainText("26");
  await expect(page.locator("#loading-global")).toBeHidden();
  await expect
    .poll(() =>
      page.locator("#sidebar").evaluate((e) => e.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: ".local/mobile.png", fullPage: true });
});
