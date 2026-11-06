async page => {
  const pruefe = (wert, meldung) => { if (!wert) throw new Error(meldung); };
  await page.goto('http://127.0.0.1:1434/?vorschau=eingabe');
  await page.setViewportSize({ width: 980, height: 440 });
  await page.evaluate(() => document.fonts.ready);
  const feld = page.getByRole('textbox', { name: 'Nachricht an den Orchestrator' });
  const senden = page.locator('button[type=submit]');
  await page.setViewportSize({ width: 640, height: 440 });
  pruefe(await page.locator('.ein').evaluate(el => el.offsetWidth) === 600, 'Breite folgt dem Behälter');
  await page.setViewportSize({ width: 980, height: 440 });
  for (const modus of ['voll', 'reduziert']) {
    await page.evaluate(modus => document.documentElement.dataset.bewegung = modus, modus);
    await feld.fill('Bau einen CSV-Export');
    await feld.press('Shift+Enter');
    pruefe(await feld.inputValue() === 'Bau einen CSV-Export\n', 'Shift+Enter fügt eine Zeile ein');
    await feld.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    pruefe(await senden.getAttribute('aria-busy') === null, 'IME sendet nicht');
    await feld.press('Enter');
    pruefe(await senden.getAttribute('aria-busy') === 'true', 'Enter sendet');
    await feld.press('Enter'); await senden.click();
    await page.getByText('Nicht gesendet. Dein Text bleibt stehen.', { exact: true }).waitFor();
    pruefe(await feld.inputValue() === 'Bau einen CSV-Export\n', 'Fehler erhält den Text');
    pruefe(await page.locator('[aria-live=polite]').innerText() === 'Nicht gesendet. Dein Text bleibt stehen.', 'Höfliche Fehlermeldung');
    pruefe(await feld.getAttribute('aria-describedby') === 'nachricht-meldung', 'Fehler mit Feld verknüpft');
    await page.reload(); await page.evaluate(() => document.fonts.ready);
    await page.evaluate(modus => document.documentElement.dataset.bewegung = modus, modus);
    const masse = await page.locator('.ein').evaluate(el => {
      const css = getComputedStyle(el), leiste = getComputedStyle(el.querySelector('.ein-leiste'));
      return { breite: el.offsetWidth, radius: css.borderRadius, ring: css.outlineStyle, gap: leiste.gap,
        schrift: [...el.querySelectorAll('textarea,button')].map(k => parseFloat(getComputedStyle(k).fontSize)) };
    });
    pruefe(masse.breite === 760 && masse.radius === '18px' && masse.ring === 'none', 'Chat-Maximalbreite aus Token, ohne Akzent-Rand');
    pruefe(masse.gap === '8px' && masse.schrift.every(n => n >= 12), '8-px-Lücken und Schrift mindestens 12 px');
    await page.screenshot({ path: `C:/ProjectB-Postfach/an-claude-aufsicht/orchestrator/bilder/PR132_eingabefeld_${modus}.png` });
    await feld.focus();
    pruefe(await page.locator('.ein').evaluate(el => getComputedStyle(el).outlineWidth) === '2px', 'Fokusring sofort');
    await page.screenshot({ path: `C:/ProjectB-Postfach/an-claude-aufsicht/orchestrator/bilder/PR132_eingabefeld_${modus}_fokus.png` });
    await feld.blur();
    await senden.hover(); await page.mouse.down(); await page.waitForTimeout(150);
    const zoom = await senden.evaluate(el => getComputedStyle(el).transform);
    pruefe(modus === 'reduziert' ? zoom === 'matrix(1, 0, 0, 1, 0, 0)' : zoom.startsWith('matrix(0.97'), 'Druckzoom nur in Voll');
    await page.mouse.up();
  }
  await page.evaluate(() => delete document.documentElement.dataset.bewegung);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  pruefe(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--skala-druck').trim()) === '1', 'Windows-Automatik reduziert');
  await page.evaluate(() => document.documentElement.dataset.bewegung = 'voll');
  pruefe(await page.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--skala-druck').trim()) === '0.97', 'Explizites Voll hat Vorrang');
  return 'Grün: Enter, Shift+Enter, IME, Sendesperre, Fehler, Tokens, Fokus und Bewegung Voll/Reduziert';
}
