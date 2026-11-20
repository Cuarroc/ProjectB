const felder = {
  ziel: "ziel", hintergrund: "hintergrund", "was genau": "wasGenau",
  "fertig wenn": "fertigWenn", "nicht tun": "nichtTun",
} as const;

export function auftragPruefen(abschnitte: readonly string[]) {
  const [ziel = "", , wasGenau = "", fertigWenn = "", nichtTun = ""] = abschnitte;
  const listenMuster = /^[ \t]*(?:[-*+•]|\d+[.)])[ \t]+/m;
  const listenpunkte = (text: string) => text.split(/\r?\n/).filter(zeile =>
    listenMuster.test(zeile) && zeile.replace(listenMuster, "").replace(/^\[[ xX]\](?:[ \t]+|$)/, "").trim(),
  ).length;
  const satz = ziel.trim().replace(/\bz\.\s*B\./gi, "zum Beispiel");
  return [
    { text: "Ziel in einem Satz", erfuellt: !listenMuster.test(ziel) && /^[^.!?]+[.!?]?$/.test(satz) && !!satz.trim() },
    { text: "Was genau als Liste", erfuellt: listenpunkte(wasGenau) >= 2 },
    { text: "Fertig, wenn prüfbar", erfuellt: listenpunkte(fertigWenn) >= 1 },
    { text: "Nicht tun ausgefüllt", erfuellt: !!nichtTun.trim() },
  ];
}

export function auftragAbschnitte(text: string) {
  const treffer = [...text.matchAll(/^[ \t]*#{1,3}[ \t]+(Ziel|Hintergrund|Was genau|Fertig,? wenn|Nicht tun)(?:[ \t]*\([^\r\n)]*\))?(?:[ \t]*:([^\r\n]*))?[ \t]*\r?$/gim)];
  if (!treffer.length) return null;
  const auftrag = { ziel: "", hintergrund: "", wasGenau: "", fertigWenn: "", nichtTun: "" };
  const gesehen = new Set<string>();
  treffer.forEach((abschnitt, i) => {
    const name = abschnitt[1].toLowerCase().replace(",", "") as keyof typeof felder;
    if (gesehen.has(name)) return;
    gesehen.add(name);
    auftrag[felder[name]] = [abschnitt[2]?.trim(), text.slice(abschnitt.index + abschnitt[0].length, treffer[i + 1]?.index).trim()].filter(Boolean).join("\n");
  });
  return auftrag;
}
