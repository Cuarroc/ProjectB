import { test, expect } from "@playwright/test";

test("Berechtigungen im Tauri-Betrieb: laden, übernehmen, neu laden und Speicherfehler", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Neue Paketoberfläche fehlt im Basisstand.");
  await page.addInitScript(() => {
    window.isTauri = true; window.aenderungen = [];
    const geladen = new Promise(resolve => { window.ladenFortsetzen = resolve; });
    window.__TAURI_INTERNALS__ = { invoke: async (cmd, args) => {
      if (cmd === "einstellungen_laden") { await geladen; return { berechtigung: localStorage.getItem(args.projekt) ?? "Vorsichtig" }; }
      if (cmd === "einstellungen_speichern") {
        window.aenderungen.push(args);
        if (window.speicherFehler) throw "Kein Zugriff";
        localStorage.setItem(args.projekt, args.werte.berechtigung); return args.werte;
      }
      if (cmd === "projekte_zuletzt") return [];
      throw "Kein Testwert";
    } };
  });
  await page.goto("/");
  const knopf = page.getByRole("button", { name: /^Berechtigungen:/ });
  const dialog = page.getByRole("dialog", { name: /Berechtigungen/ });
  await expect(knopf).toBeDisabled();
  await page.evaluate(() => window.ladenFortsetzen());
  await expect(knopf).toHaveAccessibleName("Berechtigungen: Vorsichtig");
  await knopf.click(); await dialog.getByRole("radio", { name: /Autonom/ }).click();
  await dialog.getByRole("button", { name: "Übernehmen" }).click();
  await expect(dialog).not.toBeVisible(); await expect(knopf).toHaveAccessibleName("Berechtigungen: Autonom"); await expect(knopf).toBeFocused();
  expect(await page.evaluate(() => window.aenderungen)).toEqual([{ projekt: expect.any(String), werte: { berechtigung: "Autonom" } }]);
  await page.reload(); await page.evaluate(() => window.ladenFortsetzen()); await expect(knopf).toHaveAccessibleName("Berechtigungen: Autonom");
  await knopf.click(); await dialog.getByRole("radio", { name: /Vorsichtig/ }).click();
  await expect(dialog.getByRole("listitem").filter({ hasText: "Claude: Build, git add und git commit" })).toContainText("Nie");
  await expect(dialog.getByRole("listitem").filter({ hasText: "Codex: alles in der Arbeitskopie, Netz nur bei Autonom" })).toContainText("Allein");
  await page.evaluate(() => { window.speicherFehler = true; });
  await dialog.getByRole("button", { name: "Übernehmen" }).click();
  await expect(dialog.locator("#ber-meldung")).toHaveText("Nicht gespeichert: Kein Zugriff");
  await expect(knopf).toHaveAccessibleName("Berechtigungen: Autonom");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
      && [...el.querySelectorAll("h2,h3,p,span,code,button")].every(e => e.scrollWidth <= e.clientWidth && parseFloat(getComputedStyle(e).fontSize) >= 12);
  })).toBe(true);
  if (process.env.BILD_ORDNER && info.project.name !== "1280x800") {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/PR-p72_berechtigungen_${info.project.name}.png` });
  }
  await dialog.locator(".ber-liste li").last().scrollIntoViewIfNeeded();
  await expect(dialog.locator(".ber-liste li").last()).toBeInViewport();
  await dialog.locator(".ber-technik").scrollIntoViewIfNeeded();
  await expect(dialog.locator(".ber-technik")).toBeInViewport();
  await page.reload(); await page.evaluate(() => window.ladenFortsetzen());
  await expect(knopf).toHaveAccessibleName("Berechtigungen: Autonom");
});
