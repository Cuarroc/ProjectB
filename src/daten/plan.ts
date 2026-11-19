import type { Plan } from "./typen";
import type { PlanMarken } from "../bereiche/Planfenster";

const schaetzZeile = /^(?:-\s*)?(?:Dauer|Tokens|Risiko):/i;

export function markdownKlartext(text: string) {
  return text.replace(/(\*\*|\*|`)(.+?)\1/g, (ganz, _zeichen, innen: string) => innen.trim() === innen ? innen : ganz);
}
export function aufgabenListe(text: string) {
  const zeilen: { zeile: string; punkt: RegExpMatchArray | null }[] = [];
  let codeZaun = "", neueListe = false;
  for (const zeile of text.split(/\r?\n/)) {
    const zaun = zeile.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
    if (codeZaun) {
      if (zaun && zaun[1][0] === codeZaun[0] && zaun[1].length >= codeZaun.length && !zaun[2].trim()) codeZaun = "";
      continue;
    }
    if (/^[ \t]*>/.test(zeile)) continue;
    if (zaun) { codeZaun = zaun[1]; continue; }
    const punkt = zeile.match(/^[ \t]*[-*][ \t]+\[([ xX])\][ \t]+(\S.*)$/);
    if (punkt && neueListe) { zeilen.length = 0; neueListe = false; }
    if (!punkt && !schaetzZeile.test(zeile.trim()) && /^\S/.test(zeile) && (/^#{1,6}(?:[ \t]|$)/.test(zeile) || zeile.trimEnd().endsWith(":"))) neueListe = true;
    zeilen.push({ zeile, punkt });
  }
  return zeilen;
}
export function antwortPlan(text: string, id: string): Plan | undefined {
  const schritte: Plan["schritte"] = [], zeilen = aufgabenListe(text);
  const letzterPunkt = zeilen.reduce((letzter, { punkt }, i) => punkt ? i : letzter, -1);
  for (const [i, { zeile, punkt }] of zeilen.entries()) {
    if (punkt) {
      schritte.push({ id: `${id}-${schritte.length + 1}`, titel: markdownKlartext(punkt[2].trimEnd()),
        beschreibung: "", fertigWenn: [], agentId: null, zustand: "Offen", dauerMinuten: null, tokens: null, risiko: null, kommentar: "", markierungen: [] });
      continue;
    }
    const schritt = schritte.at(-1), kriterium = zeile.trim().match(/^(?:-\s*)?Fertig, wenn\s*:?\s*(.+)$/i);
    const dauer = zeile.trim().match(/^(?:-\s*)?Dauer:\s*~?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*min$/i);
    const tokens = zeile.trim().match(/^(?:-\s*)?Tokens:\s*~?\s*(\d+(?:[.,]\d+)?)\s*(k)?$/i);
    const risiko = zeile.trim().match(/^(?:-\s*)?Risiko:\s*(Niedrig|Mittel|Hoch)$/i);
    if (schritt && dauer) { schritt.dauerMinuten = Math.max(Number(dauer[1]), Number(dauer[2] ?? dauer[1])); continue; }
    if (schritt && tokens) { schritt.tokens = Number(tokens[1].replace(",", ".")) * (tokens[2] ? 1000 : 1); continue; }
    if (schritt && risiko) { schritt.risiko = risiko[1].toLowerCase() === "niedrig" ? 1 : risiko[1].toLowerCase() === "mittel" ? 2 : 3; continue; }
    if (schaetzZeile.test(zeile.trim())) continue;
    if (schritt && kriterium) schritt.fertigWenn.push({ text: kriterium[1], erfuellt: false });
    else if (schritt && zeile.trim() && (i < letzterPunkt || /^[ \t]+\S/.test(zeile))) schritt.beschreibung += `${schritt.beschreibung ? "\n" : ""}${zeile.trim()}`;
  }
  return schritte.length ? { id, titel: "Dein Plan", schritte, freigabe: "Wartet auf dich" } : undefined;
}
export function planKommentare(plan: Plan, stil: string, marken: PlanMarken = {}) {
  return ["Kommentare zum Plan:", ...plan.schritte.flatMap(s => {
    const felder = [["titel", "Titel", s.titel], ["beschreibung", "Beschreibung", s.beschreibung], ...s.fertigWenn.map((k, i) => [`bedingung${i}`, `Kriterium ${i + 1}`, k.text])];
    const stellen = felder.flatMap(([feld, name, text]) => {
      const m = marken[`${s.id}:${feld}`];
      return m ? [`  - „${text.slice(m.start, m.ende)}“ (${name}): ${m.name}`] : [];
    });
    return s.markierungen.length || s.kommentar.trim() || stellen.length ? [
      `- ${s.titel}: [${s.markierungen.join(", ")}] ${[s.kommentar.trim(), s.markierungen.includes("Ausarbeiten") ? "Bitte zerlege diesen Schritt in Teilschritte." : ""].filter(Boolean).join(" ")}`, ...stellen] : [];
  }),
    ...(stil ? [`Gewünschte Fassung: ${stil}`] : [])].join("\n");
}
