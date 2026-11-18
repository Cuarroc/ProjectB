import { expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { stufeLaden, stufeSpeichern } from "./Berechtigungen";
import { BeispielQuelle } from "../daten/quelle";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
it("lädt die Projektstufe und ändert sie erst nach erfolgreichem Speichern", async () => {
  const quelle = new BeispielQuelle(), projekt = quelle.lesen().kopf.pfad;
  vi.mocked(invoke).mockResolvedValueOnce({ berechtigung: "Vorsichtig" });
  await stufeLaden(quelle, projekt);
  expect(quelle.lesen().berechtigungen.aktuell).toBe("Vorsichtig");
  expect(invoke).toHaveBeenLastCalledWith("einstellungen_laden", { projekt });
  vi.mocked(invoke).mockRejectedValueOnce("Kein Zugriff");
  await expect(stufeSpeichern(quelle, projekt, "Autonom")).rejects.toBe("Kein Zugriff");
  expect(quelle.lesen().berechtigungen.aktuell).toBe("Vorsichtig");
  vi.mocked(invoke).mockResolvedValueOnce({ berechtigung: "Autonom" });
  await stufeSpeichern(quelle, projekt, "Autonom");
  expect(quelle.lesen().berechtigungen.aktuell).toBe("Autonom");
  expect(invoke).toHaveBeenLastCalledWith("einstellungen_speichern", { projekt, werte: { berechtigung: "Autonom" } });
});
it("ignoriert eine verspätete Antwort nach Projektwechsel", async () => {
  const quelle = new BeispielQuelle(), projekt = quelle.lesen().kopf.pfad;
  let antwort!: (wert: unknown) => void;
  vi.mocked(invoke).mockReturnValueOnce(new Promise(resolve => { antwort = resolve; }));
  const laden = stufeLaden(quelle, projekt);
  const daten = quelle.lesen(); daten.kopf.pfad = "anderes-projekt"; quelle.aktualisieren(daten);
  antwort({ berechtigung: "Autonom" }); await laden;
  expect(quelle.lesen().berechtigungen.aktuell).toBe("Nur bei Wichtigem");
});
