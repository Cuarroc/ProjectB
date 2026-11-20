import { expect, it } from "vitest";
import { auftragAbschnitte } from "./promptAuftrag";

const erwartet = {
  ziel: "CSV exportieren.", hintergrund: "Daten liegen vor.",
  wasGenau: "- Export ergänzen\n- Umlaute erhalten", fertigWenn: "- [ ] CSV stimmt", nichtTun: "Keine neue Abhängigkeit.",
};
const abschnitte = ["Ziel", "Hintergrund", "Was genau", "Fertig, wenn", "Nicht tun"];
const inhalte = Object.values(erwartet);

it("liest alle fünf Abschnitte und erhält Markdown-Listen", () => {
  const text = abschnitte.map((titel, i) => `## ${titel}\n${inhalte[i]}`).join("\n\n");
  expect(auftragAbschnitte(text)).toEqual(erwartet);
});

it.each([" (Zusatz)", ": Zusatz", " (Zusatz): Hinweis"])("liest alle fünf Abschnitte mit Zusatz %j", zusatz => {
  const text = abschnitte.map((titel, i) => `## ${titel}${zusatz}\r\n${inhalte[i]}`).join("\r\n\r\n");
  expect(auftragAbschnitte(text)).toEqual(Object.fromEntries(Object.entries(erwartet).map(([k, v]) => [k, zusatz.includes(":") ? `${zusatz.split(":")[1].trim()}\n${v}` : v])));
});

it.each(["#", "##", "###"])("erlaubt %s, andere Schreibweise, Leerraum und CRLF", raute => {
  const text = abschnitte.map((titel, i) =>
    ` ${raute}\t${titel.toUpperCase().replace(",", "")}  \r\n\r\n ${inhalte[i]} \r\n`,
  ).join("\r\n");
  expect(auftragAbschnitte(`Vorbemerkung wird verworfen.\r\n\r\n${text}`)).toEqual(erwartet);
});

it("lässt fehlende und leere Abschnitte leer", () => {
  expect(auftragAbschnitte("## Ziel\n\n## Was genau\n- Export ergänzen")).toEqual({
    ziel: "", hintergrund: "", wasGenau: "- Export ergänzen", fertigWenn: "", nichtTun: "",
  });
});

it.each(["", "Welches Format brauchst du?\n\n- CSV\n- JSON", "#### Ziel\nKein erlaubter Abschnitt.",
  "## Zielsetzung\nKein erlaubter Abschnitt.", "## Ziel (offen\nKein erlaubter Abschnitt."])(
  "liefert ohne Abschnitt null: %j", text => expect(auftragAbschnitte(text)).toBeNull(),
);

it.each(["Erstes Ziel.", ""])("behält bei doppelter Überschrift den ersten Inhalt: %j", ziel => {
  expect(auftragAbschnitte(`## Ziel\n${ziel}\n## ZIEL\nZweites Ziel.\n## Nicht tun\nNichts löschen.`)).toEqual({
    ziel, hintergrund: "", wasGenau: "", fertigWenn: "", nichtTun: "Nichts löschen.",
  });
});

it("erhält den Inhalt hinter dem Doppelpunkt", () => {
  expect(auftragAbschnitte("## Ziel: Text\nFortsetzung")?.ziel).toBe("Text\nFortsetzung");
});
