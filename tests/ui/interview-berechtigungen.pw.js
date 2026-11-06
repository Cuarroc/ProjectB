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
  await expect.soft(dialog.getByLabel("Nächstes Übernehmen schlägt fehl")).toHaveCount(0);
  expect.soft(await dialog.locator("#ber-meldung").evaluate(el => { const r = el.getBoundingClientRect(), b = el.nextElementSibling.getBoundingClientRect(); return getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)" && b.left - r.right <= 16; })).toBe(true);
  expect.soft(await dialog.locator(".ber-auch").evaluateAll(els => els.length === 1 && els[0].children[0].textContent.includes("Protokoll") && els[0].children[1].querySelector("svg") !== null && getComputedStyle(els[0]).borderTopStyle === "solid")).toBe(true);
  await expect(dialog.getByRole("radio")).toHaveCount(3); await bild("berechtigungen"); await axe();
  const grenzen = await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && el.scrollWidth <= el.clientWidth; });
  expect(grenzen).toBe(true);
  await page.evaluate(async () => { const { chatEingabeQuelle: q } = await import("/src/bereiche/ChatEingabe.tsx"); const d = q.lesen(); d.berechtigungen.regeln.pop(); q.aktualisieren(d); });
  await expect.soft(dialog.locator(".ber-achse > span").nth(1)).toHaveText("4");
  await page.goto("/?beispielFehler"); await knopf.click();
  await dialog.getByRole("radio", { name: /Vorsichtig/ }).click();
  const nieFarbe = await dialog.locator('.ber-legende [data-art="Nie"] i').evaluate(el => getComputedStyle(el).backgroundColor);
  await expect(dialog.locator('.ber-vert > [data-art="Nie"]')).toHaveCSS("background-color", nieFarbe);
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

test("Interview zeigt gesendete Nachrichten", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Neue Paketoberfläche fehlt im Basisstand.");
  await page.goto("/"); await page.getByRole("radio", { name: "Interview", exact: true }).click();
  await page.getByRole("textbox", { name: "Nachricht an den Orchestrator" }).fill("Zusatz zum Interview"); await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(page.getByRole("log", { name: "Chatverlauf" })).toContainText("Zusatz zum Interview");
});
test("Interview behält Antworten beim Chat- und Moduswechsel", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Neue Paketoberfläche fehlt im Basisstand.");
  await page.goto("/"); await page.getByRole("radio", { name: "Interview", exact: true }).click();
  await page.getByLabel("Deine Antwort oder Ergänzung").fill("Mein Entwurf"); await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("radio", { name: "Ausführen", exact: true }).click(); await page.getByRole("radio", { name: "Interview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Frage 2 von 3", exact: true })).toBeVisible();
  const ursprung = await page.evaluate(async () => { const { chatEingabeQuelle: q } = await import("/src/bereiche/ChatEingabe.tsx"); const d = q.lesen(), id = d.aktiverChatId; d.chats.push({ ...structuredClone(d.chats[0]), id: "interview-zweit" }); d.aktiverChatId = "interview-zweit"; q.aktualisieren(d); return id; });
  await expect(page.getByRole("heading", { name: "Frage 1 von 3", exact: true })).toBeVisible();
  await page.getByLabel("Deine Antwort oder Ergänzung").fill("Anderer Chat"); await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.evaluate(async id => { const { chatEingabeQuelle: q } = await import("/src/bereiche/ChatEingabe.tsx"); const d = q.lesen(); d.aktiverChatId = id; q.aktualisieren(d); }, ursprung);
  await expect(page.getByRole("heading", { name: "Frage 2 von 3", exact: true })).toBeVisible();
  for (const knopf of ["Weiter", "Zusammenfassen"]) { await page.getByLabel("Deine Antwort oder Ergänzung").fill("Weitere Antwort"); await page.getByRole("button", { name: knopf, exact: true }).click(); }
  await page.getByRole("radio", { name: "Ausführen", exact: true }).click(); await page.getByRole("radio", { name: "Interview", exact: true }).click();
  await expect(page.getByRole("article", { name: "Interview", exact: true })).toContainText("Mein Entwurf");
  await expect(page.getByRole("article", { name: "Interview", exact: true })).not.toContainText("Anderer Chat");
});
