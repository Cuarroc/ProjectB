import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Interview-Vorschläge: Tastatur, voller Antworttext und freies Feld", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Interview-Knöpfe werden am Kandidaten geprüft.");
  await page.addInitScript(() => {
    window.isTauri = true; window.auftraege = []; window.callbacks = {}; window.listener = new Set();
    let id = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => window.listener.delete(id) };
    window.__TAURI_INTERNALS__ = {
      transformCallback: cb => { window.callbacks[++id] = cb; return id; },
      invoke: async (cmd, args) => {
        if (cmd === "plugin:event|listen") { window.listener.add(args.handler); return args.handler; }
        if (cmd === "plugin:event|unlisten") { window.listener.delete(args.eventId); return; }
        if (cmd === "projekte_zuletzt") return ["C:\\ProjectB"];
        if (cmd === "projekt_pruefen") return { projekt: "ProjectB", pfad: args.pfad, zweig: "main" };
        if (cmd === "kontingent") return { claude: null, codex: null };
        if (cmd === "einstellungen_laden") return {};
        if (cmd === "chats_laden") {
          if (localStorage.interviewChats) return JSON.parse(localStorage.interviewChats);
          const { chats, aktiverChatId } = (await import("/src/daten/beispiel.ts")).beispiel;
          return { chats: [{ ...chats[0], modus: "Interview", verlauf: [], gestartetUm: null }], aktiverChatId };
        }
        if (cmd === "chats_speichern") { localStorage.interviewChats = JSON.stringify(args.daten); return; }
        if (cmd === "auftrag_senden") {
          window.auftraege.push(args);
          return new Promise(resolve => { window.beenden = () => resolve({ sitzung: { id: "s-interview", anbieter: "Claude", pfad: args.pfad }, erfolg: true }); });
        }
        throw new Error(`Unerwarteter Command: ${cmd}`);
      },
    };
    window.antwort = text => window.listener.forEach(id => window.callbacks[id]({ event: "chat-nachricht", id, payload: { chat: "csv-export", text } }));
  });
  await page.goto("/");
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  const punkt = "Mein Team braucht einen CSV-Export mit Status, Dauer und Umlauten für die wöchentliche Auswertung.";
  const erster = page.getByRole("button", { name: "Nur für mich", exact: true });
  const zweiter = page.getByRole("button", { name: punkt, exact: true });
  await feld.fill("Ich möchte einen CSV-Export."); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(1);
  await page.evaluate(p => window.antwort(`Wer soll den Export nutzen?\n- Nur für mich\n- ${p}`), punkt);
  await expect(erster).toHaveCount(0); await page.evaluate(() => window.beenden());
  await expect(erster).toBeEnabled(); await expect(zweiter).toBeEnabled();
  await expect(zweiter).toHaveAccessibleName(punkt);
  await expect(zweiter.locator(".knopf-inhalt").first()).toHaveText("Mein Team braucht einen CSV-Export mit Status, Dauer und Umlauten für die…");
  await feld.fill("Eigene Ergänzung"); await expect(feld).toBeEditable();
  await erster.focus(); await expect(erster).toBeFocused(); await page.keyboard.press("Tab"); await expect(zweiter).toBeFocused();
  expect(await zweiter.evaluate(el => { const r = el.getBoundingClientRect(), karte = el.closest("article").getBoundingClientRect(); return r.left >= karte.left && r.right <= karte.right && el.scrollWidth <= el.clientWidth; })).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p52o_interview_1440x900.png`, animations: "disabled" });
  }
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.interviewChats).chats[0].verlauf.at(-1).aktionen.length)).toBe(2);
  await page.reload(); await expect(zweiter).toBeEnabled();
  await page.getByRole("radio", { name: "Ausführen", exact: true }).click();
  await zweiter.focus(); await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(1);
  expect(await page.evaluate(() => window.auftraege[0])).toMatchObject({ modus: "Interview", text: punkt, sitzung: { id: "s-interview", anbieter: "Claude", pfad: "C:\\ProjectB" } });
  await expect(page.locator(".r-du .r-msg-text").last()).toHaveText(punkt);
  await expect(page.getByRole("radio", { name: "Interview", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(erster).toHaveCount(0); await expect(zweiter).toHaveCount(0);
  await page.evaluate(() => { window.antwort("Zusammenfassung: CSV-Export fürs Team. Ist das richtig?"); window.beenden(); });
  await expect(feld).toBeEditable(); await feld.fill("Ja, genau."); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(2);
  expect(await page.evaluate(() => window.auftraege[1])).toMatchObject({ modus: "Interview", text: "Ja, genau." });
  await page.evaluate(() => window.beenden());
  await expect(feld).toBeEditable(); await feld.fill("Noch eine Frage."); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(3);
  await page.evaluate(() => { window.antwort("Wer?\n- **Nur ich**\n- *Mein Team* mit `CSV`"); window.beenden(); });
  const nurIch = page.locator(".r-aktionen").getByRole("button", { name: "Nur ich", exact: true });
  await expect(nurIch).toBeEnabled();
  await expect(page.getByRole("button", { name: "Mein Team mit CSV", exact: true })).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await nurIch.click();
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(4);
  expect(await page.evaluate(() => window.auftraege[3])).toMatchObject({ modus: "Interview", text: "Nur ich" });
  await expect(page.locator(".r-du .r-msg-text").last()).toHaveText("Nur ich");
  await page.evaluate(() => window.beenden());
});
