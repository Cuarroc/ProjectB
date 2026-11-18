import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { modusEinstellungen } from "./beispiel";
import { einstellungenAenderung, einstellungenAendern } from "./tauri";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
it.each([
  ["Ausführen", 0, "agentenGleichzeitig", ["einer", "bisZu3", "bisZu5"]],
  ["Ausführen", 1, "pruefungDurch", ["andereModellfamilie", "gleicheFamilie"]],
  ["Ausführen", 2, "pruefrundenHoechstens", ["eins", "zwei", "drei"]],
  ["Planen", 0, "plan", ["kurz", "normal", "ausfuehrlich"]],
  ["Planen", 1, "dauerUndTokensSchaetzen", ["an", "aus"]],
  ["Planen", 2, "beiUnklaremNachfragen", ["an", "aus"]],
] as const)("übersetzt %s.%s in Kerntexte und zurück", async (modus, i, feld, texte) => {
  const zeilen = modusEinstellungen[modus];
  for (const [n, wert] of zeilen[i].werte.entries()) {
    const anzeige = zeilen.map(z => z.empfohlen as string); anzeige[i] = wert;
    const delta = einstellungenAenderung(modus, anzeige, i);
    expect(delta).toEqual({ [modus === "Ausführen" ? "ausfuehren" : "planen"]: { [feld]: texte[n] } });
    vi.mocked(invoke).mockResolvedValueOnce(delta);
    expect((await einstellungenAendern("Projekt", delta)).werte[modus]).toEqual(anzeige);
  }
});
