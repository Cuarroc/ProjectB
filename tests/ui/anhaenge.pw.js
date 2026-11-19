import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("hängt PNG und CSV per Plus an und sendet ihre gespeicherten Pfade", async ({ page }, info) => {
  test.skip(process.env.UI_BASELINE === "1", "Anhänge werden am Kandidaten geprüft.");
  const csp = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).app.security.devCsp;
  await page.route("**/", async route => { const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), "Content-Security-Policy": csp } }); });
  await page.addInitScript(() => {
    window.isTauri = true; window.auftraege = []; window.gespeichert = [];
    window.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async (cmd, args) => {
      if (cmd.startsWith("plugin:event|")) return 1;
      if (cmd === "projekte_zuletzt") return ["C:\\ProjectB"];
      if (cmd === "projekt_oeffnen" || cmd === "projekt_pruefen") return { projekt: "ProjectB", pfad: args.pfad, zweig: "main" };
      if (cmd === "kontingent") return { claude: null, codex: null };
      if (cmd === "einstellungen_laden") return {};
      if (cmd === "chats_laden") { const { chats, aktiverChatId } = (await import("/src/daten/beispiel.ts")).beispiel; return { chats, aktiverChatId }; }
      if (cmd === "chats_speichern") return;
      if (cmd === "anhang_speichern") { window.gespeichert.push(args); return `.projectb/anhaenge/beispiel-${args.name}`; }
      if (cmd === "auftrag_senden") { window.auftraege.push(args); return { sitzung: null, erfolg: true }; }
      throw new Error(`Unerwarteter Command: ${cmd}`);
    } };
  });
  await page.goto("/"); await page.evaluate(() => document.fonts.ready);
  const auswahl = page.waitForEvent("filechooser"); await page.getByRole("button", { name: "Bild oder Datei anhängen" }).click();
  expect((await auswahl).isMultiple()).toBe(true);
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 96; c.height = 96; const x = c.getContext("2d"), t = getComputedStyle(document.documentElement);
    x.fillStyle = t.getPropertyValue("--flaeche-2"); x.fillRect(0, 0, 96, 96); x.fillStyle = t.getPropertyValue("--text-2"); x.fillRect(12, 16, 65, 5); x.fillRect(12, 29, 48, 5);
    x.fillStyle = t.getPropertyValue("--akzent"); x.fillRect(12, 57, 56, 23); return c.toDataURL().split(",")[1];
  });
  const dateien = [
    { name: "knopf-entwurf.png", mimeType: "image/png", buffer: Buffer.concat([Buffer.from(png, "base64"), Buffer.alloc(184 * 1024 - Buffer.from(png, "base64").length)]) },
    { name: "pakete-beispiel.csv", mimeType: "text/csv", buffer: Buffer.from("a,b\n".repeat(23) + "c,d" + " ".repeat(2977)) },
  ];
  await page.locator('input[type="file"]').setInputFiles(dateien);
  await expect(page.getByRole("button", { name: "knopf-entwurf.png entfernen" })).toBeVisible();
  await expect(page.locator(".ein-anhaenge")).toContainText("CSV · 3 KB · 24 Zeilen");
  await expect(page.locator(".ein-anhaenge img")).toBeVisible();
  await expect.poll(() => page.locator(".ein-anhaenge img").evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".ein-anhaenge")).toContainText("Bild · 184 KB");
  const feld = page.getByRole("textbox", { name: "Nachricht an den Orchestrator" });
  await feld.fill("Der Knopf soll so aussehen wie auf dem Bild. Die Testdaten stehen in der CSV.");
  expect(await page.getByRole("button", { name: "Senden", exact: true }).evaluate(b => b.getBoundingClientRect().top === document.querySelector('.ein-leiste button').getBoundingClientRect().top)).toBe(true);
  if (process.env.BILD_ORDNER && info.project.name !== "1280x800") await page.screenshot({ path: `${process.env.BILD_ORDNER}/P-8-4_anhaenge_${info.project.name}.png` });
  await page.getByRole("button", { name: "knopf-entwurf.png entfernen" }).click(); await expect(page.locator(".ein-anhaenge img")).toHaveCount(0);
  await page.getByRole("button", { name: "pakete-beispiel.csv entfernen" }).click(); await page.locator('input[type="file"]').setInputFiles(dateien);
  await feld.press("Enter"); await expect.poll(() => page.evaluate(() => window.auftraege.length)).toBe(1);
  expect(await page.evaluate(() => window.auftraege[0].text)).toContain("Anhänge:\n.projectb/anhaenge/beispiel-knopf-entwurf.png\n.projectb/anhaenge/beispiel-pakete-beispiel.csv");
  expect(await page.evaluate(() => window.gespeichert.map(d => d.name))).toEqual(["knopf-entwurf.png", "pakete-beispiel.csv"]);
  await expect(page.locator(".r-du").last()).toContainText("knopf-entwurf.png · pakete-beispiel.csv");
  await expect(page.locator(".ein-anhaenge")).toHaveCount(0); await expect(feld).toHaveValue("");
});
