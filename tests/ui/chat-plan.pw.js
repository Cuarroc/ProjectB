import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Plan freigeben oder kommentieren, auch nach Neustart", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Planknöpfe werden am Kandidaten geprüft.");
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
          if (localStorage.planChats) return JSON.parse(localStorage.planChats);
          const { chats, aktiverChatId } = (await import("/src/daten/beispiel.ts")).beispiel;
          return { chats: [{ ...chats[0], verlauf: [], gestartetUm: null }], aktiverChatId };
        }
        if (cmd === "chats_speichern") { localStorage.planChats = JSON.stringify(args.daten); return; }
        if (cmd === "auftrag_senden") {
          window.auftraege.push(args);
          return new Promise(resolve => { window.beenden = () => resolve({ sitzung: { id: "s-plan", anbieter: "Claude", pfad: args.pfad }, erfolg: true }); });
        }
        throw new Error(`Unerwarteter Command: ${cmd}`);
      },
    };
    window.antwort = text => window.listener.forEach(id => window.callbacks[id]({ event: "chat-nachricht", id, payload: { chat: "csv-export", text } }));
  });
  await page.goto("/");
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  const freigeben = page.getByRole("button", { name: "Freigeben und bauen", exact: true });
  const zurueck = page.getByRole("button", { name: "Mit Kommentaren zurückgeben", exact: true });
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  await feld.fill("Plane einen CSV-Export."); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(1);
  await page.evaluate(() => window.antwort("Ich prüfe die vorhandenen Exportfunktionen."));
  await page.evaluate(() => window.antwort("Mein Plan: CSV-Export ergänzen, leere Listen testen und das Ergebnis prüfen. Gib den Plan frei oder schicke Kommentare zurück."));
  await expect(freigeben).toHaveCount(0); await page.evaluate(() => window.beenden());
  await expect(freigeben).toBeEnabled(); await expect(zurueck).toBeEnabled();
  await freigeben.focus(); await expect(freigeben).toBeFocused(); await page.keyboard.press("Tab"); await expect(zurueck).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p52m_planknoepfe_1440x900.png`, animations: "disabled" });
  }
  await page.keyboard.press("Enter");
  await expect(feld).toHaveValue("Kommentare zum Plan: "); await expect(feld).toBeFocused();
  await expect(page.getByRole("radio", { name: "Planen", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(freigeben).toHaveCount(0); await expect(zurueck).toHaveCount(0);
  await feld.fill("Kommentare zum Plan: Bitte auch Umlaute testen."); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(2);
  await page.evaluate(() => { window.antwort("Der ergänzte Plan berücksichtigt Umlaute."); window.beenden(); });
  await expect(freigeben).toBeEnabled();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.planChats).chats[0].verlauf.at(-1).aktionen.length)).toBe(2);
  await page.reload(); await expect(freigeben).toBeEnabled();
  await freigeben.focus(); await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(1);
  expect(await page.evaluate(() => window.auftraege[0])).toMatchObject({ modus: "Ausführen", text: "Der Plan ist freigegeben. Setze ihn jetzt um.", sitzung: { id: "s-plan", anbieter: "Claude", pfad: "C:\\ProjectB" } });
  await expect(page.getByRole("radio", { name: "Ausführen", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(freigeben).toHaveCount(0); await expect(zurueck).toHaveCount(0);
  await page.evaluate(() => window.beenden());
});
