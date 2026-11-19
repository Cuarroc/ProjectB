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
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  await feld.fill(`/${modus.toLowerCase()}`); await feld.press("Enter");
  await expect(page.getByRole("radio", { name: modus, exact: true })).toHaveAttribute("aria-checked", "true"); await expect(feld).toHaveValue("");
});
test("/interview mit Senden wechselt den Modus ohne neue Nachricht", async ({ page }) => {
  const feld = page.locator("#chat-nachricht"), nachrichten = page.locator(".chat-nachrichten > li"), vorher = await nachrichten.count();
  await feld.fill("/interview"); await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Interview", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(feld).toHaveValue(""); await expect(nachrichten).toHaveCount(vorher);
});
test("/neu legt einen Chat an; Liste, Tastatur und Bilder", async ({ page }, info) => {
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" }); await feld.fill("/");
  const liste = page.getByRole("listbox", { name: "Befehle" }); await expect(liste.getByRole("option")).toHaveCount(5);
  await expect(feld).toHaveAttribute("aria-activedescendant", "befehl-kompakt");
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
  await feld.fill("/"); await feld.press("ArrowDown"); await feld.press("ArrowDown"); await expect(feld).toHaveAttribute("aria-activedescendant", "befehl-planen");
  await feld.press("ArrowUp"); await feld.press("Enter"); await expect(feld).toHaveValue("");
  await expect(page.locator(".rand-chat")).toHaveCount(2); await expect(page.locator(".rand-chat").last()).toContainText("Neuer Chat");
});
test("/anhalten ist ohne Lauf gesperrt und hält den echten Teamweg an", async ({ page }) => {
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" }); await feld.fill("/anhalten");
  const option = page.getByRole("option"); await expect(option).toBeDisabled(); await expect(option).toContainText("Kein Agent läuft");
  await feld.press("Enter"); await expect(feld).toHaveValue("/anhalten");
  await expect.poll(() => page.evaluate(() => [...window.listener.values()].includes("team-agent"))).toBe(true);
  await page.evaluate(() => window.agent("Arbeitet")); await expect(option).toBeEnabled(); await expect(option).toContainText("1 laufen");
  await option.click(); await expect.poll(() => page.evaluate(() => window.stopps)).toEqual([{}]); await expect(feld).toHaveValue("");
  await feld.fill("/anhalten"); await expect(option).toBeDisabled();
});

test("/kompakt ist im Browser mit Grund gesperrt und lässt den Verlauf unverändert", async ({ page }, info) => {
  await page.evaluate(() => { window.isTauri = false; });
  const feld = page.locator("#chat-nachricht"), nachrichten = page.locator(".chat-nachrichten > li"), vorher = await nachrichten.count();
  await feld.fill("/"); const option = page.getByRole("option").first();
  await expect(option).toBeDisabled(); await expect(option).toContainText("Nur in der Desktop-App");
  await feld.press("Enter");
  await expect(page.locator(".ein-meldung")).toHaveText("Nur in der Desktop-App");
  await expect(nachrichten).toHaveCount(vorher); await expect(feld).toHaveValue("/");
  await page.evaluate(() => document.fonts.ready);
  const hoehen = await page.getByRole("option").evaluateAll(zeilen => zeilen.map(z => z.getBoundingClientRect().height));
  expect(hoehen).toEqual(hoehen.map(() => hoehen[1]));
  const beschreibung = await option.locator("span small").evaluate(el => ({ hoehe: el.getBoundingClientRect().height, zeile: parseFloat(getComputedStyle(el).lineHeight) }));
  expect(beschreibung.hoehe).toBe(beschreibung.zeile);
  if (process.env.BILD_ORDNER && info.project.name !== "1280x800") {
    await page.evaluate(() => document.fonts.ready); await page.mouse.move(0, 0);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/P-8-2_kompakt_browser_${info.project.name}.png`, animations: "disabled" });
  }
});
test("/kompakt speichert die Zusammenfassung und gibt den Kontext frei", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Zusammenfassen fehlt im Basisstand.");
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd !== "auftrag_senden") return invoke(cmd, args);
      window.listener.forEach((event, id) => { if (event === "chat-nachricht") window.callbacks[id]({ event, id,
        payload: { chat: args.chat, text: "Ziel: CSV-Export. Offen: Tests. Datei: export.rs." } }); });
      return { erfolg: true, sitzung: { id: "kompakt", anbieter: "Claude", pfad: args.pfad } };
    };
  });
  const feld = page.locator("#chat-nachricht"); await feld.fill("/");
  const erste = page.getByRole("option").first(); await expect(erste).toContainText("/kompakt"); await expect(erste).toContainText(/\d+ % belegt/);
  if (process.env.BILD_ORDNER && info.project.name !== "1280x800") {
    await page.evaluate(() => document.fonts.ready); await page.mouse.move(0, 0);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/P-8-2_kompakt_${info.project.name}.png`, animations: "disabled" });
  }
  await erste.click();
  await expect(page.locator(".r-msg-name").last()).toHaveText("Zusammenfassung (Kontext freigegeben)");
  await expect(page.locator(".r-msg-text").last()).toHaveText("Ziel: CSV-Export. Offen: Tests. Datei: export.rs.");
  await expect(page.getByRole("button", { name: /^Kontext 0 % ·/ })).toBeVisible();
});
