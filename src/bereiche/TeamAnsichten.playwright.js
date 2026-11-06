async page => {
  const pruefe = (wert, text) => { if (!wert) throw new Error(text); };
  const bilder = process.env.PROJECTB_BILDER;
  await page.goto('http://127.0.0.1:1437/');
  const ruhe = () => page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
  for (const [breite, hoehe] of [[1440,900],[1280,800],[1024,700]]) {
    await page.setViewportSize({width:breite,height:hoehe});
    for (const ansicht of ['Board','Zeitstrahl']) {
      await page.getByRole('radio',{name:ansicht,exact:true}).click();
      for (const modus of ['voll','reduziert']) {
        await page.evaluate(m => document.documentElement.dataset.bewegung = m, modus); await ruhe();
        pruefe(await page.locator('.team-kopf').evaluate(el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kopf-hoehe'))), 'Team-Kopf bricht um');
        if (modus === 'reduziert') pruefe(await page.locator('.team-wechsel').evaluate(el => getComputedStyle(el).animationName === 'none'), 'Ansichtswechsel bewegt sich in Reduziert');
        pruefe(await page.locator('.team-spalte').evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().bottom <= innerHeight), 'Team läuft über');
        pruefe(await page.locator('.team-wechsel').evaluate(el => el.scrollWidth <= el.clientWidth), 'Ansicht läuft über');
        pruefe(await page.locator('.team-wechsel *').evaluateAll(els => els.filter(el => el.textContent.trim()).every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)), 'Schrift unter 12 px');
        pruefe(await page.locator('.team-wechsel .statusmarke').evaluateAll(els => els.every(el => {
          const probe = document.createElement('i'); probe.style.color = 'var(--status-farbe)'; el.append(probe);
          const farbe = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(el).color === farbe;
        })), 'Statusfarbe wird überschrieben');
        if (ansicht === 'Zeitstrahl') {
          pruefe(await page.locator('.team-zeit .zs-lebt').first().evaluate(el => getComputedStyle(el,'::before').animationName !== 'none') === (modus === 'voll'), 'Bewegungsmodus ignoriert');
          if (breite === 1440) pruefe(await page.locator('.team-phasenlegende').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'Legende liegt außerhalb des Fensters');
        }
        if (breite === 1024) {
          pruefe(await page.locator('.team-ansichten .um-teil>span').evaluateAll(els => els.every(el => getComputedStyle(el).display === 'none')), 'Ansichtswörter bleiben sichtbar');
          pruefe(await page.getByRole('button',{name:'Alle anhalten',exact:true}).isVisible(), 'Alle anhalten fehlt');
        }
        if (modus === 'voll' && bilder) await page.screenshot({path:`${bilder}_${ansicht.toLowerCase()}_${breite}.png`});
      }
    }
  }
  await page.getByRole('radio',{name:'Karten',exact:true}).focus();
  await page.keyboard.press('ArrowRight'); pruefe(await page.getByRole('radio',{name:'Board',exact:true}).getAttribute('aria-checked') === 'true', 'Pfeiltaste schaltet nicht');
  await page.keyboard.press('End'); pruefe(await page.getByRole('radio',{name:'Zeitstrahl',exact:true}).getAttribute('aria-checked') === 'true', 'Ende schaltet nicht');
  await page.locator('.team-spurzeile[data-agent=kern] button').click();
  pruefe(await page.getByRole('complementary',{name:'Details: CSV-Export im Kern'}).isVisible(), 'Zeitstrahl öffnet keine Details');
  await page.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:'Alle anhalten',exact:true}).click();
  pruefe(await page.locator('.team-spurzeile[data-agent=kern] .mk').innerText() === 'Wartet auf dich', 'Anhalten erreicht Zeitstrahl nicht');
  await page.getByRole('radio',{name:'Board',exact:true}).click();
  await page.locator('.team-bkarte[data-agent=kern]').click();
  pruefe(await page.getByRole('complementary',{name:'Details: CSV-Export im Kern'}).isVisible(), 'Board öffnet keine Details');
  return 'Grün: Board/Zeitstrahl, 1440×900/1024×700, Voll/Reduziert, Tastatur, Details, Anhalten, Schrift und Überlauf';
}
