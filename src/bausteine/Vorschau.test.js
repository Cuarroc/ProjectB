async page => {
  const pruefe = (wert, meldung) => { if (!wert) throw new Error(meldung); };
  await page.goto('http://127.0.0.1:1433/?vorschau=bausteine');
  const marken = page.locator('section[aria-label="Statusmarke"] > div:first-child .statusmarke');
  pruefe((await marken.allTextContents()).join('|') === 'Offen|Arbeitet|Wartet auf dich|Fertig|Problem', 'Fünf Statuswörter');
  pruefe(await marken.locator('svg[stroke-width="2.25"]').count() === 5, 'Symbol und absolute Strichbreite');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  pruefe(await page.locator(':focus').evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineWidth === '2px'), 'Tastaturfokus');
  await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  pruefe(await page.getByText('Ausgelöste Handlungen: 2').count() === 1, 'Hauptknopf');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  pruefe(await page.getByText('Ausgelöste Handlungen: 4').count() === 1, 'Zweitknopf');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  pruefe(await page.getByText('Ausgelöste Handlungen: 6').count() === 1, 'Symbolknopf');
  const gruppe = page.getByRole('radiogroup', { name: 'Teamansicht' });
  await gruppe.getByRole('radio', { name: 'Karten', exact: true }).focus();
  for (const [taste, name] of [['ArrowRight','Board'],['ArrowDown','Zeitstrahl'],['End','Vorschau'],['ArrowRight','Karten'],['ArrowLeft','Vorschau'],['ArrowUp','Zeitstrahl'],['Home','Karten']]) {
    await page.keyboard.press(taste);
    pruefe((await gruppe.locator('[aria-checked="true"]').innerText()).trim() === name && await page.locator(':focus').getAttribute('aria-checked') === 'true', taste);
  }
  await page.keyboard.press('Space'); await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
  pruefe((await page.locator(':focus').innerText()).startsWith('256k'), 'Tab verlässt Gruppe');
  const breiten = await page.locator('tbody tr').evaluateAll(zeilen => zeilen.map(z => [z.querySelector('td button').clientWidth, z.querySelector('td:last-child button').clientWidth]));
  pruefe(breiten.every(([a,b]) => a === b), 'Breite beim Laden');
  pruefe(await page.getByRole('img', { name: '0 % · Offen', exact: true }).locator('.ring-bogen').getAttribute('visibility') === 'hidden', '0 % ohne Punkt');
  pruefe(await page.locator('[data-klein] circle').first().evaluate(el => { const svg = el.ownerSVGElement; return (el.cx.baseVal.value + el.r.baseVal.value) * svg.clientWidth / svg.viewBox.baseVal.width + parseFloat(getComputedStyle(svg).strokeWidth) / 2 <= svg.clientWidth; }), '20-px-Ringspur wird am SVG-Rand abgeschnitten');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  pruefe(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--dauer-daten').trim()) === '0ms', 'Reduzierte Bewegung');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return 'Grün: Status, Symbole, Tastatur, Ladebreite, Ringgeometrie und reduzierte Bewegung';
}
