import { beforeEach, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { einstellungenLaden, einstellungenAendern } from "./tauri";
import { BeispielQuelle } from "./quelle";
import { chatAnlegen, chatsVerbinden } from "./chats";
import { rollenLaden, rollenSpeichern } from "./rollen";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
const rollen = { orchestrator: { modell: "Sonnet 5.5", effort: "Mittel" }, reviewer: {
  claude: { modell: "Haiku 5.5", effort: "Niedrig" }, codex: { modell: "gpt-6.1-sol", effort: "Sehr hoch" } } } as const;
beforeEach(() => { vi.resetAllMocks(); vi.mocked(isTauri).mockReturnValue(true); });
it("gibt geladene und gespeicherte Rollen des Kerns unverändert zurück", async () => {
  vi.mocked(invoke).mockResolvedValue({ rollen });
  expect((await einstellungenLaden("A")).rollen).toEqual(rollen);
  expect((await einstellungenAendern("A", { rollen })).rollen).toEqual(rollen);
  expect(invoke).toHaveBeenLastCalledWith("einstellungen_speichern", { projekt: "A", werte: { rollen } });
});
it("übernimmt nur erfolgreiche Kernantworten und verwendet sie für neue Chats", async () => {
  const quelle = new BeispielQuelle(), projekt = quelle.lesen().kopf.pfad;
  vi.mocked(invoke).mockResolvedValueOnce({ rollen }); await rollenLaden(quelle, projekt);
  const vorher = quelle.lesen().chats;
  vi.mocked(invoke).mockRejectedValueOnce("Kein Zugriff");
  await expect(rollenSpeichern(quelle, projekt, rollen)).rejects.toBe("Kein Zugriff");
  expect(quelle.lesen().rollen).toEqual(rollen);
  const bestaetigt = { ...rollen, orchestrator: { modell: "gpt-6.1-sol", effort: "Hoch" as const } };
  vi.mocked(invoke).mockResolvedValueOnce({ rollen: bestaetigt }); await rollenSpeichern(quelle, projekt, rollen);
  chatAnlegen(quelle); const daten = quelle.lesen();
  expect(daten.rollen).toEqual(bestaetigt); expect(daten.chats.slice(0, -1)).toEqual(vorher);
  expect(daten.chats.at(-1)).toMatchObject({ ...bestaetigt.orchestrator, kontextfenster: 1000000 });
});
it.each(["laden", "speichern"])("verwirft späte Antworten beim %s nach Projektwechsel", async art => {
  const quelle = new BeispielQuelle(), projekt = quelle.lesen().kopf.pfad;
  let antwort!: (wert: unknown) => void;
  vi.mocked(invoke).mockReturnValueOnce(new Promise(resolve => { antwort = resolve; }));
  const offen = art === "laden" ? rollenLaden(quelle, projekt) : rollenSpeichern(quelle, projekt, rollen);
  const daten = quelle.lesen(); daten.kopf.pfad = "B"; quelle.aktualisieren(daten);
  antwort({ rollen }); await offen;
  expect(quelle.lesen().rollen).toEqual(daten.rollen);
  chatAnlegen(quelle); expect(quelle.lesen().chats).toEqual(daten.chats);
});
it("wartet bei leerem Projekt auf Rollen, auch wenn Chats zuerst geladen sind", async () => {
  const quelle = new BeispielQuelle(), daten = quelle.lesen(); daten.kopf.geoeffnet = true; quelle.aktualisieren(daten);
  vi.mocked(invoke).mockImplementation(async cmd => cmd === "chats_laden" ? { chats: [], aktiverChatId: null } : { rollen });
  const ab = chatsVerbinden(quelle, vi.fn());
  try {
    await new Promise(resolve => setTimeout(resolve, 0)); expect(quelle.lesen().chats).toEqual([]);
    await rollenLaden(quelle, daten.kopf.pfad);
    expect(quelle.lesen().chats[0]).toMatchObject(rollen.orchestrator);
  } finally { ab?.(); }
});
it("hält Beispieländerungen nur im Speicher", async () => {
  vi.mocked(isTauri).mockReturnValue(false); const quelle = new BeispielQuelle(), projekt = quelle.lesen().kopf.pfad;
  await rollenLaden(quelle, projekt); expect(quelle.lesen().rollen.orchestrator).toEqual({ modell: "Opus 5.5", effort: "Hoch" });
  await rollenSpeichern(quelle, projekt, rollen); chatAnlegen(quelle);
  expect(quelle.lesen().chats.at(-1)).toMatchObject(rollen.orchestrator); expect(invoke).not.toHaveBeenCalled();
  expect(new BeispielQuelle().lesen().rollen.orchestrator.modell).toBe("Opus 5.5");
});
it("lädt beim Zurückwechseln erst nach einem offenen Speichervorgang", async () => {
  const quelle = new BeispielQuelle(), projekt = quelle.lesen().kopf.pfad;
  let fertig!: (wert: unknown) => void;
  vi.mocked(invoke).mockReturnValueOnce(new Promise(resolve => { fertig = resolve; })).mockResolvedValue({ rollen });
  const speichern = rollenSpeichern(quelle, projekt, rollen), laden = rollenLaden(quelle, projekt);
  await Promise.resolve(); expect(invoke).toHaveBeenCalledTimes(1);
  fertig({ rollen }); await speichern; await laden;
  expect(invoke).toHaveBeenLastCalledWith("einstellungen_laden", { projekt });
});
