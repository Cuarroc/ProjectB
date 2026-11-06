async page => {
  const pruefe = (wert, meldung) => { if (!wert) throw new Error(meldung); };
  await page.goto('http://127.0.0.1:5183/?vorschau=bausteine');
  const modus = async (wert, windows = 'no-preference') => {
    await page.emulateMedia({ reducedMotion: windows });
    await page.evaluate(wert => {
      if (wert) document.documentElement.dataset.bewegung = wert;
      else delete document.documentElement.dataset.bewegung;
    }, wert);
  };
  const knopf = page.getByRole('button', { name: 'Senden', exact: true }).first();
  const bogen = page.locator('.ring-bogen').first();
  const dauer = el => getComputedStyle(el).transitionDuration;
  for (const [wahl, windows, reduziert] of [
    ['voll', 'no-preference', false], ['reduziert', 'no-preference', true],
    [null, 'reduce', true], ['voll', 'reduce', false],
  ]) {
    await modus(wahl, windows);
    pruefe(await bogen.evaluate(dauer) === (reduziert ? '0s, 0.12s' : '0.64s, 0.26s'), 'Ringdauer und Vorrang der Wahl');
    pruefe(await page.locator('.umschalter-pille').first().evaluate(dauer) === '0s', 'Pille ohne Übergang');
    pruefe(await page.locator('[aria-busy=true]').first().evaluate(dauer) === '0s', 'Laden sofort');
    await knopf.focus();
    await page.keyboard.down('Space');
    pruefe(await knopf.evaluate(el => getComputedStyle(el).transform) === 'none', 'Kein Tastaturzoom');
    pruefe(await knopf.evaluate(el => getComputedStyle(el).outlineWidth) === '2px', 'Fokusring sofort');
    await page.keyboard.up('Space');
    await knopf.blur();
    await knopf.hover();
    await page.mouse.down();
    await page.waitForTimeout(150);
    const zoom = await knopf.evaluate(el => getComputedStyle(el).transform);
    pruefe(reduziert ? zoom === 'matrix(1, 0, 0, 1, 0, 0)' : zoom.startsWith('matrix(0.97'), 'Druckzoom nur in Voll');
    await page.mouse.up();
  }
  const gruppe = page.getByRole('radiogroup', { name: 'Teamansicht' });
  for (const name of ['Board', 'Zeitstrahl', 'Karten']) {
    await gruppe.getByRole('radio', { name, exact: true }).click();
    pruefe(await gruppe.locator('[aria-checked=true]').innerText() === name, 'Auswahl sofort');
    pruefe(await gruppe.locator('.um-pille').evaluate(el => el.getAnimations().length) === 0, 'Pille gleitet nie');
  }
  await gruppe.getByRole('radio', { name: 'Karten', exact: true }).focus();
  await page.keyboard.press('End');
  pruefe(await gruppe.locator('[aria-checked=true]').innerText() === 'Vorschau', 'Ende wählt sofort');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  pruefe(await gruppe.locator('[aria-checked=true]').innerText() === 'Board', 'Pfeiltaste wählt sofort');
  pruefe(await page.locator('.statusmarke.hinweis').count() === 0, 'Kein Hinweis beim ersten Bild');
  await page.getByRole('button', { name: 'Nächster Zustand' }).click();
  const hinweis = page.locator('.statusmarke.hinweis');
  pruefe(await hinweis.count() === 1, 'Hinweis bei echtem Eintritt');
  pruefe(await hinweis.evaluate(el => getComputedStyle(el).transform) === 'none', 'Status ohne Zoom');
  const schatten = await hinweis.evaluate(el => getComputedStyle(el, '::after').boxShadow);
  await modus('reduziert');
  pruefe(await hinweis.evaluate(el => getComputedStyle(el, '::after').animationName) === 'none', 'Reduziert ohne Hinweis');
  pruefe(await hinweis.evaluate(el => getComputedStyle(el, '::after').boxShadow) === schatten, 'Feste Glanzebene');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { Fortschrittsring } = await import('/src/bausteine/Fortschrittsring.tsx');
    const host = document.createElement('div'); host.id = 'unbekannt'; document.querySelector('main').append(host);
    ReactDOM.createRoot(host).render(React.createElement(Fortschrittsring, { wert: null }));
  });
  await page.getByRole('img', { name: 'Fortschritt unbekannt', exact: true }).waitFor();
  pruefe(await page.locator('#unbekannt .ring-zahl').innerText() === '–', 'Unbekannt statt Null');
  pruefe(await page.locator('#unbekannt .ring-bogen').getAttribute('visibility') === 'hidden', 'Unbekannt ohne Bogen');
  pruefe(await page.locator('.knopf, .statusmarke, .um-teil, .ring').evaluateAll(els => els.every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)), 'Mindestens 12 px');
  const mobil = await page.context().browser().newContext({ hasTouch: true, isMobile: true });
  try {
    const touch = await mobil.newPage();
    await touch.goto(page.url());
    pruefe(await touch.evaluate(() => !matchMedia('(hover: hover) and (pointer: fine)').matches), 'Touch ohne Maus-Hover');
    const zweit = touch.getByRole('button', { name: 'Neuer Chat', exact: true });
    const farbe = await zweit.evaluate(el => getComputedStyle(el).backgroundColor);
    await zweit.hover(); await touch.waitForTimeout(150);
    pruefe(await zweit.evaluate(el => getComputedStyle(el).backgroundColor) === farbe, 'Kein Hover auf Touch');
  } finally { await mobil.close(); }
  await modus('voll');
  return 'Grün: Maus, Tastatur, Voll, Reduziert, Windows-Automatik, Vorrang, Statushinweis, Pille und unbekannter Ring';
}
