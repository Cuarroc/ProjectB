import { test, expect } from "@playwright/test";

test("streamt echte Chat-Ereignisse, sperrt den laufenden Chat und setzt die Sitzung fort", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Die Chatbrücke wird am Kandidaten geprüft.");
  await page.addInitScript(() => {
    window.isTauri = true; window.auftraege = []; window.callbacks = {}; window.listener = new Set();
    let id = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => window.listener.delete(id) };
    window.__TAURI_INTERNALS__ = {
      transformCallback: cb => { window.callbacks[++id] = cb; return id; },
      invoke: async (cmd, args) => {
        if (cmd === "plugin:event|listen") { window.listener.add(args.handler); return args.handler; }
        if (cmd === "plugin:event|unlisten") { window.listener.delete(args.eventId); return; }
        if (cmd === "projekte_zuletzt") return [];
        if (cmd === "kontingent") return { claude: null, codex: null };
        if (cmd === "einstellungen_laden") return {};
        if (cmd === "auftrag_senden") {
          window.auftraege.push(args);
          return new Promise(resolve => { window.beenden = () => resolve({ sitzung: "s-1", erfolg: true }); });
        }
        throw new Error(`Unerwarteter Command: ${cmd}`);
      },
    };
    window.antwort = text => window.listener.forEach(id => window.callbacks[id]({ event: "chat-nachricht", id, payload: { chat: "csv-export", text } }));
  });
  await page.goto("/"); await expect(page.locator(".app-rahmen")).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  await feld.fill("Prüfe den CSV-Export im geöffneten Projekt."); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(1);
  await expect(page.getByRole("log").getByText("Prüfe den CSV-Export im geöffneten Projekt.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Orchestrator arbeitet …" })).toBeVisible();
  await expect(feld).toHaveAccessibleDescription(/Bitte warte vor dem nächsten Senden/);
  await page.evaluate(() => window.antwort("Ich prüfe den CSV-Export und seine Tests."));
  await expect(page.getByRole("log").getByText("Ich prüfe den CSV-Export und seine Tests.")).toBeVisible();
  await feld.fill("Eine zweite Nachricht"); await feld.press("Enter");
  expect(await page.evaluate(() => window.auftraege.length)).toBe(1); await expect(feld).toHaveValue("Eine zweite Nachricht");
  await page.evaluate(() => window.antwort("Die ersten Tests sind grün. Ich prüfe jetzt die Randfälle."));
  const letzte = page.getByRole("log").getByText("Die ersten Tests sind grün. Ich prüfe jetzt die Randfälle.");
  await expect(letzte).toBeVisible(); await letzte.scrollIntoViewIfNeeded(); await feld.fill("");
  const path = testInfo.project.name === "1440x900" ? "/home/pa/wt/_auftraege/bilder/PR-p52e_chat_1440x900.png" : testInfo.outputPath("chat.png");
  await page.screenshot({ path }); await testInfo.attach("Chat während des Laufs", { path, contentType: "image/png" });
  expect(await page.evaluate(() => window.listener.size)).toBe(1);
  await page.evaluate(() => window.beenden());
  await expect(page.getByRole("status").filter({ hasText: "Orchestrator arbeitet …" })).toHaveCount(0);
  await feld.fill("Prüfe auch leere Listen."); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(2);
  expect(await page.evaluate(() => window.auftraege[1])).toMatchObject({ chat: "csv-export", anbieter: "Claude", sitzung: "s-1", text: "Prüfe auch leere Listen." });
  await page.evaluate(() => window.beenden());
});
