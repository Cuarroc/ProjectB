import { test } from '@playwright/test';
test('Team-Ansichten mit Tastatur, Antworten und lesbaren Zeitspuren', async ({ page }, testInfo) => {
  test.skip(process.env.UI_BASELINE === '1', 'Neue Ansichten werden am Kandidaten geprüft.');
  const pruefe = (wert, text) => { if (!wert) throw new Error(text); };
  const bilder = process.env.PROJECTB_BILDER;
  await page.goto('/');
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
          pruefe(await page.locator('.team-spuren .team-achse').evaluate(el => {
            const chip = el.querySelector('.team-jetzt').getBoundingClientRect();
            return [...el.querySelectorAll(':scope>div>span')].every(label => chip.bottom <= label.getBoundingClientRect().top) && getComputedStyle(el,'::after').display === 'none';
          }), 'Jetzt-Chip oder Linie überlagert Achsenlabels');
          pruefe(await page.locator('.team-spurzeile .zs-wartet').evaluateAll(els => els.every(el => getComputedStyle(el).color === 'rgba(0, 0, 0, 0)' || el.scrollWidth <= el.clientWidth)), 'Wartebeschriftung läuft über');
          pruefe(await page.locator('.team-zeit .zs-lebt').first().evaluate(el => getComputedStyle(el,'::before').animationName !== 'none') === (modus === 'voll'), 'Bewegungsmodus ignoriert');
          if (breite === 1440) pruefe(await page.locator('.team-phasenlegende').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'Legende liegt außerhalb des Fensters');
        }
        if (ansicht === 'Board') pruefe(await page.locator('.team-bfortschritt progress').evaluate(el => getComputedStyle(el).appearance === 'none'), 'Fortschrittsfüllung bleibt unsichtbar');
        if (breite === 1024) {
          pruefe(await page.locator('.team-ansichten .um-teil>span').evaluateAll(els => els.every(el => getComputedStyle(el).display === 'none')), 'Ansichtswörter bleiben sichtbar');
          pruefe(await page.getByRole('button',{name:'Alle anhalten',exact:true}).isVisible(), 'Alle anhalten fehlt');
        }
        if (modus === 'voll') {
          const path = bilder ? `${bilder}_${ansicht.toLowerCase()}_${breite}.png` : testInfo.outputPath(`${ansicht}_${breite}.png`);
          await page.screenshot({path}); await testInfo.attach(`${ansicht} ${breite}`, {path,contentType:'image/png'});
        }
      }
    }
  }
  await page.getByRole('radio',{name:'Board',exact:true}).click();
  const antwort = page.locator('.team-board').getByRole('button',{name:'In Downloads',exact:true});
  await antwort.click(); pruefe(await antwort.getAttribute('aria-pressed') === 'true', 'Board übernimmt Antwort nicht');
  pruefe(await page.locator('.team-board button button').count() === 0, 'Verschachtelte Antwortknöpfe');
  pruefe(await page.locator('#team-details').count() === 0, 'Antwort öffnet Agentendetails');
  await page.getByRole('radio',{name:'Karten',exact:true}).focus();
  await page.keyboard.press('ArrowRight'); pruefe(await page.getByRole('radio',{name:'Board',exact:true}).getAttribute('aria-checked') === 'true', 'Pfeiltaste schaltet nicht');
  await page.keyboard.press('End'); pruefe(await page.getByRole('radio',{name:'Zeitstrahl',exact:true}).getAttribute('aria-checked') === 'true', 'Ende schaltet nicht');
  await page.locator('.team-spurzeile[data-agent=kern] button').click();
  pruefe(await page.getByRole('complementary',{name:'Details: CSV-Export im Kern'}).isVisible(), 'Zeitstrahl öffnet keine Details');
  await page.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:'Alle anhalten',exact:true}).click();
  pruefe(await page.locator('.team-spurzeile[data-agent=kern] .mk').innerText() === 'Wartet auf dich', 'Anhalten erreicht Zeitstrahl nicht');
  await page.getByRole('radio',{name:'Board',exact:true}).click();
  await page.locator('.team-bkarte[data-agent=kern] .team-bdetails').click();
  pruefe(await page.getByRole('complementary',{name:'Details: CSV-Export im Kern'}).isVisible(), 'Board öffnet keine Details');
  return 'Grün: Board/Zeitstrahl, 1440×900/1024×700, Voll/Reduziert, Tastatur, Details, Anhalten, Schrift und Überlauf';
});
