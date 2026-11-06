import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";

const zustaende = [
  ["Hauptansicht", "/", ".app-rahmen"],
  ["Bausteine", "/?vorschau=bausteine", ".vorschau"],
  ...["kachel", "agentenkarte", "zeitspur"].map(tafel => [
    tafel, `/?vorschau=bausteine2&tafel=${tafel}`, ".b2-buehne",
  ]),
];

for (const [name, url, wurzel] of zustaende) {
  test(name, async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date("2026-11-06T08:00:00+01:00") });
    await page.goto(url);
    await expect(page.locator(wurzel)).toBeVisible();
    await page.evaluate(async () => {
      document.documentElement.dataset.bewegung = "reduziert";
      await document.fonts.ready;
    });
    // Verzögerte Lade-Platzhalter (600 ms) sind Teil des festen Zustands.
    await page.clock.runFor(1000);
    await page.mouse.move(0, 0);
    const bild = testInfo.outputPath("ist.png");
    await page.screenshot({ path: bild, fullPage: true, animations: "disabled" });
    await testInfo.attach("Ist-Bild", { path: bild, contentType: "image/png" });
    await expect.soft(page).toHaveScreenshot(`${name}.png`, { fullPage: true });

    // Referenzbilder stammen aus dem Basisstand, axe prüft den Kandidaten.
    if (process.env.UI_BASELINE === "1") return;
    const ergebnis = await new AxeBuilder({ page }).analyze();
    const bericht = testInfo.outputPath("axe.json");
    await writeFile(bericht, JSON.stringify(ergebnis, null, 2));
    await testInfo.attach("axe", { path: bericht, contentType: "application/json" });
    expect(ergebnis.violations.filter(fund =>
      fund.impact === "serious" || fund.impact === "critical",
    )).toEqual([]);
  });
}
