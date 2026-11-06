async page => {
  await page.goto('http://127.0.0.1:1433/?vorschau=bausteine2&tafel=zeitspur');
  const animationen = () => page.locator('.zs-lebt').first().evaluate(el => [getComputedStyle(el).animationName, getComputedStyle(el, '::before').animationName, getComputedStyle(document.querySelector('.zs-jetzt')).animationName]);
  await page.evaluate(() => document.documentElement.dataset.bewegung = 'reduziert');
  if ((await animationen()).some(n => n !== 'none')) throw new Error('Reduziert: Eine Zeitspur-Animation läuft weiter');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => delete document.documentElement.dataset.bewegung);
  if ((await animationen()).some(n => n !== 'none')) throw new Error('Windows: Eine Zeitspur-Animation läuft weiter');
  await page.evaluate(() => document.documentElement.dataset.bewegung = 'voll');
  if ((await animationen()).some(n => n === 'none')) throw new Error('Voll: Eine Zeitspur-Animation fehlt');
  await page.locator('.zs-stueck').first().focus();
  if (!await page.locator('.b2-tipp').first().isVisible()) throw new Error('Phasen-Zeiten sind mit Tastatur nicht erreichbar');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return 'Grün: Reduziert, Windows-Vorgabe, Voll und Phasen-Tooltip';
}
