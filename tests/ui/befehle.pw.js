import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Slash-Befehle fehlen im Basisstand.");
  await page.addInitScript(() => {
    window.isTauri = true; window.stopps = []; window.callbacks = {}; window.listener = new Map(); let id = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => window.listener.delete(id) };
    window.__TAURI_INTERNALS__ = {
      transformCallback: cb => { window.callbacks[++id] = cb; return id; },
      invoke: async (cmd, args) => {
        if (cmd === "plugin:event|listen") { window.listener.set(args.handler, args.event); return args.handler; }
        if (cmd === "plugin:event|unlisten") return;
        if (cmd === "projekte_zuletzt") return ["C:\\ProjectB"];
        if (cmd === "projekt_pruefen") return { projekt: "ProjectB", pfad: args.pfad, zweig: "main" };
        if (cmd === "kontingent") return { claude: null, codex: null };
        if (cmd === "einstellungen_laden") return {};
        if (cmd === "chats_laden") {
          const { chats, aktiverChatId } = (await import("/src/daten/beispiel.ts")).beispiel;
          return { chats: [{ ...chats[0], gestartetUm: null }], aktiverChatId };
        }
        if (cmd === "chats_speichern") return;
        if (cmd === "team_anhalten") { window.stopps.push(args); return { ordner: [], lauffehler: [], fristUeberschritten: false }; }
        throw new Error(`Unerwarteter Command: ${cmd}`);
      },
    };
    window.agent = zustand => window.listener.forEach((event, id) => {
      if (event === "team-agent") window.callbacks[id]({ event, id, payload: JSON.stringify({ id: "kern", name: "Kern", anbieter: "Codex", modell: "gpt-6.1-sol", effort: "Hoch", arbeitskopie: "C:\\ProjectB", zustand, liveZeile: "Prüft", letzteZeilen: [], tokens: 0, laufzeitSekunden: 1, fortschritt: 0, phasen: [], dateien: [], tests: null, schaetzung: null }) });
    });
  });
  await page.goto("/"); await expect(page.locator("#chat-nachricht")).toBeVisible();
});
for (const modus of ["Planen", "Interview"]) test(`/${modus.toLowerCase()} aktiviert den Modus`, async ({ page }) => {
  const feld = page.getByRole("combobox", { name: "Nachricht an den Orchestrator" }).getByRole("textbox");
  await feld.fill(`/${modus.toLowerCase()}`); await feld.press("Enter");
  await expect(page.getByRole("radio", { name: modus, exact: true })).toHaveAttribute("aria-checked", "true"); await expect(feld).toHaveValue("");
});
test("/neu legt einen Chat an; Liste, Tastatur und Bilder", async ({ page }, info) => {
  const feld = page.getByRole("combobox", { name: "Nachricht an den Orchestrator" }).getByRole("textbox"); await feld.fill("/");
  const liste = page.getByRole("listbox", { name: "Befehle" }); await expect(liste.getByRole("option")).toHaveCount(4);
  await expect(feld).toHaveAttribute("aria-activedescendant", "befehl-neu");
  expect((await new AxeBuilder({ page }).include(".chat-eingabe").analyze()).violations).toEqual([]);
  const r = await page.locator(".ein-befehle").boundingBox(); expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(info.project.use.viewport.width);
  expect(r.y + r.height).toBeLessThanOrEqual((await feld.boundingBox()).y);
  if (process.env.BILD_ORDNER && info.project.name !== "1280x800") {
    await page.evaluate(() => document.fonts.ready); await page.mouse.move(0, 0);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/P-8-1_befehle_${info.project.name}.png`, animations: "disabled" });
  }
  await feld.press("Escape"); await expect(liste).toHaveCount(0); await feld.fill("/xyz");
  await expect(page.getByText("Kein Befehl gefunden")).toBeVisible();
  await feld.fill("/"); await feld.press("ArrowDown"); await expect(feld).toHaveAttribute("aria-activedescendant", "befehl-planen");
  await feld.press("ArrowUp"); await feld.press("Enter"); await expect(feld).toHaveValue("");
  await expect(page.locator(".rand-chat")).toHaveCount(2); await expect(page.locator(".rand-chat").last()).toContainText("Neuer Chat");
});
test("/anhalten ist ohne Lauf gesperrt und hält den echten Teamweg an", async ({ page }) => {
  const feld = page.getByRole("combobox", { name: "Nachricht an den Orchestrator" }).getByRole("textbox"); await feld.fill("/anhalten");
  const option = page.getByRole("option"); await expect(option).toBeDisabled(); await expect(option).toContainText("Kein Agent läuft");
  await feld.press("Enter"); await expect(feld).toHaveValue("/anhalten");
  await expect.poll(() => page.evaluate(() => [...window.listener.values()].includes("team-agent"))).toBe(true);
  await page.evaluate(() => window.agent("Arbeitet")); await expect(option).toBeEnabled(); await expect(option).toContainText("1 laufen");
  await option.click(); await expect.poll(() => page.evaluate(() => window.stopps)).toEqual([{}]); await expect(feld).toHaveValue("");
  await feld.fill("/anhalten"); await expect(option).toBeDisabled();
});
