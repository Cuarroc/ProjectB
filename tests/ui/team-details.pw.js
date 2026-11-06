import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Team-Details: Tastatur, Beleg, Vorschau, Bewegung und bild-und-axe", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Die neuen Details werden am Kandidaten geprüft.");
  await page.goto("/");
  await page.evaluate(async () => { await document.fonts.ready; document.documentElement.dataset.bewegung = "voll"; });
  const karte = page.locator('.team-liste [data-agent="kern"] .ak-kopf');
  const details = page.locator("#team-details");
  await karte.focus(); await page.keyboard.press("Enter");
  await expect(details).toBeFocused();
  expect(await details.evaluate(el => { const s = getComputedStyle(el); return [s.animationDuration, s.animationName]; })).toEqual(["0.2s", "team-details"]);
  await page.keyboard.press("Tab");
  await expect(details.getByRole("button", { name: "Schließen", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0); await expect(karte).toBeFocused();
  for (const modus of ["voll", "reduziert"]) {
    await page.evaluate(m => document.documentElement.dataset.bewegung = m, modus);
    await karte.press("Enter");
    await page.waitForTimeout(220);
    expect(await details.evaluate(el => el.getAnimations().length)).toBe(0);
    const spalte = await page.locator(".team-spalte").boundingBox();
    const box = await details.boundingBox(), k = await karte.locator("..").boundingBox();
    const achse = await page.locator(".team-achse").boundingBox();
    expect(k.y - achse.y - achse.height).toBeLessThanOrEqual(12);
    expect(k.y).toBeGreaterThanOrEqual(achse.y + achse.height);
    await expect(details.locator(".tm-det-leiste")).toContainText("Arbeitet · testet");
    await expect(details.getByRole("button", { name: "Protokoll öffnen" })).toBeVisible();
    await expect(details.getByRole("button", { name: "Agent fragen" })).toBeVisible();
    await expect(details.getByRole("img", { name: /Testverlauf/ })).toBeVisible();
    expect(await details.locator(".zs-stueck").evaluateAll(stuecke => Math.min(...stuecke.flatMap(el => {
      const stil = getComputedStyle(el);
      return ["--a", "--b"].map(token => {
        const rgb = stil.getPropertyValue(token).trim().match(/[a-f\d]{2}/gi).map(w => parseInt(w, 16));
        const hell = rgb.map(c => (c * .95 + 255 * .05) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
        return 1.05 / (.2126 * hell[0] + .7152 * hell[1] + .0722 * hell[2] + .05);
      });
    })))).toBeGreaterThanOrEqual(4.5);
    expect(box.x).toBeGreaterThanOrEqual(spalte.x); expect(box.x + box.width).toBeLessThanOrEqual(spalte.x + spalte.width);
    expect(k.y).toBeGreaterThanOrEqual(spalte.y); expect(k.y + k.height).toBeLessThanOrEqual(box.y);
    expect(await details.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const bild = testInfo.outputPath(`team-details-${modus}.png`);
    await page.mouse.move(0, 0); await page.screenshot({ path: bild }); await testInfo.attach(`Details ${modus}`, { path: bild, contentType: "image/png" });
    expect((await new AxeBuilder({ page }).include(".team-spalte").analyze()).violations).toEqual([]);
    for (const [knopf, text] of [["Protokoll öffnen", "test export::csv_kopfzeile"], ["Agent fragen", "Nachrichten an Agenten"]]) {
      await details.getByRole("button", { name: knopf }).click();
      await expect(details.getByRole("region", { name: "Vorschau" })).toContainText(text);
      await details.getByRole("button", { name: "Vorschau schließen" }).click();
      await expect(details.getByRole("button", { name: knopf })).toBeFocused();
    }
    await details.getByRole("button", { name: "Ansehen", exact: true }).first().click();
    const vorschau = details.getByRole("region", { name: "Vorschau" });
    await expect(vorschau).toContainText("src/export.rs");
    await expect(vorschau).toContainText("noch nicht verfügbar");
    await expect(vorschau).toBeFocused();
    expect((await new AxeBuilder({ page }).include(".team-spalte").analyze()).violations).toEqual([]);
    await page.mouse.move(0, 0); await page.screenshot({ path: testInfo.outputPath(`team-vorschau-${modus}.png`) });
    await vorschau.getByRole("button", { name: "Vorschau schließen" }).click();
    await expect(details.getByRole("button", { name: "Ansehen", exact: true }).first()).toBeFocused();
    await details.locator("li").filter({ hasText: "Testprotokoll" }).getByRole("button", { name: "Ansehen" }).click();
    await expect(vorschau).toContainText("Ausgaben/export-tests.txt");
    await page.locator('.team-liste [data-agent="dauer"] .ak-kopf').click();
    await expect(details).toHaveAttribute("aria-label", "Details: Spalte „Dauer“ berechnen");
    expect(await details.evaluate(el => el.getAnimations().length)).toBe(0);
    await expect(details.getByRole("link", { name: "PR ansehen" })).toHaveAttribute("href", "https://github.com/Cuarroc/ProjectB/pull/57");
    await expect(vorschau).toHaveCount(0);
    const gewaehlt = await page.locator('.team-liste [data-agent="dauer"]').boundingBox();
    expect(gewaehlt.y - achse.y - achse.height).toBeLessThanOrEqual(12);
    expect(gewaehlt.y).toBeGreaterThanOrEqual(achse.y + achse.height);
    expect((await new AxeBuilder({ page }).include(".team-spalte").analyze()).violations).toEqual([]);
    await details.getByRole("link", { name: "PR ansehen" }).scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0); await page.screenshot({ path: testInfo.outputPath(`team-beleg-${modus}.png`) });
    await details.press("Escape");
    await expect(page.locator('.team-liste [data-agent="dauer"] .ak-kopf')).toBeFocused();
    await karte.focus();
  }
  for (const ansicht of ["Board", "Zeitstrahl"]) {
    await page.getByRole("radio", { name: ansicht, exact: true }).click();
    const knopf = page.locator(ansicht === "Board" ? '.team-bkarte[data-agent="kern"] .team-bdetails' : '.team-spurzeile[data-agent="kern"] button');
    await knopf.press("Enter"); await expect(details).toBeFocused();
    await details.press("Escape"); await expect(knopf).toBeFocused();
  }
});
