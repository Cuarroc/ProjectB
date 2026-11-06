import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Interview und Berechtigungen: bild-und-axe, Fokus und Beispielzustand", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Neue Paketoberfläche fehlt im Basisstand.");
  await page.goto("/"); await page.evaluate(async () => { document.documentElement.dataset.bewegung = "voll"; await document.fonts.ready; });
  const bild = async name => { const path = info.outputPath(`${name}.png`); await page.screenshot({ path, animations: "disabled" }); await info.attach(name, { path, contentType: "image/png" }); };
  const axe = async () => expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const knopf = page.getByRole("button", { name: /^Berechtigungen:/ }), dialog = page.getByRole("dialog", { name: /Berechtigungen/ });
  const abbrechen = dialog.getByRole("button", { name: "Abbrechen" }), speichern = dialog.getByRole("button", { name: "Übernehmen" });
  await knopf.click(); await expect(abbrechen).toBeFocused(); await expect(speichern).toBeDisabled();
  await expect(dialog.getByRole("radio")).toHaveCount(3); await bild("berechtigungen"); await axe();
  const grenzen = await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && el.scrollWidth <= el.clientWidth; });
  expect(grenzen).toBe(true);
  await dialog.getByRole("radio", { name: /Vorsichtig/ }).click();
  await page.keyboard.press("End"); await expect(dialog.getByRole("radio", { name: /Autonom/ })).toBeFocused();
  await page.keyboard.press("Home"); await expect(dialog.getByRole("radio", { name: /Vorsichtig/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight"); await expect(dialog.getByRole("radio", { name: /Nur bei Wichtigem/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("End"); await speichern.click(); await expect(dialog).not.toBeVisible(); await expect(knopf).toHaveAccessibleName("Berechtigungen: Autonom"); await expect(knopf).toBeFocused();
  await knopf.click(); await dialog.getByRole("radio", { name: /Vorsichtig/ }).click();
  await dialog.getByLabel("Nächstes Übernehmen schlägt fehl").check(); await speichern.click();
  await expect(dialog.getByText("Nicht übernommen. Die alte Stufe gilt weiter.")).toBeVisible();
  await expect(knopf).toHaveAccessibleName("Berechtigungen: Autonom"); await axe(); await bild("berechtigungen-fehler");
  await speichern.focus(); await page.keyboard.press("Tab"); await expect(dialog.getByRole("button", { name: "Schließen", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(speichern).toBeFocused();
  for (let i = 0; i < 8; i++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(knopf).toBeFocused();
  await knopf.click(); await expect(dialog.getByRole("radio", { name: /Autonom/ })).toHaveAttribute("aria-checked", "true"); await abbrechen.click(); await expect(knopf).toBeFocused();
  for (const [wert, weg] of [["voll", "8px"], ["reduziert", "0px"]]) {
    await page.evaluate(w => { document.documentElement.dataset.bewegung = w; }, wert); await knopf.click();
    expect(await dialog.evaluate(el => getComputedStyle(el).getPropertyValue("--weg-mittel").trim())).toBe(weg); await page.keyboard.press("Escape");
  }
  await page.evaluate(() => { document.documentElement.dataset.bewegung = "voll"; }); await page.getByRole("radio", { name: "Interview", exact: true }).click();
  const interview = page.getByRole("article", { name: "Interview", exact: true }); await bild("interview"); await axe();
  for (let i = 1; i <= 3; i++) {
    await expect(interview.getByRole("heading", { name: /^Frage/ })).toHaveText(`Frage ${i} von 3`);
    if (i !== 2) await interview.getByRole("button", { name: i === 1 ? "Mein Team" : "Im Projektordner", exact: true }).click();
    await interview.getByLabel("Deine Antwort oder Ergänzung").fill(`Freie Antwort ${i}`);
    await interview.getByRole("button", { name: i === 3 ? "Zusammenfassen" : "Weiter", exact: true }).click();
  }
  await expect(interview.getByRole("heading", { name: "Zusammenfassung" })).toBeFocused();
  for (const text of ["Mein Team", "Im Projektordner", "Freie Antwort 1", "Freie Antwort 2", "Freie Antwort 3"]) await expect(interview).toContainText(text);
  expect(await interview.evaluate(el => { const r = el.getBoundingClientRect(), spalte = el.closest(".chat-spalte").getBoundingClientRect(); return r.left >= spalte.left && r.right <= spalte.right && el.scrollWidth <= el.clientWidth; })).toBe(true);
  await bild("interview-zusammenfassung"); await axe();
});
