import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Chat-Kopf: Beispielzustand, Tastatur, neuer Chat und axe", async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === "1", "Chat-Kopf fehlt im Basisstand.");
  await page.clock.install({ time: new Date("2026-11-15T14:37:00+01:00") });
  await page.goto("/");
  const kopf = page.locator(".chat-kopf");
  const grenzen = await kopf.evaluate(e => {
    const r = e.getBoundingClientRect(), kinder = [...e.children].map(k => k.getBoundingClientRect());
    return { hoehe: r.height, soll: parseFloat(getComputedStyle(e).getPropertyValue("--kopf-hoehe")),
      einzeilig: kinder.every((k, i) => k.top >= r.top && k.bottom <= r.bottom && k.left >= (i ? kinder[i - 1].right : r.left) && k.right <= r.right) };
  });
  expect(grenzen.hoehe).toBe(grenzen.soll);
  expect(grenzen.einzeilig).toBe(true);
  await expect(kopf.getByRole("button")).toHaveCount(1);
  await expect(kopf).toContainText("An Orchestrator");
  await expect(kopf.getByRole("timer")).toHaveText("Läuft seit 7 min");
  await expect(kopf.getByRole("timer")).toHaveAttribute("aria-live", "off");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (testInfo.project.name === "1440x900") {
    await page.evaluate(() => document.fonts.ready);
    const name = "PR-p52k_chatkopf_1440x900.png";
    const path = process.env.BILD_ORDNER ? `${process.env.BILD_ORDNER}/${name}` : testInfo.outputPath(name);
    await page.screenshot({ path, animations: "disabled" });
    await testInfo.attach(name, { path, contentType: "image/png" });
  }
  if (testInfo.project.name === "1024x700" && process.env.BILD_ORDNER) {
    await page.evaluate(() => document.fonts.ready);
    const name = "PR-p52k_chatkopf_1024x700.png", path = `${process.env.BILD_ORDNER}/${name}`;
    await page.screenshot({ path, animations: "disabled" });
    await testInfo.attach(name, { path, contentType: "image/png" });
  }
  await page.clock.runFor(60_000);
  await expect(kopf.getByRole("timer")).toHaveText("Läuft seit 8 min");
  const neu = kopf.getByRole("button", { name: "Neuer Chat", exact: true });
  await neu.focus(); await expect(neu).toBeFocused(); await page.keyboard.press("Enter");
  await expect(page.getByRole("log").locator("li")).toHaveCount(0);
  await expect(kopf.getByRole("timer")).toHaveCount(0);
  const rand = page.getByRole("region", { name: "Chats und Aufgaben" });
  await rand.getByRole("button", { name: /Chats und Aufgaben öffnen/ }).click();
  await expect(rand.locator(".rand-chat")).toHaveCount(2);
  await expect(rand.locator(".rand-chat").last()).toHaveAttribute("aria-current", "true");
});
