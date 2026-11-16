import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.isTauri = true; window.starts = []; window.stopps = []; window.chatStarts = 0; window.callbacks = {}; window.listener = new Map(); let id = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_event, id) => window.listener.delete(id) };
    window.agentSenden = agent => window.listener.forEach((event, id) => {
      if (event === "team-agent") window.callbacks[id]({ event, id, payload: JSON.stringify(agent) });
    });
    window.__TAURI_INTERNALS__ = {
      transformCallback: cb => { window.callbacks[++id] = cb; return id; },
      invoke: async (cmd, args) => {
        if (cmd === "plugin:event|listen") { window.listener.set(args.handler, args.event); return args.handler; }
        if (cmd === "plugin:event|unlisten") { window.listener.delete(args.eventId); return; }
        if (cmd === "projekte_zuletzt") return ["C:\\ProjectB"];
        if (cmd === "projekt_pruefen") return { projekt: "ProjectB", pfad: args.pfad, zweig: "main" };
        if (cmd === "kontingent") return { claude: null, codex: null };
        if (cmd === "einstellungen_laden") return {};
        if (cmd === "chats_speichern") { localStorage.planChats = JSON.stringify(args.daten); return; }
        if (cmd === "chats_laden") {
          if (localStorage.planChats) return JSON.parse(localStorage.planChats);
          const { beispiel } = await import("/src/daten/beispiel.ts"), { antwortPlan } = await import("/src/daten/plan.ts");
          const text = ["Änderung", "Änderung", "Prüfen", "Abschluss"].map((t, i) => `- [ ] ${t}\n  Beschreibung ${i + 1}\n  Fertig, wenn Kriterium ${i + 1}`).join("\n");
          const daten = { aktiverChatId: beispiel.aktiverChatId, chats: [{ ...beispiel.chats[0], modus: "Planen", modell: window.modell || "gpt-6.1-sol", effort: "Sehr hoch", gestartetUm: null,
            verlauf: [{ id: "plan", von: "Orchestrator", zeit: "14:30", text, plan: antwortPlan(text, "plan"), aktionen: [
              { id: "plan-freigeben", text: "Freigeben und bauen" }, { id: "plan-kommentieren", text: "Mit Kommentaren zurückgeben" }] }] }] };
          localStorage.planChats = JSON.stringify(daten); return daten;
        }
        if (cmd === "team_anhalten") { window.stopps.push(args); return { ordner: [], lauffehler: [], fristUeberschritten: false }; }
        if (cmd === "team_starten") {
          window.starts.push(args); if (window.startFehler) throw "Teamstart fehlgeschlagen";
          args.auftraege.forEach((a, i) => window.agentSenden({ ...a, id: window.ids?.[i] ?? a.name, zustand: window.sofortProblem && i === 0 ? "Problem" : "Arbeitet", liveZeile: "Bearbeitet den Plan", laufzeitSekunden: 12,
            tokens: 0, fortschritt: 0, arbeitskopie: `C:\\ProjectB\\.worktrees\\${a.name}`, phasen: [], dateien: [], letzteZeilen: [], tests: null, schaetzung: null }));
          return;
        }
        if (cmd === "auftrag_senden") {
          window.chatStarts++; window.listener.forEach((event, id) => {
            if (event === "chat-nachricht") window.callbacks[id]({ event, id, payload: { chat: args.chat, text: "- [ ] Neu\n- [ ] Zweiter\n- [ ] Dritter" } });
          }); return { sitzung: null, erfolg: true };
        }
        throw new Error(`Unerwarteter Command: ${cmd}`);
      },
    };
  });
});
for (const [modell, anbieter] of [["gpt-6.1-sol", "Codex"], ["Sonnet 5.5", "Claude"]]) {
  test(`Plan startet drei Agenten mit ${anbieter}, Einzelstopp bleibt sichtbar`, async ({ page }, testInfo) => {
    test.skip(process.env.UI_BASELINE === "1", "Teamstart wird am Kandidaten geprüft.");
    await page.addInitScript(modell => { window.modell = modell; }, modell);
    await page.goto("/");
    await page.getByRole("button", { name: "Plan öffnen", exact: true }).click();
    const dialog = page.getByRole("dialog"), schritt = dialog.locator(".pl-schritt").first();
    await schritt.getByRole("button", { name: "Kommentar, Silbergrau", exact: true }).click();
    await schritt.getByRole("textbox").fill("Bitte Umlaute prüfen.");
    await dialog.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
    await expect(page.getByText("Plan freigegeben. Team mit 3 Agenten gestartet.", { exact: true })).toBeVisible();
    const starts = await page.evaluate(() => window.starts);
    expect(await page.evaluate(() => window.chatStarts)).toBe(0);
    expect(starts).toHaveLength(1); expect(starts[0].pfad).toBe("C:\\ProjectB");
    expect(starts[0].auftraege.map(a => a.name)).toEqual(["aenderung", "aenderung-2", "pruefen"]);
    const plantext = await page.evaluate(() => JSON.parse(localStorage.planChats).chats[0].verlauf[0].text);
    starts[0].auftraege.forEach((a, i) => {
      expect(a).toMatchObject({ modell, anbieter, effort: "Sehr hoch" });
      expect(a.text.startsWith(`Freigegebener Plan (ganz):\n${plantext}\n\nDeine Schritte:\n`)).toBe(true); expect(a.text).toContain("Beachte dabei:\n- Änderung: [Kommentar] Bitte Umlaute prüfen.");
      expect(a.text).toContain("Arbeite nur in deiner Arbeitskopie. Committe am Ende mit einer kurzen Nachricht.");
      for (let j = 0; j < 4; j++) {
        expect(a.text.split("Deine Schritte:\n")[1].includes(`Beschreibung ${j + 1}`)).toBe(j % 3 === i);
        expect(a.text.split("Deine Schritte:\n")[1].includes(`Fertig, wenn Kriterium ${j + 1}`)).toBe(j % 3 === i);
      }
    });
    await expect(page.getByRole("button", { name: /^(Freigeben und bauen|Mit Kommentaren zurückgeben)$/ })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.planChats).chats[0].verlauf[0].plan.freigabe)).toBe("Freigegeben");
    const karten = page.locator(".team-echt [data-agent]"); await expect(karten).toHaveCount(3);
    await karten.first().getByRole("button", { name: "Anhalten", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.stopps)).toEqual([{ name: "aenderung" }]);
    await page.evaluate(() => window.agentSenden({ ...window.starts[0].auftraege[0], id: "aenderung", zustand: "Problem", liveZeile: "Prozess beendet", laufzeitSekunden: 13 }));
    await expect(karten.first().locator(".ak-zeile")).toHaveText("Angehalten.");
    await expect(karten.first().locator(".pause-marke")).toHaveText("Angehalten"); await expect(karten.first()).not.toContainText("Problem");
    await expect(karten.first().getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(0);
    if (anbieter === "Codex" && testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p53e_team_start_1440x900.png`, animations: "disabled" });
    }
  });
}
for (const sofortProblem of [true, false]) {
  test(sofortProblem ? "Frühes Problem erhält alle drei Karten desselben Starts" : "Unbekannte id nach natürlichem Ende hängt ohne Start an", async ({ page }) => {
    test.skip(process.env.UI_BASELINE === "1", "Teamstart wird am Kandidaten geprüft.");
    await page.addInitScript(wert => { window.sofortProblem = wert; }, sofortProblem); await page.goto("/");
    await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
    const karten = page.locator(".team-echt [data-agent]"); await expect(karten).toHaveCount(3);
    if (sofortProblem) { await expect(karten.first().locator(".mk")).toHaveText("Problem"); return; }
    await page.evaluate(() => {
      window.starts[0].auftraege.forEach(a => window.agentSenden({ ...a, id: a.name, zustand: "Fertig", liveZeile: "Fertig", laufzeitSekunden: 20 }));
    });
    await expect(karten.getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(0);
    await page.evaluate(() => window.agentSenden({ ...window.starts[0].auftraege[0], id: "spaet", name: "spaet", zustand: "Arbeitet", liveZeile: "Spät", laufzeitSekunden: 1 }));
    await expect(karten.locator(".ak-name b")).toHaveText(["aenderung", "aenderung-2", "pruefen", "spaet"]);
  });
}
test("Zweite Planfreigabe nach natürlichem Ende ersetzt alle alten Karten", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Teamstart wird am Kandidaten geprüft.");
  await page.goto("/"); await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  const karten = page.locator(".team-echt [data-agent]"); await expect(karten).toHaveCount(3);
  await page.evaluate(() => window.starts[0].auftraege.forEach(a => window.agentSenden({ ...a, id: a.name, zustand: "Fertig", liveZeile: "Fertig", laufzeitSekunden: 20 })));
  await expect(karten.getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  await feld.fill("Plane den zweiten Lauf"); await feld.press("Enter");
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.starts.length)).toBe(2);
  await expect(karten.locator(".ak-name b")).toHaveText(["neu", "zweiter", "dritter"]);
  await expect(karten.getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(3);
  // Ein spätes Ereignis des alten Laufs erzeugt keine Geisterkarte; das folgende neue Ereignis zeigt, dass es verarbeitet wurde.
  await page.evaluate(() => { window.agentSenden({ ...window.starts[0].auftraege[0], id: "aenderung", zustand: "Fertig", liveZeile: "Spät", laufzeitSekunden: 30 });
    window.agentSenden({ ...window.starts[1].auftraege[0], id: "neu", zustand: "Arbeitet", liveZeile: "Weiter", laufzeitSekunden: 2 }); });
  await expect(karten.first()).toContainText("Weiter");
  await expect(karten.locator(".ak-name b")).toHaveText(["neu", "zweiter", "dritter"]);
  // Anderes Projekt: der Kern vergibt wieder die ids des vorletzten Laufs; der neue Start muss sie zeigen.
  await page.evaluate(() => window.starts[1].auftraege.forEach(a => window.agentSenden({ ...a, id: a.name, zustand: "Fertig", liveZeile: "Fertig", laufzeitSekunden: 20 })));
  await expect(karten.getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.ids = ["aenderung", "aenderung-2", "pruefen"]; });
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  await feld.fill("Plane den dritten Lauf"); await feld.press("Enter");
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.starts.length)).toBe(3);
  await expect(karten.getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(3);
});
test("Fehler beim Teamstart lässt Plan und Freigabeknöpfe stehen", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Teamstart wird am Kandidaten geprüft.");
  await page.addInitScript(() => { window.startFehler = true; }); await page.goto("/");
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect(page.getByText("Teamstart fehlgeschlagen", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Freigeben und bauen", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Mit Kommentaren zurückgeben", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.planChats).chats[0].verlauf[0].plan.freigabe)).toBe("Wartet auf dich");
  await page.evaluate(() => { window.startFehler = false; });
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect(page.getByText("Plan freigegeben. Team mit 3 Agenten gestartet.", { exact: true })).toBeVisible();
});
