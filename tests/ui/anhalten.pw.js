import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("bild-und-axe: Alles anhalten und Weitermachen", async ({ page }, info) => {
  await page.goto("/"); await page.evaluate(() => document.fonts.ready);
  const bild = async name => { const path = info.outputPath(`${name}.png`); await page.screenshot({ path, animations: "disabled" }); await info.attach(name, { path, contentType: "image/png" }); };
  const grenzen = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const bereich of [".kopf", ".chat-spalte", ".team-spalte"]) {
      const wurzel = page.locator(bereich);
      const breite = await wurzel.evaluate(el => ({ platz: el.clientWidth, inhalt: el.scrollWidth, teile: [...el.children].map(teil => [teil.className, teil.getBoundingClientRect().width]) }));
      expect(breite.inhalt, `${bereich}: ${JSON.stringify(breite)}`).toBeLessThanOrEqual(breite.platz);
    }
    for (const knopf of await page.locator(".kopf button").all()) expect(await knopf.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })).toBe(true);
    expect(await page.locator('.kopf > :not(h1)').evaluateAll(teile => { const grenzen = teile.map(el => el.getBoundingClientRect()).filter(r => r.width > 0); return grenzen.every((r, i) => !i || r.left >= grenzen[i - 1].right); })).toBe(true);
    expect(await page.locator('.kopf button').evaluateAll(knoepfe => knoepfe.every(knopf => { const r = knopf.getBoundingClientRect(); return [...knopf.querySelectorAll('svg')].every(svg => { const s = svg.getBoundingClientRect(); return !s.width || s.left >= r.left && s.right <= r.right; }); }))).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  };
  await grenzen(); await bild("normal");
  await page.locator(".kopf").getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect(page.locator(".kopf")).toContainText("Angehalten");
  await expect(page.locator(".chat-spalte .anhalte-hinweis")).toContainText("Angehalten");
  await expect(page.locator(".team-spalte .anhalte-hinweis")).toContainText("Angehalten");
  await expect(page.locator(".team-kopf").getByRole("button", { name: "Alles anhalten" })).toHaveCount(0);
  await expect(page.locator(".team-liste .pause-marke")).toHaveCount(3);
  expect(await page.locator('.team-liste .zs[aria-label="Zeitspur: Angehalten"] .zs-hinweis').evaluateAll(texte => texte.every(el => { const r = el.getBoundingClientRect(), spur = el.parentElement, linie = spur.querySelector('.zs-jetzt').getBoundingClientRect(); return r.left > linie.right && r.right <= spur.getBoundingClientRect().right; }))).toBe(true);
  await grenzen(); await bild("angehalten");
  await page.locator(".chat-spalte").getByRole("button", { name: /Weitermachen/ }).click();
  await expect(page.locator(".anhalte-hinweis")).toHaveCount(0);
  await page.locator(".team-kopf").getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect(page.locator(".chat-spalte .anhalte-hinweis")).toBeVisible();
  await page.locator(".kopf").getByRole("button", { name: /Weitermachen/ }).click();
  await page.getByRole("button", { name: "ProjectB", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Ton bei Fragen: An" }).click();
  await page.getByRole("button", { name: "ProjectB", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Ton bei Fragen: Aus" })).toHaveAttribute("aria-checked", "false");
  await grenzen();
  for (const bewegung of ["voll", "reduziert"]) {
    await page.keyboard.press("Escape"); await page.evaluate(wert => { document.documentElement.dataset.bewegung = wert; }, bewegung);
    await page.locator(".kopf").getByRole("button", { name: "Alles anhalten", exact: true }).click(); await grenzen();
    await page.locator(".kopf").getByRole("button", { name: /Weitermachen/ }).click();
  }
});
