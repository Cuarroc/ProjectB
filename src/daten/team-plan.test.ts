import { expect, it } from "vitest";
import { antwortPlan } from "./plan";
import { teamAuftraege } from "./team-plan";

const chat = { modell: "gpt-6.1-sol", effort: "Hoch" as const };
const plan = (...titel: string[]) => ({ ...antwortPlan("- [ ] Platzhalter", "p")!, schritte: titel.map(titel => ({
  ...antwortPlan("- [ ] Platzhalter", "p")!.schritte[0], titel,
})) });
it.each([
  [["--ÄÖÜ ß!? / CSV_42"], ["aeoeue-ss-csv-42"]],
  [["x".repeat(40), "x".repeat(40), "x".repeat(40)], ["x".repeat(30), `${"x".repeat(28)}-2`, `${"x".repeat(28)}-3`]],
  [["CSV", "CSV", "csv-2"], ["csv", "csv-2", "csv-2-2"]],
  [["", "!?", "---"], ["schritt-1", "schritt-2", "schritt-3"]],
])("bildet eindeutige Git-Namen aus %j", (titel, namen) => {
  expect(teamAuftraege(plan(...titel), chat).map(a => a.name)).toEqual(namen);
});
it.each([0, 1, 2, 3, 4, 7])("verteilt %i Schritte vollständig auf höchstens drei Agenten", anzahl => {
  const auftraege = teamAuftraege(plan(...Array.from({ length: anzahl }, (_, i) => `Schritt ${i + 1}`)), chat);
  expect(auftraege).toHaveLength(Math.min(3, anzahl));
  auftraege.forEach((a, i) => {
    expect(a).toMatchObject({ anbieter: "Codex", ...chat });
    for (let j = 0; j < anzahl; j++) expect(a.text.includes(`Schritt ${j + 1}\n`)).toBe(j % 3 === i);
  });
  expect(teamAuftraege(plan("A"), { ...chat, modell: "Sonnet 5.5" })[0].anbieter).toBe("Claude");
});
