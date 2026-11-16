import type { Plan } from "./typen";
import type { PlanMarken } from "../bereiche/Planfenster";

export function antwortPlan(text: string, id: string): Plan | undefined {
  const schritte: Plan["schritte"] = [], punktMuster = /^[ \t]*[-*][ \t]+\[([ xX])\][ \t]+(\S.*)$/;
  let codeZaun = "";
  const zeilen = text.split(/\r?\n/).filter(zeile => {
    const zaun = zeile.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
    if (codeZaun) {
      if (zaun && zaun[1][0] === codeZaun[0] && zaun[1].length >= codeZaun.length && !zaun[2].trim()) codeZaun = "";
      return false;
    }
    if (zaun) { codeZaun = zaun[1]; return false; }
    return true;
  });
  const letzterPunkt = zeilen.reduce((letzter, zeile, i) => punktMuster.test(zeile) ? i : letzter, -1);
  for (const [i, zeile] of zeilen.entries()) {
    const punkt = zeile.match(punktMuster);
    if (punkt) {
      schritte.push({ id: `${id}-${schritte.length + 1}`, titel: punkt[2].trimEnd().replace(/(\*\*|\*|`)(.+?)\1/g, "$2"),
        beschreibung: "", fertigWenn: [], agentId: null, zustand: "Offen", dauerMinuten: 0, kommentar: "", markierungen: [] });
      continue;
    }
    const schritt = schritte.at(-1), kriterium = zeile.trim().match(/^(?:-\s*)?Fertig, wenn\s*:?\s*(.+)$/i);
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
    `Gewünschte Fassung: ${stil}`].join("\n");
}
