import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Todo-Liste aus Antworten bleibt je Chat beim Neuladen erhalten", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Todo-Liste wird am Kandidaten geprüft.");
  await page.addInitScript(() => {
    window.isTauri = true; window.callbacks = {}; window.listener = new Set();
    let id = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => window.listener.delete(id) };
    window.__TAURI_INTERNALS__ = {
      transformCallback: cb => { window.callbacks[++id] = cb; return id; },
      invoke: async (cmd, args) => {
        // Die Chat-Attrappe stellt nur Chat-Ereignisse zu; Team hört separat.
        if (cmd === "plugin:event|listen") { if (args.event === "chat-nachricht") window.listener.add(args.handler); return args.handler; }
        if (cmd === "plugin:event|unlisten") { window.listener.delete(args.eventId); return; }
        if (cmd === "projekte_zuletzt") return ["C:\\ProjectB"];
        if (cmd === "projekt_pruefen") return { projekt: "ProjectB", pfad: args.pfad, zweig: "main" };
        if (cmd === "kontingent") return { claude: null, codex: null };
        if (cmd === "einstellungen_laden") return {};
        if (cmd === "chats_laden") return JSON.parse(localStorage.todoChats ?? '{"chats":[],"aktiverChatId":null}');
        if (cmd === "chats_speichern") { localStorage.todoChats = JSON.stringify(args.daten); return; }
        if (cmd === "auftrag_senden") {
          window.chatId = args.chat;
          return new Promise(resolve => { window.beenden = () => resolve({ sitzung: null, erfolg: true }); });
        }
        throw new Error(`Unerwarteter Command: ${cmd}`);
      },
    };
    window.antwort = text => window.listener.forEach(id => window.callbacks[id]({ event: "chat-nachricht", id, payload: { chat: window.chatId, text } }));
  });
  await page.goto("/");
  const rand = page.getByRole("region", { name: "Chats und Aufgaben", exact: true });
  await rand.getByRole("button", { name: /Chats und Aufgaben öffnen/ }).click();
  await expect(rand.getByText("Noch keine Aufgaben.")).toBeVisible();
  await expect(rand.getByRole("checkbox")).toHaveCount(0);
  const eigen = rand.getByRole("textbox", { name: "Aufgabe hinzufügen" });
  await eigen.fill("Selbst abnehmen"); await eigen.press("Enter");
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  await feld.fill("Baue den Export."); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => typeof window.beenden)).toBe("function");
  await page.evaluate(() => { window.antwort("Stand:\n- [x] **Daten lesen**\n* [ ] `Export` prüfen"); window.beenden(); });
  await expect(rand.getByRole("checkbox", { name: "Daten lesen" })).toBeChecked();
  const offen = rand.getByRole("checkbox", { name: "Export prüfen" });
  await expect(offen).not.toBeChecked(); await offen.check();
  await expect(rand.getByRole("checkbox", { name: "Selbst abnehmen" })).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.todoChats).chats[0].todos.filter(t => t.fertig).length)).toBe(2);
  await page.reload();
  await rand.getByRole("button", { name: /Chats und Aufgaben öffnen/ }).click();
  await expect(rand.getByRole("checkbox", { name: "Daten lesen" })).toBeChecked();
  await expect(offen).toBeChecked();
  await expect(rand.getByRole("checkbox", { name: "Selbst abnehmen" })).not.toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p52q_todo_1440x900.png`, animations: "disabled" });
  }
  await page.getByRole("region", { name: "Chat", exact: true }).getByRole("button", { name: "Neuer Chat", exact: true }).click();
  await expect(rand.getByText("Noch keine Aufgaben.")).toBeVisible();
  await expect(rand.getByRole("checkbox")).toHaveCount(0);
});
