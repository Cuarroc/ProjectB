import { test, expect } from "@playwright/test";

test("streamt echte Chat-Ereignisse, sperrt den laufenden Chat und setzt die Sitzung fort", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Die Chatbrücke wird am Kandidaten geprüft.");
  await page.addInitScript(() => {
    window.isTauri = true; window.auftraege = []; window.projektwechsel = []; window.callbacks = {}; window.listener = new Set();
    let id = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => window.listener.delete(id) };
    window.__TAURI_INTERNALS__ = {
      transformCallback: cb => { window.callbacks[++id] = cb; return id; },
      invoke: async (cmd, args) => {
        // Die Chat-Attrappe stellt nur Chat-Ereignisse zu; Team hört separat.
        if (cmd === "plugin:event|listen") { if (args.event === "chat-nachricht") window.listener.add(args.handler); return args.handler; }
        if (cmd === "plugin:event|unlisten") { window.listener.delete(args.eventId); return; }
        if (cmd === "projekte_zuletzt") return ["C:\\ProjectB", "C:\\Anderes"];
        if (cmd === "projekt_oeffnen") { window.projektwechsel.push(args.pfad); return { projekt: "Anderes", pfad: args.pfad, zweig: "main" }; }
        if (cmd === "projekt_pruefen") return { projekt: "ProjectB", pfad: args.pfad, zweig: "main" };
        if (cmd === "kontingent") return { claude: null, codex: null };
        if (cmd === "einstellungen_laden") return {};
        if (cmd === "chats_laden") {
          const { chats, aktiverChatId } = (await import("/src/daten/beispiel.ts")).beispiel;
          return { chats, aktiverChatId };
        }
        if (cmd === "chats_speichern") return;
        if (cmd === "auftrag_senden") {
          window.auftraege.push(args);
          return new Promise(resolve => { window.beenden = () => resolve({ sitzung: { id: "s-1", anbieter: "Claude", pfad: args.pfad }, erfolg: true }); });
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
  const bisher = await page.evaluate(async () => (await import("/src/daten/beispiel.ts")).beispiel.chats[0].verlauf.map(n => `${n.von}: ${n.text}`).join("\n\n"));
  expect(await page.evaluate(() => window.auftraege[0])).toEqual({ chat: "csv-export", pfad: "C:\\ProjectB", modell: "Opus 5.5", effort: "Hoch", modus: "Ausführen", sitzung: null,
    text: `Bisheriger Verlauf dieses Chats (zur Einordnung):\n\n${bisher}\n\nNeue Nachricht:\nPrüfe den CSV-Export im geöffneten Projekt.` });
  await expect(page.getByRole("log").getByText("Prüfe den CSV-Export im geöffneten Projekt.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Orchestrator arbeitet …" })).toBeVisible();
  await expect(feld).toHaveAccessibleDescription(/Bitte warte vor dem nächsten Senden/);
  const projekt = page.getByRole("button", { name: /^Projekt wählen/ });
  await projekt.click(); await page.getByRole("menuitemradio", { name: "C:\\Anderes", exact: true }).click();
  await expect(page.getByText("Ein Auftrag läuft noch. Wechsle das Projekt, wenn er fertig ist.")).toBeVisible();
  expect(await page.evaluate(() => window.projektwechsel)).toEqual([]); await expect(projekt).toContainText("C:\\ProjectB");
  if (process.env.BILD_ORDNER) await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p52i_projektsperre_${testInfo.project.name}.png`, animations: "disabled" });
  await page.keyboard.press("Escape");
  const abstand = await page.locator(".ein-arbeitet").evaluate(hinweis => {
    const form = document.querySelector(".chat-eingabe .ein"), h = hinweis.getBoundingClientRect(), f = form.getBoundingClientRect();
    return { einzug: h.left - f.left, innen: parseFloat(getComputedStyle(form).paddingLeft), unten: f.top - h.bottom,
      soll: parseFloat(getComputedStyle(hinweis).getPropertyValue("--abstand-6")) };
  });
  expect(abstand.einzug).toBe(abstand.innen); expect(abstand.unten).toBe(abstand.soll);
  await page.evaluate(() => window.antwort("Ich prüfe den CSV-Export und seine Tests."));
  await expect(page.getByRole("log").getByText("Ich prüfe den CSV-Export und seine Tests.")).toBeVisible();
  await feld.fill("Eine zweite Nachricht"); await feld.press("Enter");
  expect(await page.evaluate(() => window.auftraege.length)).toBe(1); await expect(feld).toHaveValue("Eine zweite Nachricht");
  await page.evaluate(() => window.antwort("Die ersten Tests sind grün. Ich prüfe jetzt die Randfälle."));
  const letzte = page.getByRole("log").getByText("Die ersten Tests sind grün. Ich prüfe jetzt die Randfälle.");
  await expect(letzte).toBeVisible(); await letzte.scrollIntoViewIfNeeded(); await feld.fill("");
  await page.getByRole("button", { name: "Modell: Opus 5.5", exact: true }).click();
  const modelle = page.getByRole("menu", { name: "Modell", exact: true }).getByRole("menuitemradio");
  await expect(modelle).toHaveText(["Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "gpt-6.1-sol"]);
  const path = testInfo.project.name === "1440x900" && process.env.BILD_ORDNER ? `${process.env.BILD_ORDNER}/PR-p52g_modell_1440x900.png` : testInfo.outputPath("chat.png");
  await page.screenshot({ path }); await testInfo.attach("Offene Modellauswahl", { path, contentType: "image/png" });
  await page.getByRole("menu", { name: "Modell", exact: true }).press("Escape");
  expect(await page.evaluate(() => window.listener.size)).toBe(1);
  await page.evaluate(() => window.beenden());
  await expect(page.getByRole("status").filter({ hasText: "Orchestrator arbeitet …" })).toHaveCount(0);
  await feld.fill("Prüfe auch leere Listen."); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(2);
  expect(await page.evaluate(() => window.auftraege[1])).toMatchObject({ chat: "csv-export", modell: "Opus 5.5", effort: "Hoch", sitzung: { id: "s-1", anbieter: "Claude", pfad: "C:\\ProjectB" }, text: "Prüfe auch leere Listen." });
  await page.evaluate(() => window.beenden());
  await expect(page.getByRole("status").filter({ hasText: "Orchestrator arbeitet …" })).toHaveCount(0);
  await page.getByRole("button", { name: "Modell: Opus 5.5", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "gpt-6.1-sol", exact: true }).click();
  await feld.fill("Wie geht es weiter?"); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(3);
  expect(await page.evaluate(() => window.auftraege[2])).toMatchObject({ modell: "gpt-6.1-sol",
    text: `Bisheriger Verlauf dieses Chats (zur Einordnung):\n\n${bisher}\n\nDu: Prüfe den CSV-Export im geöffneten Projekt.\n\nOrchestrator: Ich prüfe den CSV-Export und seine Tests.\n\nOrchestrator: Die ersten Tests sind grün. Ich prüfe jetzt die Randfälle.\n\nDu: Prüfe auch leere Listen.\n\nNeue Nachricht:\nWie geht es weiter?` });
  await expect(page.locator(".r-du .r-msg-text").last()).toHaveText("Wie geht es weiter?");
  await page.evaluate(() => window.beenden());
  await expect(page.getByRole("status").filter({ hasText: "Orchestrator arbeitet …" })).toHaveCount(0);
  await projekt.click(); await page.getByRole("menuitemradio", { name: "C:\\Anderes", exact: true }).click();
  await expect(projekt).toContainText("C:\\Anderes"); expect(await page.evaluate(() => window.projektwechsel)).toEqual(["C:\\Anderes"]);
});
