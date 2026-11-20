import { test, expect } from "@playwright/test";
const bilder = process.env.BILD_ORDNER;

test("Prompt bauen: Auftragsprüfung reagiert live ohne Überlauf", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Auftragsprüfung wird am Kandidaten geprüft.");
  await page.goto("/?vorschau=prompt"); await page.evaluate(() => document.fonts.ready);
  const dialog = page.getByRole("dialog", { name: "Prompt bauen", exact: true });
  const pruefung = dialog.getByRole("region", { name: "Prüfung des Auftrags", exact: true });
  await expect(pruefung).toContainText("4 / 4 erfüllt");
  await expect(pruefung.getByRole("listitem")).toHaveCount(4);
  await dialog.getByRole("textbox", { name: "Nicht tun", exact: true }).fill("");
  await expect(pruefung).toContainText("3 / 4 erfüllt");
  await expect(pruefung.getByRole("listitem", { name: "Nicht tun ausgefüllt: offen", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Als Auftrag senden", exact: true })).toBeEnabled();
  await pruefung.scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Als Auftrag senden", exact: true })).toBeInViewport();
  expect(await dialog.evaluate(e => {
    const r = e.getBoundingClientRect(), inhalt = e.querySelector(".pb-inhalt"), fuss = e.querySelector("footer").getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && fuss.bottom <= r.bottom && inhalt.getBoundingClientRect().bottom <= fuss.top && [e, ...e.querySelectorAll("section,textarea,footer,.pb-inhalt")].every(k => k.scrollWidth <= k.clientWidth);
  })).toBe(true);
  if (bilder && info.project.name !== "1280x800") await page.screenshot({ path: `${bilder}/P-9-2c2_fenster_${info.project.name}.png` });
});

test("Prompt bauen: Modus und Platzhalter", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Neuer Modus wird am Kandidaten geprüft.");
  await page.goto("/"); await page.getByRole("radio", { name: "Prompt bauen", exact: true }).click();
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  await expect(feld).toHaveAttribute("placeholder", "Stichworte reichen, zum Beispiel: Paketliste, CSV, Status und Dauer …");
  await expect(page.getByRole("radio", { name: "Prompt bauen", exact: true })).toHaveAttribute("aria-checked", "true");
  if (bilder && info.project.name === "1440x900") await page.screenshot({ path: `${bilder}/P-9-2a_modus_1440x900.png` });
});
test("Prompt bauen: Vorschau, Bearbeiten und Fenster ohne Überlauf", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Neues Fenster wird am Kandidaten geprüft.");
  await page.goto("/?vorschau=prompt"); await page.evaluate(() => document.fonts.ready);
  const dialog = page.getByRole("dialog", { name: "Prompt bauen", exact: true });
  await expect(dialog).toBeVisible(); await expect(dialog.getByRole("textbox")).toHaveCount(7);
  await expect(dialog.getByRole("textbox", { name: "Ziel", exact: true })).toHaveValue(/CSV-Datei/);
  expect(await dialog.getByRole("heading", { name: "Prompt bauen", exact: true }).evaluate(e => e.getBoundingClientRect().width)).toBeGreaterThan(1);
  expect(await dialog.locator("textarea").evaluateAll(es => es.every(e => e.clientHeight >= e.scrollHeight))).toBe(true);
  const grenzen = await dialog.evaluate(e => {
    const r = e.getBoundingClientRect(), fuss = e.querySelector("footer").getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && fuss.bottom <= r.bottom && e.scrollWidth <= e.clientWidth && [...e.querySelectorAll("section,textarea,footer")].every(k => k.scrollWidth <= k.clientWidth);
  }); expect(grenzen).toBe(true);
  if (bilder && info.project.name !== "1280x800") await page.screenshot({ path: `${bilder}/P-9-2a_fenster_${info.project.name}.png` });
  const feld = dialog.getByRole("textbox", { name: "Was genau", exact: true });
  await feld.fill("Ein bearbeiteter Abschnitt\n".repeat(20));
  expect(await feld.evaluate(e => e.clientHeight >= e.scrollHeight)).toBe(true);
  await expect(dialog.getByRole("button", { name: "Als Auftrag senden", exact: true })).toBeInViewport();
  await expect(feld).toHaveValue("Ein bearbeiteter Abschnitt\n".repeat(20));
});
test("Prompt bauen: Senden öffnet, Esc schließt und gibt Fokus zurück", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Dialog und Fokus werden am Kandidaten geprüft.");
  await page.goto("/"); await page.getByRole("radio", { name: "Prompt bauen", exact: true }).click();
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  await feld.fill("Export für Excel"); await feld.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Prompt bauen", exact: true });
  await expect(dialog.getByRole("textbox", { name: "Ziel", exact: true })).toHaveValue("Export für Excel");
  await expect(dialog.getByRole("textbox", { name: "Hintergrund", exact: true })).toHaveValue("");
  for (const taste of [...Array(12).fill("Tab"), ...Array(12).fill("Shift+Tab")]) {
    await page.keyboard.press(taste); expect(await dialog.evaluate(e => e.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(feld).toBeFocused(); await expect(feld).toHaveValue("");
});
test("Vierter Modus lässt bestehende Einstellungen erreichbar", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Zusätzlicher Modus wird am Kandidaten geprüft.");
  await page.goto("/"); await page.getByRole("button", { name: /^Einstellungen für Ausführen/ }).click();
  const menue = page.getByRole("dialog");
  expect(await menue.evaluate(e => { const r = e.getBoundingClientRect(), s = e.closest(".chat-spalte").getBoundingClientRect(); return r.left >= s.left && r.right <= s.right; })).toBe(true);
  await menue.getByRole("radio", { name: "Bis zu 5", exact: true }).click();
  await expect(menue.getByRole("radio", { name: "Bis zu 5", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("Prompt bauen: Rückfragen aus dem Soll und sichtbare Knopfleiste", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Rückfragen werden am Kandidaten geprüft.");
  await page.goto("/?vorschau=prompt"); await page.evaluate(() => document.fonts.ready);
  const dialog = page.getByRole("dialog", { name: "Prompt bauen", exact: true }), fragen = dialog.getByRole("region", { name: "Rückfragen", exact: true });
  await expect(fragen).toContainText("3 beantwortet");
  for (const text of ["Für wen ist der Export?", "Für Kunden, die öffnen ihn in Excel.", "Welche Pakete?", "Nur die gerade gefilterten.", "Was soll mit Umlauten passieren?", "Müssen in Excel richtig aussehen."]) await expect(fragen).toContainText(text);
  const offen = dialog.getByRole("region", { name: "Frage an dich", exact: true });
  await expect(offen).toContainText("Wie soll die Datei heißen?");
  for (const name of ["pakete-JJJJ-MM-TT.csv", "Beim Speichern wählen"]) await expect(offen.getByRole("button", { name, exact: true })).toBeEnabled();
  await expect(offen.getByRole("textbox", { name: "Deine Antwort" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Als Auftrag senden", exact: true })).toBeInViewport();
  expect(await dialog.evaluate(e => e.getBoundingClientRect().bottom <= innerHeight && [e, ...e.querySelectorAll("section,textarea,footer")].every(k => k.scrollWidth <= k.clientWidth))).toBe(true);
  if (bilder && info.project.name !== "1280x800") await page.screenshot({ path: `${bilder}/P-9-2b_fenster_${info.project.name}.png` });
});

test("Prompt bauen: Einstellungen ohne Überlauf", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Neue Einstellungen werden am Kandidaten geprüft.");
  await page.goto("/"); await page.evaluate(() => document.fonts.ready);
  await page.getByRole("radio", { name: "Prompt bauen", exact: true }).click();
  await page.getByRole("button", { name: /^Einstellungen für Prompt bauen/ }).click();
  const menue = page.getByRole("dialog", { name: "Einstellungen für Prompt bauen", exact: true });
  for (const name of ["Länge", "Auftrag für", "Abnahme-Punkte ergänzen"]) await expect(menue.getByRole("radiogroup", { name, exact: true })).toBeVisible();
  expect(await menue.evaluate(e => {
    const r = e.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight &&
      [e, ...e.querySelectorAll(".kopf,.um,button")].every(k => k.scrollWidth <= k.clientWidth);
  })).toBe(true);
  await expect(menue.getByRole("button", { name: "Auf Empfohlen zurücksetzen" })).toBeInViewport();
  if (bilder && info.project.name === "1440x900") await page.screenshot({ path: `${bilder}/P-9-2c1_einstellungen_1440x900.png` });
});
