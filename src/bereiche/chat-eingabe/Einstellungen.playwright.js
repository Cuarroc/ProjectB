async page => {
  const expect = wert => ({ toBe: ziel => { if (wert !== ziel) throw new Error(`${wert} !== ${ziel}`); }, toContain: ziel => { if (!wert.includes(ziel)) throw new Error(`${wert} enthält ${ziel} nicht`); }, toMatchObject: ziel => { for (const k in ziel) if (wert[k] !== ziel[k]) throw new Error(`${k}: ${wert[k]} !== ${ziel[k]}`); } });
  const pruefe = async (name, lauf) => { await page.reload(); await page.evaluate(() => document.fonts.ready); await lauf(); console.log(name); };
const knopf = () => page.getByRole("button", { name: /^Einstellungen für/ });
const gruppe = name => page.getByRole("radiogroup", { name, exact: true });
const fokus = async ziel => expect(await ziel.evaluate(e => e === document.activeElement)).toBe(true);

await pruefe("zeigt den Knopf nur bei Ausführen und Planen, Interview hat keinen", async () => {
  expect(await knopf().innerText()).toContain("Empfohlen");
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  await knopf().click();
  expect(await page.getByRole("dialog").innerText()).toContain("Planen");
  for (const name of ["Plan", "Dauer und Tokens schätzen", "Bei Unklarem nachfragen"]) expect(await gruppe(name).count()).toBe(1);
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Interview", exact: true }).click();
  expect(await knopf().count()).toBe(0);
  expect(await page.locator(".einst-gruppe").count()).toBe(0);
});
await pruefe("zeigt Angepasst, behält Werte je Modus und setzt nur den aktiven Modus zurück", async () => {
  await knopf().click();
  const reset = page.getByRole("button", { name: "Auf Empfohlen zurücksetzen" });
  expect(await reset.isDisabled()).toBe(true);
  await gruppe("Agenten gleichzeitig").getByRole("radio", { name: "Bis zu 5", exact: true }).click();
  expect(await knopf().innerText()).toContain("Angepasst");
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  expect(await knopf().innerText()).toContain("Empfohlen");
  await knopf().click(); await gruppe("Plan").getByRole("radio", { name: "Kurz", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Ausführen", exact: true }).click();
  await knopf().click();
  expect(await gruppe("Agenten gleichzeitig").getByRole("radio", { name: "Bis zu 5", exact: true }).getAttribute("aria-checked")).toBe("true");
  await reset.click(); expect(await knopf().innerText()).toContain("Empfohlen"); expect(await reset.isDisabled()).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Planen", exact: true }).click();
  expect(await knopf().innerText()).toContain("Angepasst");
});
await pruefe("bedient Zeilen und Werte mit Pfeilen, Pos1 und Ende", async () => {
  await knopf().focus(); await page.keyboard.press("ArrowDown");
  await fokus(gruppe("Agenten gleichzeitig").getByRole("radio", { name: "Bis zu 3", exact: true }));
  await page.keyboard.press("ArrowRight");
  expect(await knopf().innerText()).toContain("Angepasst");
  await page.keyboard.press("ArrowDown"); await fokus(gruppe("Prüfung durch").getByRole("radio").first());
  await page.keyboard.press("End"); await fokus(page.getByRole("button", { name: "Auf Empfohlen zurücksetzen" }));
  await page.keyboard.press("Home"); await fokus(gruppe("Agenten gleichzeitig").getByRole("radio", { name: "Bis zu 5", exact: true }));
  await page.keyboard.press("ArrowUp"); await fokus(page.getByRole("button", { name: "Auf Empfohlen zurücksetzen" }));
});
for (const taste of ["Escape", "Tab", "Shift+Tab", "Klick daneben"]) await pruefe(`${taste} schließt und gibt Fokus an den Knopf zurück`, async () => {
  await knopf().click();
  if (taste === "Klick daneben") await page.getByRole("textbox", { name: "Nachricht an den Orchestrator" }).click();
  else await page.keyboard.press(taste);
  expect(await page.getByRole("dialog").count()).toBe(0); await fokus(knopf());
});
await pruefe("zeigt Glas, Tokenmaße und springende Pillen bei beiden Farbschemata und Bewegungsstufen", async () => {
  for (const colorScheme of ["dark", "light"]) for (const bewegung of ["voll", "reduziert"]) {
    await page.emulateMedia({ colorScheme });
    await page.evaluate(b => document.documentElement.dataset.bewegung = b, bewegung);
    await knopf().click();
    const menue = page.getByRole("dialog");
    const stil = await menue.evaluate(e => {
      const s = getComputedStyle(e), r = e.getBoundingClientRect(), k = document.querySelector(".einst-anker button").getBoundingClientRect();
      return { breite: s.width, ecke: s.borderRadius, glas: s.backgroundColor, rechts: Math.round(r.right - k.right), oben: r.bottom < k.top,
        schrift: [...e.querySelectorAll("span,button")].every(x => parseFloat(getComputedStyle(x).fontSize) >= 12),
        pille: [...e.querySelectorAll(".um-pille")].every(x => getComputedStyle(x).transitionDuration === "0s"), animation: s.animationName };
    });
    expect(stil).toMatchObject({ breite: "340px", ecke: "14px", glas: "rgba(24, 27, 37, 0.94)", rechts: 0, oben: true, schrift: true, pille: true });
    expect(stil.animation).toBe(bewegung === "reduziert" ? "none" : "einst-auf");
    if (process.env.EINST_BILD && bewegung === "reduziert") {
      await page.evaluate(() => document.activeElement.blur());
      const clip = await menue.evaluate(e => { const m = e.getBoundingClientRect(), f = document.querySelector(".chat-eingabe").getBoundingClientRect();
        return { x: f.left - 8, y: m.top - 8, width: f.width + 16, height: f.bottom - m.top + 16 }; });
      await page.screenshot({ path: `${process.env.EINST_BILD}_${colorScheme}.png`, clip });
      await menue.getByRole("radio", { checked: true }).first().focus();
    }
    await page.keyboard.press("Escape");
  }
});
await pruefe("bleibt bei kleinster Fensterbreite vollständig erreichbar", async () => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.evaluate(() => document.documentElement.dataset.bewegung = "reduziert"); await knopf().click();
  const sichtbar = await page.getByRole("dialog").evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; });
  expect(sichtbar).toBe(true);
});

}
