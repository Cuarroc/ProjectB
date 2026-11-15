import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Kopf: Soll-Bilder, Menüs, Bewegung und axe", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Kopf ist im Basisstand ein Platzhalter.");
  await page.emulateMedia({ reducedMotion: "no-preference" }); await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const kopf = page.getByRole("banner"), logo = kopf.getByRole("button", { name: "ProjectB", exact: true });
  const bild = async name => { const path = info.outputPath(`${name}.png`); await page.screenshot({ path, animations: "disabled" }); await info.attach(name, { path, contentType: "image/png" }); };
  const grenzen = async locator => expect(await locator.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })).toBe(true);
  await grenzen(kopf); for (const knopf of await kopf.getByRole("button").all()) await grenzen(knopf); await bild("kopf");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  for (const name of ["ProjectB", "Projekt wählen", "Rollen"]) {
    const knopf = kopf.getByRole("button", { name: new RegExp(`^${name}`) });
    await knopf.focus(); await page.keyboard.press("ArrowDown");
    const menue = kopf.getByRole("menu", { name, exact: true }), eintraege = menue.locator('[role^="menuitem"]');
    await expect(eintraege.first()).toBeFocused();
    await page.keyboard.press("End"); await expect(eintraege.last()).toBeFocused();
    await page.keyboard.press("ArrowDown"); await expect(eintraege.first()).toBeFocused();
    await page.keyboard.press("ArrowUp"); await expect(eintraege.last()).toBeFocused();
    await page.keyboard.press("Home"); await expect(eintraege.first()).toBeFocused();
    await grenzen(menue); await expect(menue).toHaveCSS("background-color", "rgba(24, 27, 37, 0.94)"); await bild(name === "ProjectB" ? "logo-bewegung" : name);
    if (name === "ProjectB") {
      await expect.soft(menue.locator(".kopf-voll")).toHaveCSS("box-shadow", /1px.*inset/);
      expect.soft(await menue.locator(".kopf-voll .kopf-probe > span").evaluate(el => [getComputedStyle(el).animationName, getComputedStyle(el, "::before").animationName].every(n => n !== "none"))).toBe(true);
    }
    if (name === "Rollen") for (const eintrag of await eintraege.all()) await expect.soft(eintrag).toHaveAttribute("aria-disabled", "true");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape"); await expect(menue).toHaveCount(0); await expect(knopf).toBeFocused();
    await knopf.click(); await page.keyboard.press("Tab"); await expect(menue).toHaveCount(0);
    await knopf.click(); await page.mouse.click(1, page.viewportSize().height - 1); await expect(menue).toHaveCount(0);
  }
  for (const [name, wert] of [["Voll", "voll"], ["Reduziert", "reduziert"], ["Automatisch", "auto"]]) {
    await logo.click(); await kopf.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }).click();
    await expect(page.locator("html")).toHaveAttribute("data-bewegung", wert); await expect(logo).toBeFocused();
  }
  for (const [reducedMotion, text] of [["reduce", "Reduziert"], ["no-preference", "Voll"]]) {
    await page.emulateMedia({ reducedMotion }); await logo.click();
    await expect(kopf.locator(".kopf-gerade")).toHaveText(text);
    expect(await kopf.locator(".kopf-voll .kopf-probe > span").evaluate(el => [getComputedStyle(el).animationName, getComputedStyle(el, "::before").animationName].every(n => n === "none"))).toBe(reducedMotion === "reduce");
    await expect(kopf.getByRole("menu")).toHaveCSS("animation-name", reducedMotion === "reduce" ? "kopf-blende" : "kopf-auf"); await page.keyboard.press("Escape");
  }
  const projektKnopf = kopf.getByRole("button", { name: /^Projekt wählen/ });
  await projektKnopf.click(); await kopf.getByRole("menuitemradio").first().click();
  // Der Pfad steht schon vor dem Klick da; Menüschluss und Fokus belegen den Erfolg.
  await expect(kopf.getByRole("menu", { name: "Projekt wählen" })).toHaveCount(0); await expect(projektKnopf).toBeFocused();
  for (const knopf of await kopf.getByRole("button").all()) await grenzen(knopf);
  const rechte = kopf.getByRole("button", { name: /^Berechtigungen:/ }); await rechte.click();
  await expect(page.getByRole("dialog", { name: "Berechtigungen" })).toBeVisible(); await page.keyboard.press("Escape"); await expect(rechte).toBeFocused();
  const post = kopf.getByRole("button", { name: "Postfach 3 warten auf dich" }); await post.click();
  await expect(kopf.getByRole("status")).toHaveText("3 warten auf dich."); await grenzen(kopf.getByRole("status"));
  await page.keyboard.press("Escape"); await expect(kopf.getByRole("status")).toHaveCount(0); await expect(post).toBeFocused();
});

test("Projekt wählen: Liste, Pfad, Fehler, Tastatur und axe", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Das Pfad-Feld fehlt im Basisstand.");
  await page.goto("/"); await page.waitForLoadState("networkidle"); await page.evaluate(() => document.fonts.ready);
  const kopf = page.getByRole("banner"), knopf = kopf.getByRole("button", { name: /^Projekt wählen/ });
  const bild = async szene => {
    if (!["1440x900", "1024x700"].includes(info.project.name)) return;
    const path = info.outputPath(`PR-p51c_${szene}_${info.project.name}.png`);
    await page.screenshot({ path, animations: "disabled" }); await info.attach(szene, { path, contentType: "image/png" });
  };
  await knopf.click();
  const menue = kopf.getByRole("menu", { name: "Projekt wählen" });
  await expect(menue.getByRole("menuitemradio")).toHaveText(["C:\\ProjectB", "C:\\ProjectB-Beispiel"]);
  await bild("liste");
  await menue.getByRole("menuitemradio").last().click();
  const feld = kopf.getByRole("textbox", { name: "Pfad zum Projekt" }), fehler = kopf.locator("#projekt-fehler");
  await expect(feld).toBeFocused(); await expect(feld).toHaveValue("C:\\ProjectB-Beispiel");
  await expect(fehler).toHaveText("Echte Projekte lassen sich nur in der Desktop-App prüfen und öffnen.");
  // Ein abgewiesener Listeneintrag darf das aktuelle Projekt nicht ersetzen.
  await expect(knopf).toContainText("C:\\ProjectB"); await expect(knopf).not.toContainText("C:\\ProjectB-Beispiel");
  await page.keyboard.press("Escape"); await expect(knopf).toBeFocused();
  await knopf.click(); await expect(menue).toBeVisible({ timeout: 3000 });
  await menue.getByRole("menuitem", { name: "Ordner öffnen…" }).click(); await expect(feld).toBeFocused();
  await feld.fill("C:\\Fehlt"); await page.keyboard.press("Enter");
  await expect(fehler).toContainText("Echte Projekte lassen sich nur in der Desktop-App");
  await expect(feld).toHaveAttribute("aria-invalid", "true"); await expect(fehler.locator("svg")).toBeVisible();
  const dialog = kopf.getByRole("dialog", { name: "Projekt wählen" });
  expect(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && el.scrollWidth <= el.clientWidth; })).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); await bild("fehler");
  await feld.fill("C:\\ProjectB"); await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Öffnen", exact: true })).toBeFocused(); await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0); await expect(knopf).toBeFocused(); await expect(knopf).toContainText("main");
  await knopf.click(); await menue.getByRole("menuitem", { name: "Ordner öffnen…" }).click();
  await expect(feld).toBeFocused(); await page.keyboard.press("Home"); await expect(feld).toBeFocused();
  await page.keyboard.press("Escape"); await expect(knopf).toBeFocused();
});

test("Projekt wählen: Listenfehler bleibt sichtbar und beschreibt den Menüeintrag", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Der Listenfehler fehlt im Basisstand.");
  await page.addInitScript(() => {
    window.isTauri = true;
    let geoeffnet = false;
    window.__TAURI_INTERNALS__ = { invoke: async cmd => {
      // Die Projektattrappe muss auch den neuen Kontingentbefehl beantworten.
      if (cmd === "kontingent") return { claude: { genutzt: 42, soll: 48 }, codex: { genutzt: 51, soll: 48 } };
      if (cmd === "projekte_zuletzt") {
        if (geoeffnet) throw new Error("Liste nicht erreichbar");
        return ["C:\\ProjectB-Handbuch"];
      }
      if (cmd === "projekt_oeffnen") geoeffnet = true;
      return { projekt: "ProjectB-Handbuch", pfad: "C:\\ProjectB-Handbuch", zweig: "handbuch" };
    } };
  });
  await page.goto("/"); await page.evaluate(() => document.fonts.ready);
  const kopf = page.getByRole("banner"), knopf = kopf.getByRole("button", { name: /^Projekt wählen/ });
  await expect(knopf).toHaveAccessibleName("Projekt wählen: ProjectB-Handbuch C:\\ProjectB-Handbuch handbuch");
  await knopf.click(); await kopf.getByRole("menuitemradio", { name: "C:\\ProjectB-Handbuch", exact: true }).click();
  await expect(knopf).toHaveAttribute("aria-expanded", "false"); await knopf.click();
  const fehler = kopf.getByText("Zuletzt geöffnete Projekte konnten nicht geladen werden.");
  await expect(fehler).toBeVisible(); await expect(fehler.locator("svg")).toBeVisible();
  await expect(kopf.getByRole("menuitem", { name: "Ordner öffnen…" })).toHaveAccessibleDescription(await fehler.innerText());
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const path = info.outputPath("listenfehler.png");
  await page.screenshot({ path, animations: "disabled" }); await info.attach("Listenfehler", { path, contentType: "image/png" });
});

test("Kontingent: Claude unbekannt und Codex mit eigenem Wochenstand", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Echte Kontingente fehlen im Basisstand.");
  await page.addInitScript(() => {
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = { invoke: async cmd => {
      if (cmd === "kontingent") return { claude: null, codex: { genutzt: 51, soll: 48 } };
      if (cmd === "projekte_zuletzt") return [];
      throw new Error(`Unerwarteter Befehl: ${cmd}`);
    } };
  });
  await page.goto("/"); await page.evaluate(() => document.fonts.ready);
  const kopf = page.getByRole("banner"), claude = kopf.locator('[aria-label="Claude: unbekannt"]');
  await expect(claude).toHaveText("Claudeunbekannt"); await expect(claude.locator(".kopf-balken")).toHaveCount(0);
  const codex = kopf.locator('[aria-label="Codex: Genutzt 51 %, Soll 48 %"]');
  await expect(codex).toHaveText("Codex51 %");
  await expect(codex.locator(".kopf-soll")).toHaveAttribute("style", "left: 48%;");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const path = info.outputPath(`PR-p55c_kopf_${info.project.name}.png`);
  await page.screenshot({ path, animations: "disabled" }); await info.attach("Kontingent", { path, contentType: "image/png" });
});
