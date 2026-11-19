import { test, expect } from "@playwright/test";

test("blockiert Datei-Drops auf body auch ohne Chat-Eingabe", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Anhänge werden am Kandidaten geprüft.");
  await page.goto("/?vorschau=bausteine");
  await expect(page.getByRole("heading", { name: "Bausteine · Vorschau" })).toBeVisible();
  await expect(page.locator(".chat-eingabe")).toHaveCount(0);
  const verhindert = await page.evaluate(() => {
    const daten = new DataTransfer();
    daten.items.add(new File(["inhalt"], "probe.txt", { type: "text/plain" }));
    return ["dragover", "drop"].map(typ => {
      const event = new DragEvent(typ, { bubbles: true, cancelable: true, dataTransfer: daten });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(verhindert).toEqual([true, true]);
});

for (const dateien of [true, false]) {
  test(`${dateien ? "blockiert Dateien" : "erlaubt Text"} außerhalb der Ablage`, async ({ page }) => {
    test.skip(process.env.UI_BASELINE === "1", "Anhänge werden am Kandidaten geprüft.");
    await page.goto("/");
    await expect(page.locator(".chat-eingabe")).toBeVisible();
    for (const ziel of ["body", ".chat-verlauf", ".team-spalte"]) {
      const ergebnis = await page.evaluate(({ ziel, dateien }) => {
        const daten = new DataTransfer();
        if (dateien) daten.items.add(new File(["inhalt"], "probe.txt", { type: "text/plain" }));
        else daten.setData("text/plain", "Gezogener Text");
        // Chromium ignoriert dropEffect-Zuweisungen an synthetischen DataTransfers.
        Object.defineProperty(daten, "dropEffect", { value: "copy", writable: true });
        return ["dragover", "drop"].map(typ => {
          const event = new DragEvent(typ, { bubbles: true, cancelable: true, dataTransfer: daten });
          document.querySelector(ziel).dispatchEvent(event);
          return { verhindert: event.defaultPrevented, effekt: daten.dropEffect };
        });
      }, { ziel, dateien });
      expect(ergebnis, ziel).toEqual([
        { verhindert: dateien, effekt: dateien ? "none" : "copy" },
        { verhindert: dateien, effekt: dateien ? "none" : "copy" },
      ]);
    }
    await expect(page.locator(".ein-anhaenge")).toHaveCount(0);
  });
}

test("behält copy und hängt Dateien innerhalb der Ablage an", async ({ page }) => {
  test.skip(process.env.UI_BASELINE === "1", "Anhänge werden am Kandidaten geprüft.");
  await page.goto("/");
  await expect(page.locator(".chat-eingabe")).toBeVisible();
  const ergebnis = await page.locator("#chat-nachricht").evaluate(ziel => {
    const daten = new DataTransfer();
    daten.items.add(new File(["inhalt"], "probe.txt", { type: "text/plain" }));
    Object.defineProperty(daten, "dropEffect", { value: "none", writable: true });
    return ["dragover", "drop"].map(typ => {
      const event = new DragEvent(typ, { bubbles: true, cancelable: true, dataTransfer: daten });
      ziel.dispatchEvent(event);
      return { verhindert: event.defaultPrevented, effekt: daten.dropEffect };
    });
  });
  expect(ergebnis).toEqual([{ verhindert: true, effekt: "copy" }, { verhindert: true, effekt: "copy" }]);
  await expect(page.getByRole("button", { name: "probe.txt entfernen" })).toBeVisible();
});
