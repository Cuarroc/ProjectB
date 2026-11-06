async page => {
  const pruefe = (wert, text) => { if (!wert) throw new Error(text); };
  await page.goto('http://127.0.0.1:1436');
  await page.evaluate(async () => { document.documentElement.dataset.bewegung = 'voll'; await document.fonts.ready; });
  const log = page.getByRole('log', { name: 'Chatverlauf' });
  pruefe(await log.locator('article').count() === 3, 'Drei Nachrichtenkarten aus den Beispieldaten');
  for (const el of await log.locator('.r-plan-zeile .statusmarke').all()) {
    pruefe(await el.evaluate(el => getComputedStyle(el).color === getComputedStyle(el).getPropertyValue('--status-farbe').trim() || getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'Statusfarben trotz globaler Baustein-Stile');
  }
  for (const [width, height] of [[1440, 900], [1024, 700], [1024, 640]]) {
    await page.setViewportSize({ width, height });
    pruefe(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Kein Fensterüberlauf');
    pruefe(await log.evaluate(el => el.scrollWidth <= el.clientWidth), 'Kein Chatüberlauf');
    const masse = await page.locator('.chat-nachrichten').evaluate(el => {
      const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
      return { breite: r.width, links: r.left - p.left, rechts: p.right - r.right };
    });
    pruefe(masse.breite <= 760 && Math.abs(masse.links - masse.rechts) < 2, 'Chat mittig, höchstens 760 px');
    await page.screenshot({ path: `.ui-cache/chat-${width}x${height}.png` });
  }
  const antworten = page.locator('.r-antworten button');
  await page.locator('.r-bedingungen summary').focus();
  for (let i = 0; i < await antworten.count(); i++) {
    for (let tab = 0; tab < 8 && !(await antworten.nth(i).evaluate(el => el === document.activeElement)); tab++) await page.keyboard.press('Tab');
    pruefe(await antworten.nth(i).evaluate(el => el === document.activeElement), 'Antwort per Tab erreichbar');
    pruefe(await antworten.nth(i).evaluate(el => getComputedStyle(el).outlineWidth === '2px' && getComputedStyle(el).outlineStyle === 'solid'), 'Sichtbarer Tastaturfokus');
    await page.keyboard.press('Enter');
    pruefe(await antworten.nth(i).getAttribute('aria-pressed') === 'true', 'Antwort per Enter auswählbar');
  }
  await page.screenshot({ path: '.ui-cache/chat-fokus.png' });
  for (const [wahl, windows, sichtbar] of [['voll', 'reduce', true], ['reduziert', 'no-preference', false], [null, 'reduce', false]]) {
    await page.emulateMedia({ reducedMotion: windows });
    await page.evaluate(wahl => { if (wahl) document.documentElement.dataset.bewegung = wahl; else delete document.documentElement.dataset.bewegung; }, wahl);
    pruefe(await page.locator('.r-frage').evaluate(el => getComputedStyle(el, '::after').content !== 'none') === sichtbar, 'Leuchten nur bei Voll, Wahl vor Windows');
  }
  await page.locator('.r-bedingungen summary').click();
  pruefe(await page.locator('.r-bedingungen [data-erfuellt=false] svg').first().getAttribute('aria-label') === 'Offen', 'Offene Bedingung als leerer Kreis');
  pruefe(await page.locator('.r-plan-risiko').evaluate(el => getComputedStyle(el).color === 'rgb(169, 176, 192)'), 'Risiko neutral');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: ChatVerlauf } = await import('/src/bereiche/ChatVerlauf.tsx');
    const { BeispielQuelle } = await import('/src/daten/quelle.ts');
    const quelle = new BeispielQuelle(); window.chatTestQuelle = quelle;
    ReactDOM.createRoot(document.querySelector('.chat-spalte')).render(React.createElement(ChatVerlauf, { quelle }));
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const daten = window.chatTestQuelle.lesen();
    daten.chats[0].verlauf[0].text = 'Aktualisierter Auftrag';
    window.chatTestQuelle.aktualisieren(daten);
  });
  await page.getByText('Aktualisierter Auftrag', { exact: true }).waitFor();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('article').first().getByRole('button', { name: 'Kopieren' }).click();
  await page.getByRole('status').getByText('Kopiert.', { exact: true }).waitFor();
  pruefe(await page.evaluate(() => navigator.clipboard.readText()) === 'Aktualisierter Auftrag', 'Kopieren schreibt den Dateninhalt');
  return 'Grün: Datenabo, Kopieren, Tab/Enter/Fokus, 1440×900, 1024×700/640, Voll/Reduziert, Bedingungen und neutrales Risiko';
}
