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
  await expect.soft(karten.locator(".mk")).toHaveText(["Arbeitet", "Wartet auf dich"]);
  await expect.soft(karten.last()).toContainText("Arbeit fertig. Tests, Review und PR fehlen noch.");
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
  // Erst der Fehlschlag (Knopf bleibt), dann der gelungene Einzelstopp (Knopf verschwindet).
  await page.evaluate(() => { window.bericht.ordner = [{ ordner: "kern", status: "fehler", meldung: "Sichern fehlgeschlagen" }]; });
  await karten.first().getByRole("button", { name: "Anhalten", exact: true }).click();
  await expect(team.locator(".to-zeile")).toHaveText("Sichern fehlgeschlagen");
  await page.evaluate(() => { window.bericht.ordner = []; });
  await karten.first().getByRole("button", { name: "Anhalten", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.stopps)).toEqual([{ name: "CSV-Kern aktuell" }, { name: "CSV-Kern aktuell" }]);
  await expect(karten.first().getByRole("button", { name: "Anhalten", exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.bericht = { ordner: [], lauffehler: [{ pid: 42, meldung: "Prozess läuft noch" }], fristUeberschritten: true }; });
  await team.getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect.soft(team.locator('.to[data-art="problem"] .to-zeile').last()).toHaveText("Prozess läuft noch");
  await page.evaluate(() => { window.stopFehler = "Kern nicht erreichbar"; });
  await kopf.getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect(team.locator(".to-zeile").last()).toHaveText("Kern nicht erreichbar");
  await expect(kopf.getByRole("button", { name: "Alles anhalten", exact: true })).toBeVisible();
  while (await team.locator('.to:not(.weg) [data-zu]').count()) await team.locator('.to:not(.weg) [data-zu]').first().click();
  await page.evaluate(() => { window.stopFehler = null; window.bericht = { ordner: [{ ordner: "kern", status: "gesichert", sha: "abc" }], lauffehler: [], fristUeberschritten: true }; });
  await kopf.getByRole("button", { name: "Alles anhalten", exact: true }).click();
  await expect.soft(team.locator(".anhalte-hinweis")).toContainText("Angehalten");
  await expect.soft(kopf.locator(".anhalte-kopf")).toHaveText("Angehalten");
  await expect.soft(team.locator('.to[data-art="info"] .to-zeile')).toHaveText("Anhalten hat zu lange gedauert.");
  await expect.soft(team.locator('.to[data-art="problem"]')).toHaveCount(0);
  expect((await page.evaluate(() => window.stopps)).slice(2)).toEqual([{}, {}, {}]);
  await expect.soft(page.getByRole("button", { name: /Fortsetzen|Weitermachen|Alles anhalten/ })).toHaveCount(0);
  await page.evaluate(a => window.agentSenden(a), kern);
  await expect.soft(karten).toHaveCount(2);
  await expect.soft(team.locator(".anhalte-hinweis")).toBeVisible();
  await page.evaluate(a => window.agentSenden({ ...a, id: "neuer-lauf", name: "Neuer Agent" }), kern);
  await expect.soft(karten.locator(".ak-name b")).toHaveText(["Neuer Agent"]);
  await expect.soft(team.locator(".anhalte-hinweis")).toHaveCount(0);
  await expect.soft(kopf.getByRole("button", { name: "Alles anhalten", exact: true })).toBeVisible();
  await expect.soft(karten.getByRole("button", { name: "Anhalten", exact: true })).toBeVisible();
  expect(seitenfehler).toEqual([]);
});

const dateiAgent = { id: "datei-kern", name: "Datei-Kern", anbieter: "Codex", modell: "gpt-6.1-sol", effort: "Hoch",
  zustand: "Arbeitet", liveZeile: "Ändert den Export", letzteZeilen: ["Export wird geprüft"], tokens: 0, laufzeitSekunden: 83,
  fortschritt: 0, phasen: [], dateien: [{ pfad: "src/csv.rs", hinzugefuegt: 1, entfernt: 1 }, { pfad: "bild.png", hinzugefuegt: 0, entfernt: 0 }], tests: null, schaetzung: null };
const dateiDiff = "diff --git a/src/csv.rs b/src/csv.rs\nindex 1234567..abcdef0 100644\n--- a/src/csv.rs\n+++ b/src/csv.rs\n@@ -1,2 +1,2 @@\n Kontext\n-alt\n+neu\n… gekürzt";

async function ganzImBereich(inhalt, bereich) {
  const box = await inhalt.boundingBox(), sichtbar = await bereich.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(sichtbar.y);
  expect(box.y + box.height).toBeLessThanOrEqual(sichtbar.y + sichtbar.height);
}

test.describe("Echte Team-Details", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(process.env.UI_BASELINE === "1", "Die Dateivorschau wird am Kandidaten geprüft.");
    await page.addInitScript(() => {
      window.isTauri = true; window.prAnfragen = []; window.dateiAnfragen = []; window.callbacks = {}; window.listener = new Map(); let id = 0;
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
          if (cmd === "pr_oeffnen") { window.prAnfragen.push(args); if (window.prFehler) throw window.prFehler; return; }
          if (cmd === "team_datei_ansehen") return new Promise((resolve, reject) => window.dateiAnfragen.push({ args, resolve, reject }));
          throw new Error(`Unerwarteter Command: ${cmd}`);
        },
      };
      window.agentSenden = agent => window.listener.forEach((event, id) => {
        if (event === "team-agent") window.callbacks[id]({ event, id, payload: JSON.stringify(agent) });
      });
    });
    await page.goto("/"); await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => [...window.listener.values()].includes("team-agent"))).toBe(true);
    await page.evaluate(a => window.agentSenden(a), dateiAgent);
    await page.locator(`[data-agent="${dateiAgent.id}"] .ak-kopf`).click();
  });

  test("zeigt Kern-Beleg, Tests und Review OK, Funde und laufendes Review", async ({ page }, testInfo) => {
    test.skip(process.env.UI_BASELINE === "1", "Review-Anzeige wird am Kandidaten geprüft.");
    const beleg = { titel: "CSV-Export geprüft", prLink: "https://github.com/Cuarroc/ProjectB/pull/250" };
    const fertig = { ...dateiAgent, zustand: "Fertig", liveZeile: "Review OK (Claude)", beleg,
      tests: { gruenSeit: null, gruen: 12, gesamt: 12, verlauf: [] }, review: { familie: "Claude", urteil: "OK", text: "" } };
    const details = page.locator("#team-details"), karte = page.locator(`[data-agent="${dateiAgent.id}"]`);
    await page.evaluate(a => window.agentSenden(a), fertig);
    await expect(page.locator(".team-chip")).toHaveText("1 Agent");
    await expect(karte.locator(".mk")).toHaveText("Fertig");
    await expect(details.locator(".tm-status")).toHaveText("Fertig");
    for (const ort of [karte, details]) {
      await expect(ort.getByRole("link", { name: "PR ansehen" })).toHaveAttribute("href", beleg.prLink);
      await expect(ort.getByRole("link", { name: "PR ansehen" })).toHaveAttribute("target", "_blank");
      await ort.getByRole("link", { name: "PR ansehen" }).click();
    }
    expect(await page.evaluate(() => window.prAnfragen)).toEqual([{ url: beleg.prLink }, { url: beleg.prLink }]);
    await expect(details).toContainText(beleg.titel);
    await expect(details).toContainText("12 von 12 grün");
    const review = details.locator(".tm-dkarte").filter({ has: page.getByRole("heading", { name: "Review", exact: true }) });
    const reviewImBild = async () => {
      await review.scrollIntoViewIfNeeded();
      const karte = await review.boundingBox(), bereich = await details.boundingBox();
      expect(karte).not.toBeNull();
      expect(bereich).not.toBeNull();
      expect(karte.x).toBeGreaterThanOrEqual(bereich.x);
      expect(karte.y).toBeGreaterThanOrEqual(bereich.y);
      expect(karte.x + karte.width).toBeLessThanOrEqual(bereich.x + bereich.width);
      expect(karte.y + karte.height).toBeLessThanOrEqual(bereich.y + bereich.height);
    };
    await expect(review).toContainText("Claude");
    await expect(review.locator(".mk-fertig")).toHaveText("OK");
    if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
      await page.mouse.move(0, 0);
      await reviewImBild();
      await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p64_review_1440x900.png`, animations: "disabled" });
    }
    const funde = { ...dateiAgent, id: "funde", name: "CSV-Funde", zustand: "Wartet auf dich",
      tests: { gruenSeit: null, gruen: 5, gesamt: 5, verlauf: [] },
      review: { familie: "Claude", urteil: "FUNDE", text: "P2: Leere CSV wird nicht abgefangen.\nBitte Eingabe prüfen." } };
    await page.evaluate(a => window.agentSenden(a), funde);
    await page.locator('[data-agent="funde"] .ak-kopf').click();
    await expect(details.locator(".tm-status")).toHaveText("Wartet auf dich");
    await ganzImBereich(details.locator(".tm-det-kopf"), details);
    await reviewImBild();
    await details.evaluate(el => { el.scrollTop = 0; });
    await ganzImBereich(details.locator(".tm-det-kopf"), details);
    await expect(review).toContainText("Claude");
    await expect(review.locator(".mk-wartet")).toHaveText("Funde");
    await expect(review.locator("pre")).toHaveText(funde.review.text);
    await expect(details).toContainText("5 von 5 grün");
    if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
      await page.mouse.move(0, 0);
      await ganzImBereich(details.locator(".tm-det-kopf"), details);
      await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p64_funde_1440x900.png`, animations: "disabled" });
    }
    expect((await new AxeBuilder({ page }).include(".team-spalte").analyze()).violations).toEqual([]);
    await page.evaluate(a => window.agentSenden({ ...a, zustand: "Arbeitet", review: { ...a.review, urteil: null, text: "" } }), funde);
    await expect(review).toContainText("Review durch Claude läuft");
    await page.evaluate(a => window.agentSenden({ ...a, review: null }), funde);
    await expect(review).toHaveCount(0);
  });

  test("Details stehen direkt unter 1, 2 oder 3 Agenten und öffnen oben", async ({ page }) => {
    const details = page.locator("#team-details"), liste = page.locator(".team-echt .team-liste");
    for (const anzahl of [1, 2, 3]) {
      const agent = { ...dateiAgent, id: anzahl === 1 ? dateiAgent.id : `agent-${anzahl}`, name: `Agent ${anzahl}`, zustand: "Fertig",
        beleg: { titel: "CSV-Export geprüft", prLink: "https://github.com/Cuarroc/ProjectB/pull/250" },
        review: { familie: "Claude", urteil: "FUNDE", text: "P2: Bitte Eingabe prüfen.\n".repeat(20) } };
      await details.evaluate(el => { el.scrollTop = 200; });
      await page.evaluate(a => window.agentSenden(a), agent);
      if (anzahl === 1) await details.press("Escape");
      await page.locator(`[data-agent="${agent.id}"] .ak-kopf`).click();
      await expect(details).toBeFocused();
      const ende = await liste.boundingBox(), box = await details.boundingBox();
      expect(box.y - ende.y - ende.height).toBeGreaterThanOrEqual(0);
      expect(box.y - ende.y - ende.height).toBeLessThanOrEqual(24);
      expect(await details.evaluate(el => el.scrollTop)).toBe(0);
      await ganzImBereich(details.locator(".tm-det-kopf"), details);
      await ganzImBereich(details.locator(".tm-det-leiste").first(), details);
      await ganzImBereich(details.getByRole("heading", { name: "Kennzahlen" }), details);
      await expect(details.locator(".tm-det-leiste").first()).toBeInViewport({ ratio: 1 });
      const geometrie = await details.evaluate(el => ({ sichtbar: el.clientHeight, inhalt: el.scrollHeight,
        abstand: el.closest(".team-bereich").getBoundingClientRect().bottom - el.getBoundingClientRect().bottom,
        erlaubt: parseFloat(getComputedStyle(el).getPropertyValue("--abstand-4")) }));
      expect(geometrie.inhalt).toBeGreaterThan(geometrie.sichtbar);
      expect(geometrie.abstand).toBeGreaterThanOrEqual(0);
      expect(geometrie.abstand).toBeLessThanOrEqual(geometrie.erlaubt + 1);
      await details.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const letzte = await details.locator(".tm-dkarte").last().boundingBox();
      expect(letzte.y + letzte.height).toBeLessThanOrEqual(box.y + box.height);
    }
  });

  test("zeigt Fehler beim PR-Öffnen an beiden Links kurz an", async ({ page }) => {
    await page.evaluate(a => { window.prFehler = "Browser konnte nicht geöffnet werden"; window.agentSenden(a); },
      { ...dateiAgent, zustand: "Fertig", beleg: { titel: "Geprüft", prLink: "https://github.com/Cuarroc/ProjectB/pull/250" } });
    for (const ort of [page.locator(`[data-agent="${dateiAgent.id}"]`), page.locator("#team-details")]) {
      await ort.getByRole("link", { name: "PR ansehen" }).click();
      await expect(ort.getByRole("status")).toHaveText("Browser konnte nicht geöffnet werden");
      await expect(ort.getByRole("status")).toHaveCount(0, { timeout: 6000 });
    }
  });

  test("zeigt Diff, Binärhinweis und Fehler mit Fokus-Rückgabe", async ({ page }, testInfo) => {
    const details = page.getByRole("complementary", { name: "Details: Datei-Kern" });
    const knoepfe = details.getByRole("button", { name: "Ansehen", exact: true });
    const vorschau = details.getByRole("region", { name: "Vorschau" });
    await expect(knoepfe).toHaveCount(2); await knoepfe.first().click();
    await expect(vorschau).toHaveAttribute("aria-busy", "true");
    await expect(vorschau).toContainText("Lädt …"); await expect(vorschau).toBeFocused();
    expect(await page.evaluate(() => window.dateiAnfragen.map(a => a.args))).toEqual([{ name: dateiAgent.name, pfad: "src/csv.rs" }]);
    await page.evaluate(diff => window.dateiAnfragen[0].resolve(diff), dateiDiff);
    await expect(vorschau).toHaveAttribute("aria-busy", "false");
    await expect(vorschau.locator("code")).toHaveText("src/csv.rs");
    await expect(vorschau.locator("pre")).toHaveText(dateiDiff);
    await expect(vorschau.locator(".tm-diff-plus")).toHaveText("+neu");
    await expect(vorschau.locator(".tm-diff-minus")).toHaveText("-alt");
    await vorschau.locator(".tm-diff-plus").scrollIntoViewIfNeeded();
    await expect(vorschau.locator(".tm-diff-plus")).toBeInViewport();
    expect(await vorschau.locator(".tm-diff-plus").evaluate(el => getComputedStyle(el).color))
      .not.toBe(await vorschau.locator(".tm-diff-minus").evaluate(el => getComputedStyle(el).color));
    await expect(vorschau.locator(".tm-diff-kopf")).toHaveCount(3);
    await expect(vorschau.locator("pre span[class]").filter({ hasText: /^\+\+\+|^---/ })).toHaveCount(0);
    expect((await new AxeBuilder({ page }).include(".team-spalte").analyze()).violations).toEqual([]);
    if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p53g_ansehen_1440x900.png`, animations: "disabled" });
    }
    await vorschau.getByRole("button", { name: "Vorschau schließen" }).click();
    await expect(vorschau).toHaveCount(0); await expect(knoepfe.first()).toBeFocused();
    await knoepfe.last().click();
    expect(await page.evaluate(() => window.dateiAnfragen[1].args)).toEqual({ name: dateiAgent.name, pfad: "bild.png" });
    await page.evaluate(() => window.dateiAnfragen[1].resolve("Binärdatei, keine Vorschau."));
    await expect(vorschau.locator("code")).toHaveText("bild.png");
    await expect(vorschau.locator("pre")).toHaveText("Binärdatei, keine Vorschau.");
    await vorschau.getByRole("button", { name: "Vorschau schließen" }).click();
    await expect(knoepfe.last()).toBeFocused();
    for (const fehler of ["Es läuft kein Team.", "Datei gehört nicht zu diesem Agenten"]) {
      await knoepfe.first().click();
      await page.evaluate(text => window.dateiAnfragen.at(-1).reject(text), fehler);
      await expect(vorschau).toHaveAttribute("aria-busy", "false");
      await expect(vorschau.locator("pre")).toHaveText(fehler);
      expect((await new AxeBuilder({ page }).include(".team-spalte").analyze()).violations).toEqual([]);
      await vorschau.getByRole("button", { name: "Vorschau schließen" }).click();
      await expect(knoepfe.first()).toBeFocused();
    }
  });

  for (const nachAnsehen of [false, true]) {
    test(`Details schneiden oben keine Kachel an (${nachAnsehen ? "nach Ansehen" : "geöffnet"})`, async ({ page }) => {
      const details = page.locator(".team-details");
      if (nachAnsehen) {
        await details.getByRole("button", { name: "Ansehen", exact: true }).first().click();
        await page.evaluate(diff => window.dateiAnfragen[0].resolve(diff), dateiDiff);
        await expect(details.getByRole("region", { name: "Vorschau" })).toHaveAttribute("aria-busy", "false");
      }
      const sichtbar = await details.boundingBox();
      for (const kachel of await details.locator(".tm-det-kopf, .tm-det-leiste, .tm-dkarte").all()) {
        const box = await kachel.boundingBox();
        expect(box.y < sichtbar.y - 1 && box.y + box.height > sichtbar.y + 1, "Kachel am oberen Scrollrand angeschnitten").toBe(false);
      }
    });

    test(`Details folgen ohne Leerfläche (${nachAnsehen ? "nach Ansehen" : "geöffnet"})`, async ({ page }) => {
      const details = page.locator(".team-details");
      if (nachAnsehen) {
        await details.getByRole("button", { name: "Ansehen", exact: true }).first().click();
        await page.evaluate(diff => window.dateiAnfragen[0].resolve(diff), dateiDiff);
        await expect(details.getByRole("region", { name: "Vorschau" })).toHaveAttribute("aria-busy", "false");
      }
      const karte = await page.locator(`[data-agent="${dateiAgent.id}"] .ak`).boundingBox();
      const box = await details.boundingBox();
      const abstand = await details.evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue("--abstand-4")));
      expect(box.y - karte.y - karte.height).toBeGreaterThanOrEqual(0);
      expect(box.y - karte.y - karte.height).toBeLessThanOrEqual(abstand + 1);
    });
  }

  test("Dateien und Vorschau nutzen die volle Breite", async ({ page }, testInfo) => {
    const details = page.locator(".team-details");
    await details.getByRole("button", { name: "Ansehen", exact: true }).first().click();
    await page.evaluate(diff => window.dateiAnfragen[0].resolve(diff), dateiDiff);
    const vorschau = details.getByRole("region", { name: "Vorschau" });
    await expect(vorschau).toHaveAttribute("aria-busy", "false");
    const dateien = await details.locator(".tm-dkarte").filter({ has: page.getByRole("heading", { name: "Dateien", exact: true }) }).boundingBox();
    const box = await vorschau.boundingBox(), raster = await details.locator(".tm-det-raster").boundingBox();
    expect(Math.abs(dateien.width - box.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(dateien.width - raster.width)).toBeLessThanOrEqual(1);
    if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p53h_details_1440x900.png`, animations: "disabled" });
    }
  });

  test("kurze Vorschau bleibt bei vielen Dateien im sichtbaren Detailbereich", async ({ page }, testInfo) => {
    const dateien = Array.from({ length: 25 }, (_, i) => ({ pfad: `bild-${i + 1}.png`, hinzugefuegt: 0, entfernt: 0 }));
    await page.evaluate(a => window.agentSenden(a), { ...dateiAgent, dateien });
    const details = page.locator(".team-details");
    const dateikachel = details.locator(".tm-dkarte").filter({ has: page.getByRole("heading", { name: "Dateien", exact: true }) });
    const liste = details.locator(".tm-dateien");
    const masse = await liste.evaluate(el => ({ hoehe: el.clientHeight, inhalt: el.scrollHeight }));
    expect(masse.inhalt).toBeGreaterThan(masse.hoehe);
    await details.getByRole("button", { name: "Ansehen", exact: true }).last().click();
    await page.evaluate(() => window.dateiAnfragen[0].resolve("Binärdatei, keine Vorschau."));
    const vorschau = details.getByRole("region", { name: "Vorschau" });
    await expect(vorschau.locator("pre")).toHaveText("Binärdatei, keine Vorschau.");
    await expect(vorschau).toBeFocused();
    await ganzImBereich(details.locator(".tm-det-kopf"), details);
    await ganzImBereich(details.locator(".tm-det-leiste"), details);
    await ganzImBereich(details.getByRole("heading", { name: "Kennzahlen" }), details);
    await ganzImBereich(dateikachel, details);
    expect(await details.evaluate(el => el.scrollTop)).toBe(0);
    const ende = await details.locator(".tm-det").boundingBox();
    const innen = await details.evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
    const inhalt = await details.evaluate(el => el.scrollHeight);
    expect(Math.abs(inhalt - ende.height - innen * 2)).toBeLessThanOrEqual(1);
    if (page.viewportSize().height === 900) await ganzImBereich(vorschau, details);
    if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p53h_viele-dateien_1440x900.png`, animations: "disabled" });
    }
  });

  test("Angehalten hat keinen goldenen Rand; Wartet auf dich behält ihn", async ({ page }, testInfo) => {
    await page.locator(".team-details").press("Escape");
    await page.evaluate(a => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = (cmd, args) => cmd === "team_anhalten"
        ? Promise.resolve({ ordner: [], lauffehler: [], fristUeberschritten: false }) : invoke(cmd, args);
      window.agentSenden({ ...a, id: "wartet", name: "Wartender Agent", zustand: "Wartet auf dich" });
    }, dateiAgent);
    const karte = page.locator(`[data-agent="${dateiAgent.id}"] .ak`), wartet = page.locator('[data-agent="wartet"] .ak');
    const gold = await wartet.evaluate(el => getComputedStyle(el).boxShadow);
    const goldfarbe = gold.match(/rgba?\([^)]+\)/)[0];
    expect(gold).not.toBe(await karte.evaluate(el => getComputedStyle(el).boxShadow));
    await karte.getByRole("button", { name: "Anhalten", exact: true }).click();
    await expect(karte.locator(".pause-marke")).toHaveText("Angehalten");
    expect(await karte.evaluate(el => getComputedStyle(el).boxShadow)).not.toContain(goldfarbe);
    expect(await wartet.evaluate(el => getComputedStyle(el).boxShadow)).toBe(gold);
    if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p53h_angehalten_1440x900.png`, animations: "disabled" });
    }
  });

  test("ignoriert verspätete Antworten nach Dateiwechsel und Schließen", async ({ page }) => {
    const details = page.locator("#team-details"), knoepfe = details.getByRole("button", { name: "Ansehen", exact: true });
    const vorschau = details.getByRole("region", { name: "Vorschau" });
    await knoepfe.first().click(); await knoepfe.last().click();
    await page.evaluate(() => { window.dateiAnfragen[1].resolve("Binärdatei, keine Vorschau."); window.dateiAnfragen[0].resolve("Alte Antwort"); });
    await expect(vorschau.locator("pre")).toHaveText("Binärdatei, keine Vorschau.");
    await expect(vorschau.locator("code")).toHaveText("bild.png");
    await knoepfe.first().click();
    await vorschau.getByRole("button", { name: "Vorschau schließen" }).click();
    await page.evaluate(() => window.dateiAnfragen[2].resolve("Antwort nach Schließen"));
    await expect(vorschau).toHaveCount(0); await expect(knoepfe.first()).toBeFocused();
    await knoepfe.first().click(); await details.getByRole("button", { name: "Protokoll öffnen" }).click();
    await page.evaluate(() => window.dateiAnfragen[3].reject("Später Fehler"));
    await expect(vorschau.locator("pre")).toHaveText("Export wird geprüft");
    await knoepfe.first().click(); await details.press("Escape");
    await page.locator(`[data-agent="${dateiAgent.id}"] .ak-kopf`).click();
    await page.evaluate(() => window.dateiAnfragen[4].resolve("Antwort nach Detailwechsel"));
    await expect(vorschau).toHaveCount(0);
  });
});
