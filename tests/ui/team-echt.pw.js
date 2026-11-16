import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("zeigt echte Team-Ereignisse und hält Agenten über den Kern an", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Die Teambrücke wird am Kandidaten geprüft.");
  const seitenfehler = []; page.on("pageerror", e => seitenfehler.push(e.message));
  await page.addInitScript(() => {
    window.isTauri = true; window.stopps = []; window.callbacks = {}; window.listener = new Map(); let id = 0;
    window.bericht = { ordner: [], lauffehler: [], fristUeberschritten: false };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => window.listener.delete(id) };
    window.__TAURI_INTERNALS__ = {
      transformCallback: cb => { window.callbacks[++id] = cb; return id; },
      invoke: async (cmd, args) => {
        if (cmd === "plugin:event|listen") { window.listener.set(args.handler, args.event); return args.handler; }
        if (cmd === "plugin:event|unlisten") { window.listener.delete(args.eventId); return; }
        if (cmd === "projekte_zuletzt") return [];
        if (cmd === "kontingent") return { claude: null, codex: null };
        if (cmd === "einstellungen_laden") return {};
        if (cmd === "chats_laden") return { chats: [], aktiverChatId: null };
        if (cmd === "chats_speichern") return;
        if (cmd === "team_anhalten") { window.stopps.push(args); if (window.stopFehler) throw window.stopFehler; return window.bericht; }
        throw new Error(`Unerwarteter Command: ${cmd}`);
      },
    };
    window.agentSenden = agent => window.listener.forEach((event, id) => {
      if (event === "team-agent") window.callbacks[id]({ event, id, payload: JSON.stringify(agent) });
    });
  });
  await page.goto("/"); await page.evaluate(() => document.fonts.ready);
  const team = page.locator(".team-spalte"), karten = team.locator("[data-agent]"), kopf = page.locator(".app-kopf");
  await expect(team.getByText("Noch kein Team.")).toBeVisible();
  await expect(team.getByText("Es startet, wenn ein Plan gebaut wird.")).toBeVisible();
  await expect(karten).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include(".team-spalte").analyze()).violations).toEqual([]);
  await expect.poll(() => page.evaluate(() => [...window.listener.values()].includes("team-agent"))).toBe(true);
  const kern = { id: "real-kern", name: "CSV-Kern", anbieter: "Codex", modell: "gpt-6.1-sol", effort: "Hoch", arbeitskopie: "C:\\Projekt\\kern",
    zustand: "Arbeitet", liveZeile: "Prüft den CSV-Export", letzteZeilen: ["CSV wird geprüft"], tokens: 0, laufzeitSekunden: 83,
    fortschritt: 0, phasen: [], dateien: [{ pfad: "src/csv.rs", hinzugefuegt: 8, entfernt: 2 }], tests: null, schaetzung: null };
  const pruefer = { ...kern, id: "real-review", name: "CSV-Prüfer", anbieter: "Claude", modell: "Sonnet 5.5", zustand: "Fertig", liveZeile: "Prüfung abgeschlossen" };
  await page.evaluate(([a, b]) => { window.agentSenden(a); window.agentSenden(b); }, [kern, pruefer]);
  await expect(karten).toHaveCount(2); await expect(team.getByText("2 Agenten", { exact: true })).toBeVisible();
  await expect(karten.locator(".ak-name b")).toHaveText([kern.name, pruefer.name]);
  await expect(karten.locator(".mk")).toHaveText(["Arbeitet", "Fertig"]);
  await expect(karten.first()).toContainText("1:23 min");
  await page.evaluate(a => window.agentSenden({ ...a, name: "CSV-Kern aktuell", liveZeile: "Schreibt CSV", laufzeitSekunden: 95 }), kern);
  await expect(karten).toHaveCount(2); await expect(karten.locator(".ak-name b")).toHaveText(["CSV-Kern aktuell", pruefer.name]);
  await expect(karten.first()).toContainText("Schreibt CSV"); await expect(karten.first()).toContainText("1:35 min");
  await expect(team.locator(".team-achse, .team-kacheln, .zs")).toHaveCount(0);
  await expect(team.getByRole("button", { name: /Fortsetzen|Weitermachen/ })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include(".team-spalte").analyze()).violations).toEqual([]);
  if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p53d_team_echt_1440x900.png`, animations: "disabled" });
  }
  await karten.first().locator(".ak-kopf").click();
  const details = team.getByRole("complementary", { name: "Details: CSV-Kern aktuell" });
  await expect(details).toContainText("src/csv.rs"); await expect(details).toContainText("+8 −2");
  await expect(details).not.toContainText("14:30"); await details.press("Escape");
  await expect(karten.first().locator(".ak-kopf")).toBeFocused();
  await karten.first().getByRole("button", { name: "Anhalten", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.stopps)).toEqual([{ name: "CSV-Kern aktuell" }]);
  await page.evaluate(() => { window.bericht.ordner = [{ ordner: "kern", status: "fehler", meldung: "Sichern fehlgeschlagen" }]; });
  await karten.first().getByRole("button", { name: "Anhalten", exact: true }).click();
  await expect(team.locator(".to-zeile")).toHaveText("Sichern fehlgeschlagen");
  await page.evaluate(() => { window.bericht = { ordner: [], lauffehler: [{ pid: 42, meldung: "Prozess läuft noch" }], fristUeberschritten: true }; });
  await team.getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect(team.locator(".to-zeile").last()).toHaveText("Prozess läuft noch · Anhalten hat zu lange gedauert.");
  await page.evaluate(() => { window.stopFehler = "Kern nicht erreichbar"; });
  await kopf.getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect(team.locator(".to-zeile").last()).toHaveText("Kern nicht erreichbar");
  await expect(kopf.getByRole("button", { name: "Alles anhalten", exact: true })).toBeVisible();
  await page.evaluate(() => { window.stopFehler = null; window.bericht = { ordner: [{ ordner: "kern", status: "gesichert", sha: "abc" }], lauffehler: [], fristUeberschritten: false }; });
  await kopf.getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect(team.locator(".anhalte-hinweis")).toContainText("Angehalten");
  await expect(kopf.locator(".anhalte-kopf")).toHaveText("Angehalten");
  expect((await page.evaluate(() => window.stopps)).slice(2)).toEqual([{}, {}, {}]);
  await expect(page.getByRole("button", { name: /Fortsetzen|Weitermachen|Alles anhalten/ })).toHaveCount(0);
  expect(seitenfehler).toEqual([]);
});
