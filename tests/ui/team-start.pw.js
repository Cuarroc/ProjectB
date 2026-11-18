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
  // Anderes Projekt: der Kern vergibt wieder die ids des vorletzten Laufs; der neue Start muss sie zeigen.
  await page.evaluate(() => window.starts[1].auftraege.forEach(a => window.agentSenden({ ...a, id: a.name, zustand: "Fertig", liveZeile: "Fertig", laufzeitSekunden: 20 })));
  await expect(karten.getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.ids = ["aenderung", "aenderung-2", "pruefen"]; });
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  await feld.fill("Plane den dritten Lauf"); await feld.press("Enter");
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.starts.length)).toBe(3);
  await expect(karten.getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(3);
  // Gleiche ids wie der gerade angehaltene Lauf (anderes Projekt, auch nach Einzelstopp): der Start setzt trotzdem alles zurück.
  await karten.first().getByRole("button", { name: "Anhalten", exact: true }).click(); await expect(karten.first().locator(".pause-marke")).toHaveText("Angehalten");
  await page.getByRole("button", { name: "Alles anhalten", exact: true }).last().click(); await expect(page.locator(".team-echt .anhalte-hinweis")).toBeVisible();
  await page.getByRole("radio", { name: "Planen", exact: true }).click(); await feld.fill("Plane den vierten Lauf"); await feld.press("Enter");
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.starts.length)).toBe(4);
  await expect(page.locator(".team-echt .anhalte-hinweis")).toHaveCount(0); await expect(karten.getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(3);
  await expect(karten.locator(".pause-marke")).toHaveCount(0);
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
test("Projektwechsel bleibt während des Teamstarts gesperrt, Freigabe wird gespeichert", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Teamstart wird am Kandidaten geprüft.");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Freigeben und bauen", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if (cmd === "projekt_oeffnen") return { projekt: "Anderes", pfad: args.pfad, zweig: "main" };
      const antwort = await invoke(cmd, args);
      if (cmd === "team_starten") await new Promise(resolve => { window.startBeenden = resolve; });
      return antwort;
    };
  });
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.startBeenden)).toBe("function");
  await page.getByRole("button", { name: /^Projekt wählen:/ }).click();
  await page.getByRole("menuitem", { name: "Ordner öffnen…" }).click();
  await page.getByRole("textbox", { name: "Pfad zum Projekt" }).fill("C:\\Anderes");
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();
  await expect(page.getByText("Ein Auftrag läuft noch. Wechsle das Projekt, wenn er fertig ist.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.startBeenden());
  await expect(page.getByText("Plan freigegeben. Team mit 3 Agenten gestartet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Freigeben und bauen|Mit Kommentaren zurückgeben)$/ })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const chat = JSON.parse(localStorage.planChats).chats[0];
    return { freigabe: chat.verlauf[0].plan.freigabe, gestartetUm: chat.gestartetUm };
  })).toEqual({ freigabe: "Freigegeben", gestartetUm: null });
});
test("Laufendes Team sperrt zweite Freigabe und behält Karten und Stoppmarken", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Teamstart wird am Kandidaten geprüft.");
  await page.goto("/"); await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  const karten = page.locator(".team-echt [data-agent]"); await expect(karten).toHaveCount(3);
  await karten.first().getByRole("button", { name: "Anhalten", exact: true }).click();
  await expect(karten.first().locator(".pause-marke")).toHaveText("Angehalten");
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  await feld.fill("Plane den zweiten Lauf"); await feld.press("Enter");
  await page.evaluate(() => {
    window.altesEreignis = () => window.agentSenden({ ...window.starts[0].auftraege[0], id: "aenderung", zustand: "Arbeitet", liveZeile: "Arbeitet weiter", laufzeitSekunden: 15 });
  });
  const freigabe = page.getByRole("button", { name: "Freigeben und bauen", exact: true });
  await expect(freigabe).toBeDisabled();
  await expect(freigabe).toHaveAttribute("aria-disabled", "true");
  await freigabe.scrollIntoViewIfNeeded();
  const box = await freigabe.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  expect(await freigabe.evaluate(el => getComputedStyle(el).cursor)).toBe("not-allowed");
  expect.soft(await page.evaluate(() => window.starts.length)).toBe(1);
  await page.evaluate(() => window.altesEreignis());
  await expect.soft(karten.locator(".ak-name b")).toHaveText(["aenderung", "aenderung-2", "pruefen"]);
  await expect.soft(karten.first().locator(".pause-marke")).toHaveText("Angehalten");
  await expect(freigabe).toBeDisabled();
  expect(await page.evaluate(async () => (await import("/src/daten/tauri.ts")).teamLauf.neu)).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.planChats).chats[0].verlauf.at(-1).plan.freigabe)).toBe("Wartet auf dich");

  await page.getByRole("button", { name: "Plan öffnen", exact: true }).last().click();
  const dialog = page.getByRole("dialog"), bauen = dialog.getByRole("button", { name: "Freigeben und bauen", exact: true });
  await expect(bauen).toBeDisabled();
  await expect(bauen).toHaveAttribute("aria-disabled", "true");
  await expect(bauen).toHaveAttribute("title", "Das letzte Team läuft noch oder ist nicht gesichert.");
  const schritt = dialog.locator(".pl-schritt").first();
  await schritt.getByRole("button", { name: "Kommentar, Silbergrau", exact: true }).click();
  await schritt.getByRole("textbox").fill("Bitte Eingabe prüfen.");
  await schritt.getByRole("button", { name: "Simpler, Türkis", exact: true }).click();
  await expect(schritt.getByRole("button", { name: "Simpler, Türkis", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.locator(".pl-stilknopf").filter({ hasText: "Vorsichtiger" }).click();
  await expect(dialog.getByRole("button", { name: "Neu schreiben lassen", exact: true })).toBeEnabled();
  if (["1440x900", "1024x700"].includes(testInfo.project.name) && process.env.BILD_ORDNER) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p53e2_startsperre_${testInfo.project.name}.png`, animations: "disabled" });
  }
  await dialog.getByRole("button", { name: /^Mit Kommentaren zurückgeben/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/Bitte Eingabe prüfen\./).last()).toBeVisible();
  expect(await page.evaluate(() => window.starts.length)).toBe(1);
  await page.locator(".team-echt").getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect(freigabe).toBeEnabled();
});
test("Beendete Agenten mit Problem oder Frage lassen einen neuen Start zu", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Teamstart wird am Kandidaten geprüft.");
  await page.goto("/"); await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect(page.locator(".team-echt [data-agent]")).toHaveCount(3);
  await page.evaluate(() => window.starts[0].auftraege.forEach((a, i) => window.agentSenden({ ...a, id: a.name, zustand: i ? "Problem" : "Wartet auf dich", liveZeile: "Ende", laufzeitSekunden: 9 })));
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" }); await feld.fill("Plane neu"); await feld.press("Enter");
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.starts.length)).toBe(2);
});

for (const grund of [
  "Das letzte Team läuft noch oder ist nicht gesichert.",
  "In der Stufe „Vorsichtig“ arbeitet Codex nur lesend. Gib die Teilaufgabe „csv-export“ einem Claude-Agenten oder wähle eine andere Stufe.",
]) test(`Kern lehnt Teamstart ab und zeigt den Sperrgrund: ${grund}`, async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Teamstart wird am Kandidaten geprüft.");
  await page.goto("/");
  await page.evaluate(grund => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (cmd, args) => cmd === "team_starten"
      ? Promise.reject(grund) : invoke(cmd, args);
  }, grund);
  await page.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect(page.getByText(grund, { exact: true })).toBeVisible();
  await expect(page.locator(".team-echt [data-agent]")).toHaveCount(0);
});
