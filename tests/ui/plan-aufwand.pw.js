import { test, expect } from "@playwright/test";

test("Planaufwand: Kacheln, Diagramm, Hover und Fokus ohne Überlauf", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Planaufwand wird am Kandidaten geprüft.");
  await page.goto("/?vorschau=plan");
  await page.getByRole("button", { name: "Plan öffnen", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  for (const name of ["Aufwand", "Tokens", "Risiko"]) await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aufwand je Schritt", exact: true })).toBeVisible();
  const zeile = page.getByRole("row", { name: /^Schritt 4,/ }), schritt = page.locator(".pl-schritt").nth(3);
  const bilder = "/home/pa/wt/_auftraege/bilder";
  if (info.project.name !== "1280x800") await page.screenshot({ path: `${bilder}/P-9-1b_plan_${info.project.name}.png`, animations: "disabled" });
  await zeile.locator(".pl-balken").hover();
  await expect(schritt).toHaveAttribute("data-hervorgehoben", "true");
  await expect(schritt).toBeInViewport();
  const ring = await schritt.evaluate(e => ({ schatten: getComputedStyle(e).boxShadow, auswahl: getComputedStyle(e).getPropertyValue("--schatten-auswahl").trim() }));
  expect(ring.schatten).not.toBe("none");
  expect(ring.auswahl).not.toBe("");
  if (info.project.name === "1440x900") await page.screenshot({ path: `${bilder}/P-9-1b_hover_1440x900.png`, animations: "disabled" });
  await page.mouse.move(0, 0); await expect(schritt).toHaveAttribute("data-hervorgehoben", "false");
  await zeile.focus(); await expect(schritt).toHaveAttribute("data-hervorgehoben", "true");
  await page.keyboard.press("Tab"); await expect(schritt).toHaveAttribute("data-hervorgehoben", "false");
  expect(await page.locator(".planfenster,.pl-rechts,.pl-werkzeuge,.pl-kacheln,.pl-diagramm").evaluateAll(es => es.every(e => e.scrollWidth <= e.clientWidth))).toBe(true);
  expect(await page.locator(".pl-kachel h3,.pl-kachel strong,.pl-kachel p").evaluateAll(es => es.every(e => e.scrollWidth <= e.clientWidth))).toBe(true);
  expect(await page.locator(".pl-rechts section *").evaluateAll(es => es.every(e => parseFloat(getComputedStyle(e).fontSize) >= 12))).toBe(true);
  for (const balken of await page.locator(".pl-balken").all()) {
    const farbe = await balken.evaluate(e => getComputedStyle(e).backgroundColor);
    expect(farbe).not.toMatch(/rgba?\(255, 255, 255[,)]|rgba\(0, 0, 0, 0\)/);
  }
});
