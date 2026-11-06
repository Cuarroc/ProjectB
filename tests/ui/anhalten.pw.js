import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("bild-und-axe: Alles anhalten und Weitermachen", async ({ page }, info) => {
  await page.goto("/"); await page.evaluate(() => document.fonts.ready);
  const bild = async name => { const path = info.outputPath(`${name}.png`); await page.screenshot({ path, animations: "disabled" }); await info.attach(name, { path, contentType: "image/png" }); };
  const grenzen = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const bereich of [".kopf", ".chat-spalte", ".team-spalte"]) {
      const wurzel = page.locator(bereich);
      expect(await wurzel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    for (const knopf of await page.locator(".kopf button").all()) expect(await knopf.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  };
  await grenzen(); await bild("normal");
  await page.getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect(page.locator(".kopf")).toContainText("Angehalten");
  await expect(page.locator(".chat-spalte .anhalte-hinweis")).toContainText("Angehalten");
  await expect(page.locator(".team-spalte .anhalte-hinweis")).toContainText("Angehalten");
  await grenzen(); await bild("angehalten");
  await page.locator(".chat-spalte").getByRole("button", { name: /Weitermachen/ }).click();
  await expect(page.locator(".anhalte-hinweis")).toHaveCount(0);
  await page.getByRole("button", { name: "Alle anhalten", exact: true }).click();
  await expect(page.locator(".chat-spalte .anhalte-hinweis")).toBeVisible();
  await page.locator(".kopf").getByRole("button", { name: /Weitermachen/ }).click();
  await page.getByRole("button", { name: "ProjectB", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Ton bei Fragen: An" }).click();
  await page.getByRole("button", { name: "ProjectB", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Ton bei Fragen: Aus" })).toHaveAttribute("aria-checked", "false");
  await grenzen();
  for (const bewegung of ["voll", "reduziert"]) {
    await page.keyboard.press("Escape"); await page.evaluate(wert => { document.documentElement.dataset.bewegung = wert; }, bewegung);
    await page.getByRole("button", { name: "Alles anhalten", exact: true }).click(); await grenzen();
    await page.locator(".kopf").getByRole("button", { name: /Weitermachen/ }).click();
  }
});
