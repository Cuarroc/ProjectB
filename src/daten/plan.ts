import type { Plan } from "./typen";

export function antwortPlan(text: string, id: string): Plan | undefined {
  let schritte: Plan["schritte"] = [], inListe = false, codeZaun = "";
  for (const zeile of text.split(/\r?\n/)) {
    const zaun = zeile.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
    if (codeZaun) {
      if (zaun && zaun[1][0] === codeZaun[0] && zaun[1].length >= codeZaun.length && !zaun[2].trim()) codeZaun = "";
      continue;
    }
    if (zaun) { codeZaun = zaun[1]; continue; }
    const punkt = zeile.match(/^[ \t]*[-*][ \t]+\[([ xX])\][ \t]+(\S.*)$/);
    if (punkt) {
      if (!inListe) schritte = [];
      inListe = true;
      schritte.push({ id: `${id}-${schritte.length + 1}`, titel: punkt[2].trimEnd().replace(/(\*\*|\*|`)(.+?)\1/g, "$2"),
        beschreibung: "", fertigWenn: [], agentId: null, zustand: "Offen", dauerMinuten: 0, kommentar: "", markierungen: [] });
      continue;
    }
    const schritt = schritte.at(-1), kriterium = zeile.trim().match(/^(?:-\s*)?Fertig, wenn\s*:?\s*(.+)$/i);
    if (inListe && schritt && kriterium) schritt.fertigWenn.push({ text: kriterium[1], erfuellt: false });
    else if (inListe && schritt && /^[ \t]+\S/.test(zeile)) schritt.beschreibung += `${schritt.beschreibung ? "\n" : ""}${zeile.trim()}`;
    else if (zeile.trim()) inListe = false;
  }
  return schritte.length ? { id, titel: "Dein Plan", schritte, freigabe: "Wartet auf dich" } : undefined;
}
export function planKommentare(plan: Plan, stil: string) {
  return ["Kommentare zum Plan:", ...plan.schritte.filter(s => s.markierungen.length || s.kommentar.trim()).map(s =>
    `- ${s.titel}: [${s.markierungen.join(", ")}] ${[s.kommentar.trim(), s.markierungen.includes("Ausarbeiten") ? "Bitte zerlege diesen Schritt in Teilschritte." : ""].filter(Boolean).join(" ")}`),
    `Gewünschte Fassung: ${stil}`].join("\n");
}
