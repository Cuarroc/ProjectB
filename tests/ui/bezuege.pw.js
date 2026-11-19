import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("@exp einfügen und mit Dateibezug senden", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Bezüge fehlen im Basisstand.");
  await page.addInitScript(() => {
    window.isTauri = true; window.auftraege = []; window.dateiladungen = 0;
    window.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async (cmd, args) => {
      if (cmd.startsWith("plugin:event|")) return 1;
      if (cmd === "projekte_zuletzt") return ["C:\\ProjectB"];
      if (cmd === "projekt_pruefen") return { projekt: "ProjectB", pfad: args.pfad, zweig: "main" };
      if (cmd === "kontingent") return { claude: null, codex: null };
      if (cmd === "einstellungen_laden") return {};
      if (cmd === "chats_laden") { const { chats, aktiverChatId } = (await import("/src/daten/beispiel.ts")).beispiel; return { chats, aktiverChatId }; }
      if (cmd === "chats_speichern") return;
      if (cmd === "projekt_dateien") { window.dateiladungen++; return ["src/export/csv.rs", "src/export/mod.rs", "tests/export.rs"]; }
      if (cmd === "auftrag_senden") { window.auftraege.push(args); return { sitzung: null, erfolg: true }; }
      throw new Error(`Unerwarteter Command: ${cmd}`);
    } };
  });
  await page.goto("/"); const feld = page.locator("#chat-nachricht"); expect(await page.evaluate(() => window.dateiladungen)).toBe(0); await feld.fill("@exp");
  const liste = page.getByRole("listbox", { name: "Bezüge" }); await expect(liste.getByRole("option")).toHaveCount(4);
  expect((await new AxeBuilder({ page }).include(".chat-eingabe").analyze()).violations).toEqual([]);
  if (process.env.BILD_ORDNER && info.project.name !== "1280x800") {
    await page.evaluate(() => document.fonts.ready); await page.mouse.move(0, 0);
    await page.screenshot({ path: `${process.env.BILD_ORDNER}/P-8-3_bezuege_${info.project.name}.png`, animations: "disabled" });
  }
  await feld.press("Enter"); await expect(feld).toHaveValue("@src/export/csv.rs ");
  expect(await feld.evaluate(el => el.selectionStart)).toBe(19); expect(await page.evaluate(() => window.auftraege)).toEqual([]);
  if (process.env.BILD_ORDNER && info.project.name !== "1280x800") await page.screenshot({ path: `${process.env.BILD_ORDNER}/P-8-3_marken_${info.project.name}.png`, animations: "disabled" });
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(1);
  expect(await page.evaluate(() => window.auftraege[0].text)).toContain("@src/export/csv.rs \n\nBezüge:\n- src/export/csv.rs");
  await expect(page.locator(".r-du .r-msg-text").last()).toHaveText("@src/export/csv.rs");
  await feld.fill("@exp"); await expect(liste).toBeVisible(); expect(await page.evaluate(() => window.dateiladungen)).toBe(1);
  await liste.getByRole("option").last().click(); await expect(feld).toHaveValue("@CSV-Export im Kern "); await expect(feld).toBeFocused();
  await page.getByRole("button", { name: "Bezug CSV-Export im Kern entfernen", exact: true }).click(); await expect(feld).toHaveValue(" ");
});
