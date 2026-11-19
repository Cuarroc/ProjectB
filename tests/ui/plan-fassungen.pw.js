import { test, expect } from "@playwright/test";

test("Planfassungen: Wechsel, Vergleich, Sperren und Kopf ohne Überlauf", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Planfassungen werden am Kandidaten geprüft.");
  await page.goto("/?vorschau=plan"); await page.getByRole("button", { name: "Plan öffnen", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  const dialog = page.getByRole("dialog"), wahl = dialog.getByRole("radiogroup", { name: "Fassung" });
  const aufwand = dialog.getByRole("region", { name: "Aufwand", exact: true }), tokens = dialog.getByRole("region", { name: "Tokens", exact: true });
  await expect(dialog.locator(".pl-meta")).toContainText("Fassung B von 2");
  await expect(dialog.locator(".pl-schritt")).toHaveCount(4); await expect(aufwand).toContainText("~14 min");
  await expect(aufwand).toContainText("−4 min zu A"); await expect(tokens).toContainText("+12k zu A");
  const bilder = process.env.BILD_ORDNER;
  if (bilder && info.project.name !== "1280x800") await page.screenshot({ path: `${bilder}/P-9-1c_plan_${info.project.name}.png`, animations: "disabled" });
  const schritt = dialog.locator(".pl-schritt").first();
  await schritt.getByRole("button", { name: "Kommentar, Silbergrau" }).click(); await schritt.getByRole("textbox").fill("Bitte klären.");
  await schritt.getByRole("button", { name: "Simpler, Türkis" }).click();
  await wahl.getByRole("radio", { name: "A", exact: true }).click();
  await expect(dialog.locator(".pl-schritt")).toHaveCount(5); await expect(aufwand).toContainText("~18 min"); await expect(tokens).toContainText("~115k");
  await expect(dialog.locator(".pl-diagramm tbody tr")).toHaveCount(5); await expect(aufwand).not.toContainText("zu A");
  for (const name of ["Neu schreiben lassen", "Freigeben und bauen", /^Mit Kommentaren zurückgeben/]) {
    const knopf = dialog.getByRole("button", { name }); await expect(knopf).toBeDisabled();
    await expect(knopf).toHaveAttribute("title", "Ältere Fassung, nur zum Vergleich. Wechsle zur neuesten, um zu entscheiden.");
  }
  for (const knopf of await dialog.locator(".pl-aktionen button,.pl-stilknopf").all()) await expect(knopf).toBeDisabled();
  if (bilder && info.project.name === "1440x900") await page.screenshot({ path: `${bilder}/P-9-1c_fassung-a_1440x900.png`, animations: "disabled" });
  await wahl.getByRole("radio", { name: "B", exact: true }).click();
  await expect(schritt.getByRole("textbox")).toHaveValue("Bitte klären."); await expect(schritt.getByRole("button", { name: "Simpler, Türkis" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "Freigeben und bauen" })).toBeEnabled();
  await expect(dialog.locator(".pl-diagramm tbody tr")).toHaveCount(4);
  expect(await dialog.locator(".pl-kopf,.pl-meta,.umschalter,.pl-kacheln,.pl-diagramm").evaluateAll(es => es.every(e => {
    const r = e.getBoundingClientRect(); return e.scrollWidth <= e.clientWidth && r.left >= 0 && r.right <= innerWidth;
  }))).toBe(true);
  expect(await dialog.locator(".pl-kopf *").evaluateAll(es => es.every(e => parseFloat(getComputedStyle(e).fontSize) >= 12))).toBe(true);
});
