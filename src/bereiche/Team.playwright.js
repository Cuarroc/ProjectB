async page => {
  const pruefe = (wert, text) => { if (!wert) throw new Error(text); };
  await page.goto('http://127.0.0.1:1435/');
  for (const [breite, hoehe] of [[1280,800],[1024,700]]) {
    await page.setViewportSize({ width: breite, height: hoehe });
    for (const modus of ['voll','reduziert']) {
      await page.evaluate(m => document.documentElement.dataset.bewegung = m, modus);
      for (const id of ['orchestrator','kern','knopf','dauer']) {
        const karte = page.locator(`[data-agent=${id}]`);
        await karte.locator('.ak-kopf').click();
        const sichtbar = await karte.evaluate(el => {
          const r = el.getBoundingClientRect(), liste = el.closest('.team-liste').getBoundingClientRect();
          return r.top >= liste.top + 70 && r.bottom <= liste.bottom + 1;
        });
        pruefe(sichtbar, `${breite}/${modus}/${id}: Karte wird verdeckt`);
        pruefe(await karte.locator('.mk svg').count() === 1, 'Statussymbol fehlt');
        await page.getByRole('button', { name: 'Schließen', exact: true }).click();
      }
      pruefe(await page.locator('.team-spalte').evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().bottom <= innerHeight), 'Team läuft über');
      pruefe(await page.locator('.team-spalte *').evaluateAll(els => els.filter(el => el.textContent.trim()).every(el => parseFloat(getComputedStyle(el).fontSize) >= 12)), 'Schrift kleiner als 12 px');
      const animiert = await page.locator('[data-agent=kern] .zs-lebt').evaluate(el => getComputedStyle(el, '::before').animationName !== 'none');
      pruefe(animiert === (modus === 'voll'), 'Bewegungsmodus wird ignoriert');
    }
  }
  await page.locator('[data-agent=kern]').getByRole('button', { name:'Anhalten', exact:true }).click();
  pruefe(await page.locator('[data-agent=kern] .mk').innerText() === 'Wartet auf dich', 'Anhalten ändert Zustand nicht');
  await page.locator('[data-agent=kern]').getByRole('button', { name:'Fortsetzen', exact:true }).click();
  pruefe(await page.locator('[data-agent=kern] .mk').innerText() === 'Arbeitet', 'Fortsetzen fehlt');
  await page.getByRole('button', { name:'Alle anhalten', exact:true }).click();
  pruefe(await page.locator('[data-agent=kern] .ak-fuss').innerText().then(t => t.includes('Angehalten.')), 'Alle anhalten wirkt nicht');
  pruefe(await page.locator('[data-agent=dauer] .mk').innerText() === 'Fertig', 'Fertiger Agent verändert');
  return 'Grün: 2 Fenstergrößen, Voll/Reduziert, Karten sichtbar, 12 px, kein Überlauf, Anhalten/Fortsetzen/Alle anhalten';
}
