async page => {
  const pruefe = (ok, text) => { if (!ok) throw new Error(text); };
  await page.goto('http://127.0.0.1:1438'); await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => document.fonts.ready);
  const effort = page.getByRole('button', { name: 'Effort: Hoch', exact: true });
  await effort.focus(); await effort.hover(); await page.getByRole('tooltip', { name: 'Effort: Hoch', exact: true }).waitFor({ state: 'visible' }); await effort.press('ArrowDown');
  await page.getByRole('menuitemradio', { name: 'Sehr hoch', exact: true }).click({ timeout: 3000 });
  pruefe(await page.getByRole('button', { name: 'Effort: Sehr hoch' }).count() === 1, 'Menü bleibt trotz Tooltip anklickbar');
  const modus = page.getByRole('radio', { name: 'Ausführen', exact: true }); await modus.focus(); await modus.press('ArrowRight');
  pruefe(await page.getByRole('radio', { name: 'Planen', exact: true }).getAttribute('aria-checked') === 'true', 'Modus mit Pfeiltaste');
  pruefe(await page.locator('#modus-hilfe').innerText() === await page.getByRole('radio', { name: 'Planen', exact: true }).getAttribute('aria-description'), 'Aktive Erklärung am Feld');
  const modell = page.getByRole('button', { name: 'Modell: Opus 5.5', exact: true }); await modell.focus(); await modell.press('ArrowDown');
  await page.keyboard.press('End'); await page.keyboard.press('Home'); await page.keyboard.press('Escape');
  pruefe(await modell.evaluate(e => e === document.activeElement), 'Esc gibt Fokus zurück');
  await modell.press('ArrowDown'); await page.keyboard.press('Tab');
  pruefe(await page.getByRole('menu').count() === 0, 'Tab schließt');
  const kontext = page.getByRole('button', { name: 'Kontext 10 % · 1M', exact: true }); await kontext.focus(); await kontext.press('ArrowDown');
  pruefe(await page.getByRole('menuitemradio', { name: '1M', exact: true }).evaluate(e => e === document.activeElement), 'Aktuelles Fenster fokussiert');
  await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  pruefe(await page.getByRole('button', { name: 'Kontext 39 % · 256k', exact: true }).count() === 1, 'Füllung folgt der Fenstergröße');
  const feld = page.getByRole('textbox', { name: 'Nachricht an den Orchestrator' }); await feld.fill('Browsernachricht'); await feld.press('Shift+Enter');
  await feld.dispatchEvent('keydown', { key: 'Enter', isComposing: true }); pruefe(await feld.inputValue() === 'Browsernachricht\n', 'Shift+Enter und IME behalten Text'); await feld.press('Enter');
  pruefe(await feld.inputValue() === '', 'Enter sendet');
  for (const breite of [760, 659, 569, 479, 378]) {
    await page.locator('.chat-eingabe').evaluate((e, w) => e.style.width = `${w}px`, breite);
    const masse = await page.locator('.chat-eingabe').evaluate(e => ({ w: e.clientWidth, scroll: e.scrollWidth, gap: getComputedStyle(e.querySelector('.ein-leiste')).gap,
      zeilen: [...e.querySelectorAll('.ein-leiste > .ein-auswahl, .ein-leiste > button')].map(b => b.getBoundingClientRect().top), schrift: [...e.querySelectorAll('button,textarea')].every(b => parseFloat(getComputedStyle(b).fontSize) >= 12) }));
    pruefe(masse.scroll === masse.w && new Set(masse.zeilen).size === 1 && masse.gap === '8px' && masse.schrift, `Feste Reihe ohne Überlauf bei ${breite}`);
  }
  await page.locator('.chat-eingabe').evaluate(e => e.style.removeProperty('width'));
  for (const bewegung of ['voll', 'reduziert']) {
    await page.evaluate(b => document.documentElement.dataset.bewegung = b, bewegung); await modell.focus();
    pruefe(await modell.evaluate(e => getComputedStyle(e).outlineWidth) === '2px', 'Sichtbarer Fokus');
    pruefe(await page.locator('.um-pille').first().evaluate(e => getComputedStyle(e).transitionDuration) === '0s', 'Pille springt');
  }
  await page.reload(); await page.setViewportSize({ width: 1920, height: 1080 }); await page.evaluate(() => document.fonts.ready);
  return 'Grün: Tooltip-Menü, Pfeile, Pos1/Ende, Esc/Tab, Fokus, Enter/Shift/IME, Beispielzustand, Breiten und Bewegung';
}
