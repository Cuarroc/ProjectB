import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Kopf: Soll-Bilder, Menüs, Bewegung und axe", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Kopf ist im Basisstand ein Platzhalter.");
  await page.emulateMedia({ reducedMotion: "no-preference" }); await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const kopf = page.getByRole("banner"), logo = kopf.getByRole("button", { name: "ProjectB", exact: true });
  const bild = async name => { const path = info.outputPath(`${name}.png`); await page.screenshot({ path, animations: "disabled" }); await info.attach(name, { path, contentType: "image/png" }); };
  const grenzen = async locator => expect(await locator.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })).toBe(true);
  await grenzen(kopf); for (const knopf of await kopf.getByRole("button").all()) await grenzen(knopf); await bild("kopf");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  for (const name of ["ProjectB", "Projekt wählen", "Rollen"]) {
    const knopf = kopf.getByRole("button", { name: new RegExp(`^${name}`) });
    await knopf.focus(); await page.keyboard.press("ArrowDown");
    const menue = kopf.getByRole("menu", { name, exact: true }), eintraege = menue.getByRole(name === "Rollen" ? "menuitem" : "menuitemradio");
    await expect(eintraege.first()).toBeFocused();
    await page.keyboard.press("End"); await expect(eintraege.last()).toBeFocused();
    await page.keyboard.press("ArrowDown"); await expect(eintraege.first()).toBeFocused();
    await page.keyboard.press("ArrowUp"); await expect(eintraege.last()).toBeFocused();
    await page.keyboard.press("Home"); await expect(eintraege.first()).toBeFocused();
    await grenzen(menue); await expect(menue).toHaveCSS("background-color", "rgba(24, 27, 37, 0.94)"); await bild(name === "ProjectB" ? "logo-bewegung" : name);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape"); await expect(menue).toHaveCount(0); await expect(knopf).toBeFocused();
    await knopf.click(); await page.keyboard.press("Tab"); await expect(menue).toHaveCount(0);
    await knopf.click(); await page.mouse.click(1, page.viewportSize().height - 1); await expect(menue).toHaveCount(0);
  }
  for (const [name, wert] of [["Voll", "voll"], ["Reduziert", "reduziert"], ["Automatisch", "auto"]]) {
    await logo.click(); await kopf.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }).click();
    await expect(page.locator("html")).toHaveAttribute("data-bewegung", wert); await expect(logo).toBeFocused();
  }
  for (const [reducedMotion, text] of [["reduce", "Reduziert"], ["no-preference", "Voll"]]) {
    await page.emulateMedia({ reducedMotion }); await logo.click();
    await expect(kopf.locator(".kopf-gerade")).toHaveText(text);
    await expect(kopf.getByRole("menu")).toHaveCSS("animation-name", reducedMotion === "reduce" ? "kopf-blende" : "kopf-auf"); await page.keyboard.press("Escape");
  }
  await kopf.getByRole("button", { name: /^Projekt wählen/ }).click();
  await kopf.getByRole("menuitemradio").last().click(); await expect(kopf.getByRole("button", { name: /^Projekt wählen/ })).toContainText("C:\\ProjectB-Beispiel");
  for (const knopf of await kopf.getByRole("button").all()) await grenzen(knopf);
  const rechte = kopf.getByRole("button", { name: /^Berechtigungen:/ }); await rechte.click();
  await expect(page.getByRole("dialog", { name: "Berechtigungen" })).toBeVisible(); await page.keyboard.press("Escape"); await expect(rechte).toBeFocused();
  const post = kopf.getByRole("button", { name: "Postfach 3 warten auf dich" }); await post.click();
  await expect(kopf.getByRole("status")).toHaveText("3 warten auf dich."); await grenzen(kopf.getByRole("status"));
  await page.keyboard.press("Escape"); await expect(kopf.getByRole("status")).toHaveCount(0); await expect(post).toBeFocused();
});
