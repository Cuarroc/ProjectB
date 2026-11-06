import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Chat-Rand: Tastatur, Beispielzustand, Bilder und axe", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Neue Funktion ist im Basisstand noch nicht vorhanden.");
  await page.goto("/");
  await page.evaluate(async () => { document.documentElement.dataset.bewegung = "voll"; await document.fonts.ready; });
  const rand = page.getByRole("region", { name: "Chats und Aufgaben" });
  const schalter = rand.getByRole("button", { name: /Chats und Aufgaben/ });
  await expect(rand.getByRole("button")).toHaveCount(1);
  await expect(schalter).toHaveAttribute("aria-expanded", "false");
  await expect(schalter).toContainText("2 / 5");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const bild = async name => {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, animations: "disabled" });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  await bild("eingeklappt");
  await page.keyboard.press("Tab");
  await expect(schalter).toBeFocused();
  expect(await schalter.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(schalter).toHaveAttribute("aria-expanded", "true");
  await expect(rand.getByRole("heading", { name: "Chats", exact: true })).toBeVisible();
  await expect(rand.getByRole("button", { name: "Postfach 3 warten auf dich" })).toBeVisible();
  await bild("offen");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  expect(await rand.evaluate(el => [...el.querySelectorAll("input, button")].filter(e => e.getBoundingClientRect().width).every(e => {
    const r = e.getBoundingClientRect(), b = el.getBoundingClientRect(); return r.left >= b.left && r.right <= b.right;
  }))).toBe(true);
  await rand.getByRole("textbox", { name: "Aufgabe hinzufügen" }).fill("Screenshot prüfen");
  await rand.getByRole("textbox", { name: "Aufgabe hinzufügen" }).press("Enter");
  await expect(rand.getByRole("checkbox", { name: "Screenshot prüfen" })).toBeVisible();
  await rand.getByRole("checkbox", { name: "Screenshot prüfen" }).check();
  await expect(rand.getByRole("checkbox", { name: "Screenshot prüfen" })).toBeChecked();
  await page.evaluate(() => { document.documentElement.dataset.bewegung = "reduziert"; });
  await schalter.focus();
  await page.keyboard.press("Space");
  await expect(schalter).toHaveAttribute("aria-expanded", "false");
  await expect(rand.getByRole("button")).toHaveCount(1);
  await expect(schalter).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rand.getByRole("checkbox", { name: "Screenshot prüfen" })).toBeChecked();
  if (testInfo.project.name === "1024x700") {
    await page.getByRole("button", { name: "Team öffnen", exact: true }).click();
    await expect(schalter).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  }
});
