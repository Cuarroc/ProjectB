import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.skip(process.env.UI_BASELINE === "1", "Rollen-Menü fehlt im Basisstand.");

test("Rollen: Beispiel, Tastatur, gültige Auswahl und neue Chats", async ({ page }, info) => {
  await page.goto("/"); await page.getByRole("button", { name: "Rollen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rollen", exact: true });
  const modell = dialog.getByLabel("Orchestrator Modell"), effort = dialog.getByLabel("Orchestrator Effort");
  await expect(modell).toBeFocused(); await expect(modell).toHaveValue("Opus 5.5");
  await expect(modell.locator("option")).toHaveCount(4);
  await expect(dialog.getByLabel("Reviewer Claude Modell").locator("option")).toHaveText(["Opus 5.5", "Sonnet 5.5", "Haiku 5.5"]);
  await expect(dialog.getByLabel("Reviewer Codex Modell").locator("option")).toHaveText(["gpt-6.1-sol"]);
  await modell.selectOption("Sonnet 5.5"); await effort.selectOption("Sehr hoch");
  await expect(modell).toHaveValue("Sonnet 5.5");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
    && [...el.querySelectorAll("strong,label,select,p")].every(e => parseFloat(getComputedStyle(e).fontSize) >= 12 && e.scrollWidth <= e.clientWidth); })).toBe(true);
  if (process.env.BILD_ORDNER) await page.screenshot({ path: `${process.env.BILD_ORDNER}/P-7-4_rollen_${info.project.name}.png` });
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "Rollen", exact: true })).toBeFocused();
  await page.getByRole("button", { name: /Chats und Aufgaben öffnen/ }).click(); await page.getByRole("region", { name: "Chats", exact: true }).getByRole("button", { name: "Neuer Chat", exact: true }).click();
  const daten = await page.evaluate(async () => (await import("/src/bereiche/ChatEingabe.tsx")).chatEingabeQuelle.lesen());
  expect(daten.chats[0].modell).toBe("Opus 5.5"); expect(daten.chats.at(-1)).toMatchObject({ modell: "Sonnet 5.5", effort: "Sehr hoch", kontextfenster: 1000000 });
  await page.reload(); await page.getByRole("button", { name: "Rollen", exact: true }).click(); await expect(modell).toHaveValue("Opus 5.5");
});
test("Rollen: Tauri lädt je Projekt, zeigt Kernantworten und behält Werte bei Fehlern", async ({ page }, info) => {
  await page.addInitScript(() => {
    window.isTauri = true; window.schreibwerte = []; window.leseprojekte = [];
    window.__TAURI_INTERNALS__ = { transformCallback: () => 1, invoke: async (cmd, args) => {
      const rollen = { orchestrator: { modell: "Haiku 5.5", effort: "Niedrig" }, reviewer: {
        claude: { modell: "Sonnet 5.5", effort: "Mittel" }, codex: { modell: "gpt-6.1-sol", effort: "Sehr hoch" } } };
      if (cmd === "einstellungen_laden") { window.leseprojekte.push(args.projekt); if (window.ladeWarten) await new Promise(resolve => { window.ladeFortsetzen = resolve; }); if (window.ladeFehler) throw "Nicht erreichbar"; return { rollen }; }
      if (cmd === "einstellungen_speichern") { window.schreibwerte.push(args); if (window.speicherWarten) await new Promise(resolve => { window.speicherFortsetzen = resolve; }); if (window.speicherFehler) throw "Kein Zugriff"; return { rollen }; }
      if (cmd === "projekte_zuletzt") return [];
      if (cmd === "chats_laden") return { chats: [], aktiverChatId: null };
      if (cmd === "chats_speichern") return;
      if (cmd === "kontingent") return { claude: null, codex: null };
      if (cmd.startsWith("plugin:event|")) return 1;
      throw "Kein Testwert";
    } };
  });
  await page.goto("/"); await page.getByRole("button", { name: "Rollen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rollen", exact: true }), modell = dialog.getByLabel("Orchestrator Modell");
  const meldung = dialog.locator("#rollen-fehler");
  const farbe = token => page.evaluate(token => {
    const probe = document.createElement("span"); probe.style.color = `var(${token})`; document.body.append(probe);
    const wert = getComputedStyle(probe).color; probe.remove(); return wert;
  }, token);
  await expect(modell).toHaveValue("Haiku 5.5"); await modell.selectOption("Sonnet 5.5"); await expect(modell).toHaveValue("Haiku 5.5");
  expect(await page.evaluate(() => window.schreibwerte[0])).toMatchObject({ projekt: "C:\\ProjectB", werte: { rollen: { orchestrator: { modell: "Sonnet 5.5", effort: "Niedrig" } } } });
  await modell.focus(); await page.evaluate(() => { window.speicherFehler = true; window.speicherWarten = true; }); await modell.selectOption("Opus 5.5");
  await expect(dialog).toBeVisible(); await expect(modell).toBeFocused();
  await expect(meldung).toHaveText("Wird gespeichert …");
  await expect(meldung).toHaveCSS("color", await farbe("--text-2")); await expect(meldung.locator("svg")).toHaveCount(0);
  await page.evaluate(() => { window.speicherFortsetzen(); });
  await expect(dialog.getByRole("status")).toContainText("Nicht gespeichert: Kein Zugriff"); await expect(modell).toHaveValue("Haiku 5.5");
  await expect.soft(meldung).toHaveCSS("color", await farbe("--status-problem"));
  await expect.soft(meldung.locator("svg.lucide-circle-x")).toHaveCount(1);
  await page.evaluate(async () => { window.ladeWarten = true; const q = (await import("/src/bereiche/ChatEingabe.tsx")).chatEingabeQuelle; const d = q.lesen(); d.kopf.pfad = "B"; q.aktualisieren(d); });
  await page.getByRole("button", { name: "Rollen", exact: true }).click();
  await expect(meldung).toHaveText("Rollen werden geladen …");
  await expect(meldung).toHaveCSS("color", await farbe("--text-2")); await expect(meldung.locator("svg")).toHaveCount(0);
  await page.evaluate(() => { window.ladeWarten = false; window.ladeFortsetzen(); });
  await expect(dialog.locator("#rollen-fehler")).toBeEmpty(); await expect(modell).toBeEnabled();
  expect(await page.evaluate(() => window.leseprojekte)).toContain("B");
  await page.evaluate(async () => { window.ladeFehler = true; const q = (await import("/src/bereiche/ChatEingabe.tsx")).chatEingabeQuelle; const d = q.lesen(); d.kopf.pfad = "C"; d.kopf.geoeffnet = true; q.aktualisieren(d); });
  await expect.poll(() => page.evaluate(async () => (await import("/src/bereiche/ChatEingabe.tsx")).chatEingabeQuelle.lesen().chats)).toEqual([
    expect.objectContaining({ modell: "Opus 5.5", effort: "Hoch", titel: "Neuer Chat" }),
  ]);
  await expect(page.locator(".chat-kopf").getByRole("button", { name: "Neuer Chat", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /Chats und Aufgaben öffnen/ }).click();
  await page.getByRole("region", { name: "Chats", exact: true }).getByRole("button", { name: "Neuer Chat", exact: true }).first().click();
  expect(await page.evaluate(async () => (await import("/src/bereiche/ChatEingabe.tsx")).chatEingabeQuelle.lesen().chats)).toHaveLength(2);
  await page.getByRole("button", { name: "Rollen", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Rollen nicht geladen: Nicht erreichbar"); await expect(modell).toBeDisabled();
  await expect(modell).toHaveValue("Opus 5.5");
  expect(await page.evaluate(() => window.schreibwerte)).toHaveLength(2);
  if (process.env.BILD_ORDNER && info.project.name !== "1280x800") await page.screenshot({ path: `${process.env.BILD_ORDNER}/P-7-5_rollen-fehler_${info.project.name}.png`, animations: "disabled" });
  await expect.soft(meldung).toHaveCSS("color", await farbe("--status-problem"));
  await expect.soft(meldung.locator("svg.lucide-circle-x")).toHaveCount(1);
  if (process.env.BILD_ORDNER) await page.screenshot({ path: `${process.env.BILD_ORDNER}/P-7-4_fehler_${info.project.name}.png` });
});
