import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const plantext = "- [ ] Export bauen\n  CSV ergänzen.\n  Fertig, wenn Umlaute stimmen.\n- [ ] Testen\n  Fertig, wenn Tests grün sind.\n- [ ] Prüfen\n  Fertig, wenn Review fertig ist.";
test("Echten Plan öffnen, kommentieren und freigeben", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Das echte Planfenster wird am Kandidaten geprüft.");
  await page.addInitScript(() => {
    window.isTauri = true; window.auftraege = []; window.callbacks = {}; window.listener = new Set();
    let id = 0;
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
          if (localStorage.planChats) return JSON.parse(localStorage.planChats);
          const { chats, aktiverChatId } = (await import("/src/daten/beispiel.ts")).beispiel;
          return { chats: [{ ...chats[0], verlauf: [], gestartetUm: null }], aktiverChatId };
        }
        if (cmd === "chats_speichern") { localStorage.planChats = JSON.stringify(args.daten); return; }
        if (cmd === "auftrag_senden") {
          window.auftraege.push(args);
          return new Promise(resolve => { window.beenden = () => resolve({ sitzung: { id: "s-plan", anbieter: "Claude", pfad: args.pfad }, erfolg: true }); });
        }
        throw new Error(`Unerwarteter Command: ${cmd}`);
      },
    };
    window.antwort = text => window.listener.forEach(id => window.callbacks[id]({ event: "chat-nachricht", id, payload: { chat: "csv-export", text } }));
  });
  await page.goto("/");
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  await feld.fill("Plane CSV"); await feld.press("Enter");
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(1);
  await page.evaluate(text => { window.antwort(text); window.beenden(); }, plantext);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.planChats).chats[0].verlauf.at(-1).plan?.schritte.length)).toBe(3);
  await page.reload();
  await page.getByRole("button", { name: "Plan öffnen", exact: true }).click();
  const dialog = page.getByRole("dialog"), schritt = dialog.locator(".pl-schritt").first();
  await expect(dialog.locator("h3").filter({ hasText: /^(Export bauen|Testen|Prüfen)$/ })).toHaveCount(3);
  for (const kriterium of ["Umlaute stimmen.", "Tests grün sind.", "Review fertig ist."]) await expect(dialog.getByText(kriterium, { exact: true })).toBeVisible();
  await expect(schritt.getByText("CSV ergänzen.", { exact: true })).toBeVisible();
  await expect(dialog.locator(".pl-chip")).toHaveCount(0);
  await expect(dialog.locator('.pl-stilknopf[aria-pressed="true"]')).toHaveCount(0);
  await expect(dialog.getByText(/^Nächste Fassung wird/)).toHaveCount(0);
  await schritt.getByRole("button", { name: "Ausarbeiten, Violett", exact: true }).click();
  await expect(dialog.getByText("Ausgearbeitet · Beispiel")).toHaveCount(0);
  await schritt.getByRole("button", { name: "Kommentar, Silbergrau", exact: true }).click();
  await schritt.getByRole("textbox").fill("Auch Semikolon testen.");
  await dialog.getByRole("button", { name: "Simpler", exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p52t_planfenster_1440x900.png`, animations: "disabled" });
  }
  await dialog.getByRole("button", { name: /^Mit Kommentaren zurückgeben/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(1);
  const kommentar = "Kommentare zum Plan:\n- Export bauen: [Ausarbeiten, Kommentar] Auch Semikolon testen. Bitte zerlege diesen Schritt in Teilschritte.\nGewünschte Fassung: Simpler";
  expect(await page.evaluate(() => window.auftraege[0])).toMatchObject({ text: kommentar, modus: "Planen" });
  await expect(page.locator(".r-du .r-msg-text").last()).toHaveText(kommentar);
  await expect(page.locator(".r-aktionen").getByRole("button", { name: /^(Freigeben und bauen|Mit Kommentaren zurückgeben)$/ })).toHaveCount(0);
  await page.evaluate(text => { window.antwort(text); window.beenden(); }, plantext);
  await page.getByRole("button", { name: "Plan öffnen", exact: true }).last().click();
  await dialog.getByRole("button", { name: "Freigeben und bauen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(2);
  expect(await page.evaluate(() => window.auftraege[1])).toMatchObject({ modus: "Ausführen", text: `Der Plan ist freigegeben. Melde am Ende den Stand als Aufgabenliste (- [x] erledigt, - [ ] offen). Setze genau diesen Plan um:\n\n${plantext}` });
  await expect(page.locator(".r-aktionen").getByRole("button", { name: /^(Freigeben und bauen|Mit Kommentaren zurückgeben)$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Plan öffnen", exact: true }).last().click();
  await expect(dialog.locator(".pl-kopf .statusmarke")).toHaveAttribute("data-zustand", "arbeitet");
  await expect(dialog.locator(".pl-kopf .statusmarke")).toHaveText("Arbeitet");
  await dialog.getByRole("button", { name: "Plan schließen", exact: true }).click();
  await page.evaluate(() => window.beenden());
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.planChats).chats[0].verlauf.filter(n => n.plan).at(-1).plan.freigabe)).toBe("Freigegeben");
  for (const neuladen of [false, true]) {
    if (neuladen) await page.reload();
    await page.getByRole("button", { name: "Plan öffnen", exact: true }).last().click();
    await expect(dialog.locator(".pl-kopf .statusmarke")).toHaveAttribute("data-zustand", "fertig");
    await expect(dialog.getByText("Freigegeben", { exact: true })).toBeVisible();
    await expect(dialog.locator(".pl-aktionen button:enabled,.pl-stilknopf:enabled,textarea:enabled")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Freigeben und bauen", exact: true })).toBeDisabled();
    const gesperrt = await dialog.getByRole("button", { name: "Freigeben und bauen", exact: true }).evaluate(e => {
      const s = getComputedStyle(e); return { color: s.color, cursor: s.cursor, backgroundColor: s.backgroundColor, boxShadow: s.boxShadow, transitionDuration: s.transitionDuration };
    });
    for (const knopf of await dialog.locator(".pl-aktionen button,.pl-stilknopf").all()) {
      for (const hover of [false, true]) {
        if (hover) await knopf.hover({ force: true });
        const stil = await knopf.evaluate(e => {
          const s = getComputedStyle(e); return { color: s.color, cursor: s.cursor, backgroundColor: s.backgroundColor, boxShadow: s.boxShadow, transitionDuration: s.transitionDuration };
        });
        expect(stil).toEqual(gesperrt);
        if (await knopf.locator("svg").count()) expect(await knopf.locator("svg").evaluate(e => getComputedStyle(e).color)).toBe(gesperrt.color);
      }
    }
    await page.mouse.move(0, 0);
    if (neuladen && testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p52u_feinschliff_1440x900.png`, animations: "disabled" });
    if (neuladen && testInfo.project.name === "1440x900" && process.env.BILD_ORDNER) await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p52t_freigegeben_1440x900.png`, animations: "disabled" });
    await dialog.getByRole("button", { name: "Plan schließen", exact: true }).click();
  }
});
