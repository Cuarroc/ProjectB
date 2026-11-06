async page => {
  const pruefe = (ok, text) => { if (!ok) throw new Error(text); };
  await page.goto('http://127.0.0.1:1434/?vorschau=bausteine&tafel=tooltip');
  const projekt = page.getByRole('button', { name: 'Projekt', exact: true }), tipp = page.getByRole('tooltip').filter({ hasText: 'Projekt ProjectB' });
  await projekt.hover(); await page.waitForTimeout(750);
  pruefe(await tipp.isVisible(), 'Tooltip nach Wartezeit');
  const box = await tipp.boundingBox(); pruefe(box.x >= 8 && box.width <= 280 && box.y > 20, 'Abstand, Breite und Ausweichen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 }); await page.waitForTimeout(200);
  pruefe(await tipp.isVisible(), 'Maus darf über den Steg zur Erklärung');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150); pruefe(!await tipp.isVisible(), 'Esc schließt');
  await page.mouse.move(990, 390); await page.waitForTimeout(500); await page.keyboard.press('Tab'); await projekt.focus(); await page.waitForTimeout(750);
  pruefe(await tipp.isVisible(), 'Tastatur-Fokus öffnet'); await page.keyboard.press('Escape');
  const pfad = page.getByRole('button', { name: 'src/kern/…/csv_schreiber….rs' }); await pfad.hover(); await page.waitForTimeout(700);
  pruefe(await page.locator('.tt.code.offen').evaluate(el => el.scrollWidth === el.clientWidth), 'Langer Pfad bricht um');
  await page.goto('http://127.0.0.1:1434/?vorschau=bausteine&tafel=toast');
  const info = page.locator('.to[data-art=info]'); await info.hover(); await page.waitForTimeout(6100); pruefe(await info.count() === 1, 'Hover pausiert Info');
  const frage = page.locator('.to[data-art=wartet]'); await frage.getByRole('button', { name: 'Schließen' }).focus();
  await page.keyboard.press('Enter'); pruefe(await frage.evaluate(el => el.inert), 'Schließen sofort inert');
  pruefe(await page.locator('.to[data-art=problem] [data-zu]').evaluate(el => el === document.activeElement), 'Fokus geht zum nächsten Toast');
  await page.waitForTimeout(150); pruefe(await frage.count() === 0, 'Nach Ausblenden entfernt');
  await page.evaluate(() => document.documentElement.style.setProperty('--dauer-kurz', '0ms'));
  await page.locator('.to[data-art=problem] [data-zu]').click(); pruefe(await page.locator('.to[data-art=problem]').count() === 0, '0 ms sofort entfernt');
  for (const wert of ['voll', 'reduziert']) {
    await page.evaluate(wert => document.documentElement.dataset.bewegung = wert, wert);
    pruefe(await page.locator('.to').first().evaluate(el => getComputedStyle(el).getPropertyValue('--weg-mittel').trim()) === (wert === 'voll' ? '8px' : '0px'), 'Bewegungswahl');
  }
  await page.goto('http://127.0.0.1:1434/?vorschau=bausteine&tafel=leerzustand');
  await page.waitForTimeout(650); pruefe(await page.locator('.lz-platz').count() === 2, 'Ladeplatzhalter nach Wartezeit');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click(); await page.waitForTimeout(1700);
  pruefe(await page.locator('.lz-team .lz-titel').allTextContents().then(texte => texte.every(t => t === 'Noch keine Agenten.')), 'Erneuter Versuch endet leer');
  pruefe(await page.locator('.m3 p, .m3 button').evaluateAll(els => els.every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)), 'Mindestens 12 px');
  return 'Grün: Hoversteg, Esc, Tastatur, Ränder, Pfadumbruch, Toast-Pause, inert, Fokus, 0 ms, Bewegungswahl, Leer- und Ladezustände';
}
