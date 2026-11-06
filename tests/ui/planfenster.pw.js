import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Planfenster: Farben, Kommentar, Entscheidungen, Tastatur und bild-und-axe", async ({ page }, testInfo) => {
  await page.goto("/"); await page.evaluate(() => document.fonts.ready);
  const oeffnen = page.getByRole("button", { name: "Plan öffnen", exact: true });
  await oeffnen.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /^Plan:/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Mit Kommentaren zurückgeben", exact: true }).click();
  await expect(dialog.getByRole("status").last()).toContainText("Schreib einen Kommentar"); await expect(dialog).toBeVisible();
  const karte = dialog.locator(".pl-schritt").first();
  // Eine echte Teiltextauswahl darf beim Klick auf den Farbknopf nicht verloren gehen.
  await karte.locator("h3").evaluate(e => { const r = document.createRange(); r.setStart(e.firstChild, 0); r.setEnd(e.firstChild, 10);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); e.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })); });
  for (const [name, farbname] of [["Kommentar", "Silbergrau"], ["Ausarbeiten", "Violett"], ["Simpler", "Türkis"], ["Ausführlicher", "Gelb"], ["Innovativer", "Pink"]]) {
    const knopf = karte.getByRole("button", { name: `${name}, ${farbname}`, exact: true });
    await knopf.click(); await expect(knopf).toHaveAttribute("aria-pressed", "true");
    await expect(karte.locator("mark")).toHaveAttribute("aria-label", `${name}, ${farbname}`);
    await expect(karte.locator("mark")).toHaveText("Paketliste");
  }
  await expect(karte.getByText("Ausgearbeitet · Beispiel", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Schneller", exact: true }).click(); await dialog.getByRole("button", { name: "Neu schreiben lassen", exact: true }).click();
  await expect(dialog.getByRole("status").last()).toContainText("schneller geschrieben");
  const kommentar = karte.getByRole("textbox"); await kommentar.fill("Frag mich vorher nach dem Speicherort.");
  for (const bewegung of ["voll", "reduziert"]) {
    await page.evaluate(b => document.documentElement.dataset.bewegung = b, bewegung);
    for (const taste of [...Array(45).fill("Tab"), ...Array(45).fill("Shift+Tab")]) { await page.keyboard.press(taste);
      expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true); }
    expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    expect(await dialog.locator(".pl-links,.pl-rechts,.pl-aktionen").evaluateAll(es => es.every(e => e.scrollWidth <= e.clientWidth))).toBe(true);
    expect(await dialog.locator("button,textarea,p,h3,span").evaluateAll(es => es.every(e => parseFloat(getComputedStyle(e).fontSize) >= 12))).toBe(true);
    const bewegungStil = await karte.locator("mark").evaluate(e => ({ dauer: getComputedStyle(e).transitionDuration.split(",")[0], transform: getComputedStyle(e).transform }));
    expect(bewegungStil).toEqual({ dauer: bewegung === "voll" ? "0.12s" : "0.08s", transform: "none" });
    const axe = await new AxeBuilder({ page }).include(".planfenster").analyze(); expect(axe.violations).toEqual([]);
  }
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(oeffnen).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.getByRole("status", { name: "" }).filter({ hasText: /^Freigegeben$/ })).toBeVisible(); await expect(oeffnen).toBeFocused();
  await oeffnen.click(); await karte.getByRole("button", { name: "Kommentar, Silbergrau", exact: true }).click(); await kommentar.fill("Bitte ändern.");
  await dialog.getByRole("button", { name: "Mit Kommentaren zurückgeben", exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /^Zurückgegeben$/ })).toBeVisible();
  await oeffnen.click(); await expect(kommentar).toHaveValue("Bitte ändern.");
  await page.keyboard.press("Escape");
  // Soll-Beispieldaten: derselbe Datenweg, vier Schritte wie in plan.png.
  await page.evaluate(async () => { const { chatEingabeQuelle: q } = await import("/src/bereiche/ChatEingabe.tsx"); const d = q.lesen();
    const bedingungen = [["cargo test export ist grün", "Umlaute stehen richtig in der Datei", "Leere Liste ergibt nur die Kopfzeile"], ["Dauer in Minuten und Stunden", "Test für ein laufendes Paket"], ["Knopf steht rechts neben dem Filter", "Speicherort wird vorher erfragt", "Fehler beim Speichern wird angezeigt"], ["Tests grün", "Review ohne Funde"]];
    d.plan.titel = "Paketliste als CSV exportieren"; d.plan.freigabe = "Wartet auf dich";
    d.plan.schritte = ["kern", "dauer", "knopf", "review"].map((id, i) => ({ ...d.plan.schritte.find(s => s.id === id), markierungen: [], kommentar: "", fertigWenn: bedingungen[i].map(text => ({ text, erfuellt: false })) })); q.aktualisieren(d); });
  await oeffnen.click(); await karte.getByRole("button", { name: "Simpler, Türkis", exact: true }).click();
  const dritter = dialog.locator(".pl-schritt").nth(2); await dritter.getByRole("button", { name: "Kommentar, Silbergrau", exact: true }).click();
  await dritter.getByRole("textbox").fill("Frag mich vorher nach dem Speicherort."); await dritter.getByRole("button", { name: "Ausarbeiten, Violett", exact: true }).click();
  await dialog.locator(".pl-liste").evaluate(e => e.scrollTop = 0);
  await page.evaluate(() => document.documentElement.dataset.bewegung = "voll");
  const bild = process.env.PLAN_BILD ? `${process.env.PLAN_BILD}_${testInfo.project.name}.png` : testInfo.outputPath("plan.png");
  await page.evaluate(() => document.activeElement.blur()); await page.screenshot({ path: bild });
  await testInfo.attach("Plan mit Markierung und Kommentar", { path: bild, contentType: "image/png" });
  await dritter.getByRole("textbox").focus();
  const kommentarBild = testInfo.outputPath("kommentar.png"); await page.screenshot({ path: kommentarBild }); await testInfo.attach("Offener Kommentar", { path: kommentarBild, contentType: "image/png" });
});
