const felder = {
  ziel: "ziel", hintergrund: "hintergrund", "was genau": "wasGenau",
  "fertig wenn": "fertigWenn", "nicht tun": "nichtTun",
} as const;

export function auftragAbschnitte(text: string) {
  const treffer = [...text.matchAll(/^[ \t]*#{1,3}[ \t]+(Ziel|Hintergrund|Was genau|Fertig,? wenn|Nicht tun)[ \t]*\r?$/gim)];
  if (!treffer.length) return null;
  const auftrag = { ziel: "", hintergrund: "", wasGenau: "", fertigWenn: "", nichtTun: "" };
  const gesehen = new Set<string>();
  treffer.forEach((abschnitt, i) => {
    const name = abschnitt[1].toLowerCase().replace(",", "") as keyof typeof felder;
    if (gesehen.has(name)) return;
    gesehen.add(name);
    auftrag[felder[name]] = text.slice(abschnitt.index + abschnitt[0].length, treffer[i + 1]?.index).trim();
  });
  return auftrag;
}
