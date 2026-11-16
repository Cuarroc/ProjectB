import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Postfach zählt offene Nachrichten und führt zum richtigen Chat", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Postfach wird am Kandidaten geprüft.");
  await page.addInitScript(() => {
    window.isTauri = true; window.callbacks = {}; window.listener = new Set(); let id = 0;
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
          const { chats } = (await import("/src/daten/beispiel.ts")).beispiel;
          const nachricht = (id, text, aktionen = []) => ({ id, text, aktionen, von: "Orchestrator", zeit: "12:00" });
          return { aktiverChatId: "plan", chats: [
            { ...chats[0], id: "plan", titel: "Export planen", modus: "Planen", gestartetUm: null,
              verlauf: [nachricht("p", "Mein Exportplan", [{ id: "plan-freigeben", text: "Freigeben und bauen" }, { id: "plan-kommentieren", text: "Mit Kommentaren zurückgeben" }])] },
            { ...chats[0], id: "frage", titel: "Format klären", modus: "Interview", gestartetUm: null,
              verlauf: [...Array.from({ length: 20 }, (_, i) => nachricht(`info-${i}`, `Weitere Information ${i}`)),
                nachricht("f", "Welches Dateiformat?", [{ id: "antwort-0", text: "CSV", antwort: "CSV" }, { id: "antwort-1", text: "JSON", antwort: "JSON" }])] },
          ] };
        }
        if (cmd === "chats_speichern") { localStorage.postfachChats = JSON.stringify(args.daten); return; }
        if (cmd === "auftrag_senden") return new Promise(resolve => { window.beenden = () => resolve({ sitzung: null, erfolg: true }); });
        throw new Error(`Unerwarteter Command: ${cmd}`);
      },
    };
  });
  await page.goto("/");
  const oben = page.locator(".kopf .rand-postfach"), liste = page.locator(".kopf .postfach-eintraege");
  await expect(oben).toHaveAccessibleName("Postfach 2 warten auf dich");
  await oben.click();
  await expect(liste.getByRole("button")).toHaveCount(2);
  await oben.focus(); await page.keyboard.press("Tab");
  await expect(liste.getByRole("button").first()).toBeFocused();
  await page.keyboard.press("Tab"); await expect(liste.getByRole("button").nth(1)).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p52r_postfach_1440x900.png`, animations: "disabled" });
  }
  await liste.getByRole("button", { name: "Frage wartet auf Antwort Format klären" }).click();
  await expect(oben).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.postfachChats).aktiverChatId)).toBe("frage");
  const frage = page.getByRole("article").filter({ hasText: "Welches Dateiformat?" });
  await expect(frage).toBeInViewport(); await expect(frage).toBeFocused();
  await oben.click(); await page.keyboard.press("Escape");
  await expect(oben).toBeFocused(); await expect(liste).toHaveCount(0);
  await oben.click(); await liste.getByRole("button", { name: /Plan wartet/ }).click();
  await expect(page.getByRole("article").filter({ hasText: "Mein Exportplan" })).toBeFocused();
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect(oben).toHaveAccessibleName("Postfach 1 wartet auf dich");
  await expect.poll(() => page.evaluate(() => typeof window.beenden)).toBe("function");
  await page.evaluate(() => window.beenden());
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
