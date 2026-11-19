import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beispiel } from "./beispiel";
import { auftragSenden, chatNachrichtenHoeren, projektOeffnen, projektPruefen, projekteZuletzt } from "./tauri";
import { teamStarten, teamAnhalten, teamAgentHoeren, teamDateiAnsehen, teamLauf } from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => false) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("Projektbrücke", () => {
  it("lädt beim nächsten Aufruf neue, gelöschte und umbenannte Dateien frisch", async () => {
    const { projektDateien } = await import("./tauri"); vi.mocked(isTauri).mockReturnValue(true); vi.mocked(invoke).mockResolvedValueOnce(["alt.rs", "weg.rs"]).mockResolvedValueOnce(["umbenannt.rs", "neu.rs"]);
    for (const liste of [["alt.rs", "weg.rs"], ["umbenannt.rs", "neu.rs"]]) await expect(projektDateien("/repo")).resolves.toEqual(liste);
  });
  it("liefert ohne Tauri Beispieldaten und weist echte Pfade klar zurück", async () => {
    const { projekt, pfad, zweig } = beispiel.kopf;
    await expect(projektPruefen(pfad)).resolves.toEqual({ projekt, pfad, zweig });
    await expect(projektOeffnen(pfad)).resolves.toEqual({ projekt, pfad, zweig });
    const liste = await projekteZuletzt();
    expect(liste).toEqual(beispiel.kopf.projekte);
    liste.pop();
    expect(await projekteZuletzt()).toEqual(beispiel.kopf.projekte);
    for (const aufruf of [projektPruefen, projektOeffnen]) {
      await expect(aufruf("/echtes/repo")).rejects.toThrow("nur in der Desktop-App");
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("ruft unter Tauri die drei Commands mit unverändertem Pfad auf", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const projekt = { projekt: "Repo", pfad: "/repo", zweig: "main" };
    vi.mocked(invoke).mockResolvedValueOnce(projekt).mockResolvedValueOnce(projekt)
      .mockResolvedValueOnce([projekt.pfad]);
    await expect(projektPruefen("/repo/unter ordner")).resolves.toEqual(projekt);
    await expect(projektOeffnen("/repo/unter ordner")).resolves.toEqual(projekt);
    await expect(projekteZuletzt()).resolves.toEqual([projekt.pfad]);
    expect(vi.mocked(invoke).mock.calls).toEqual([
      ["projekt_pruefen", { pfad: "/repo/unter ordner" }],
      ["projekt_oeffnen", { pfad: "/repo/unter ordner" }], ["projekte_zuletzt"],
    ]);
    vi.mocked(invoke).mockRejectedValueOnce("Ordner fehlt");
    await expect(projektOeffnen("/fehlt")).rejects.toBe("Ordner fehlt");
  });
});

const auftrag = { chat: "chat-1", pfad: "D:\\Mein Projekt", modell: "gpt-6.1-sol", effort: "Sehr hoch" as const, modus: "Ausführen" as const, sitzung: { id: "s-0", anbieter: "Codex" as const, pfad: "D:\\Mein Projekt" }, text: "Baue CSV" };
it("sendet genau die Auftragsfelder an den Desktop-Command", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValue({ sitzung: { id: "s-1", anbieter: "Codex", pfad: auftrag.pfad }, erfolg: true });
  await expect(auftragSenden(auftrag)).resolves.toEqual({ sitzung: { id: "s-1", anbieter: "Codex", pfad: auftrag.pfad }, erfolg: true });
  expect(invoke).toHaveBeenCalledExactlyOnceWith("auftrag_senden", auftrag);
});
it("abonniert chat-nachricht und reicht die Nutzdaten und das Abmelden weiter", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const cb = vi.fn(), abmelden = vi.fn(); vi.mocked(listen).mockResolvedValue(abmelden);
  expect(await chatNachrichtenHoeren(cb)).toBe(abmelden);
  expect(listen).toHaveBeenCalledExactlyOnceWith("chat-nachricht", expect.any(Function));
  vi.mocked(listen).mock.calls[0][1]({ event: "chat-nachricht", id: 1, payload: { chat: "chat-1", text: "Antwort" } });
  expect(cb).toHaveBeenCalledExactlyOnceWith("chat-1", "Antwort");
});
it("weist Browseraufträge zurück und liefert dort ein leeres Abmelden", async () => {
  await expect(auftragSenden(auftrag)).rejects.toThrow("Echte Aufträge gehen nur in der Desktop-App.");
  (await chatNachrichtenHoeren(vi.fn()))();
  expect(invoke).not.toHaveBeenCalled(); expect(listen).not.toHaveBeenCalled();
});

it("sendet Teamaufträge und beide Anhaltevarianten unverändert", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const auftraege = [{ name: "Kern", anbieter: "Codex" as const, modell: "gpt-6.1-sol", effort: "Hoch" as const, text: "Prüfe CSV" }];
  const bericht = { ordner: [{ ordner: "/repo/kern", status: "sauber" }], lauffehler: [], fristUeberschritten: false };
  await teamStarten("/repo", auftraege);
  vi.mocked(invoke).mockResolvedValue(bericht);
  expect(await teamAnhalten("Kern")).toBe(bericht); expect(await teamAnhalten()).toBe(bericht);
  expect(vi.mocked(invoke).mock.calls).toEqual([
    ["team_starten", { pfad: "/repo", auftraege }], ["team_anhalten", { name: "Kern" }], ["team_anhalten", {}],
  ]);
  vi.mocked(invoke).mockRejectedValueOnce("Stoppen fehlgeschlagen");
  await expect(teamAnhalten()).rejects.toBe("Stoppen fehlgeschlagen");
});
it("liest den ganzen Agenten aus dem JSON-String und gibt das Abmelden zurück", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const cb = vi.fn(), abmelden = vi.fn(), agent = { ...beispiel.agenten[0], name: "Echter Kern" };
  vi.mocked(listen).mockResolvedValue(abmelden);
  expect(await teamAgentHoeren(cb)).toBe(abmelden);
  expect(listen).toHaveBeenCalledExactlyOnceWith("team-agent", expect.any(Function));
  vi.mocked(listen).mock.calls[0][1]({ event: "team-agent", id: 1, payload: JSON.stringify(agent) });
  expect(cb).toHaveBeenCalledExactlyOnceWith(agent);
});
it("setzt das Startsignal vor invoke und nimmt es bei Fehler zurück", async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockImplementationOnce(async () => {
    expect(teamLauf.neu).toBe(true); throw "Start fehlgeschlagen";
  });
  await expect(teamStarten("/repo", [])).rejects.toBe("Start fehlgeschlagen");
  expect(teamLauf.neu).toBe(false);
  vi.mocked(isTauri).mockReturnValue(false); await teamStarten("/repo", []);
  expect(teamLauf.neu).toBe(false);
});
it("lässt Teamfunktionen ohne Tauri harmlos", async () => {
  await expect(teamStarten("/repo", [])).resolves.toBeUndefined();
  await expect(teamAnhalten()).resolves.toBeUndefined();
  (await teamAgentHoeren(vi.fn()))();
  expect(invoke).not.toHaveBeenCalled(); expect(listen).not.toHaveBeenCalled();
});

it("weist Ansehen ohne Tauri mit klarem Hinweis zurück", async () => {
  await expect(teamDateiAnsehen("Kern", "src/csv.rs")).rejects.toThrow("Ansehen geht nur in der App.");
  expect(invoke).not.toHaveBeenCalled();
});
it.each(["+neu\n-alt", "Binärdatei, keine Vorschau.", "+neu\n… gekürzt"])("reicht die Dateivorschau unverändert weiter: %s", async inhalt => {
  vi.mocked(isTauri).mockReturnValue(true); vi.mocked(invoke).mockResolvedValueOnce(inhalt);
  await expect(teamDateiAnsehen("CSV-Kern", "src/mit leerzeichen.rs")).resolves.toBe(inhalt);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("team_datei_ansehen", { name: "CSV-Kern", pfad: "src/mit leerzeichen.rs" });
});
it("reicht Kernfehler beim Ansehen unverändert weiter", async () => {
  vi.mocked(isTauri).mockReturnValue(true); vi.mocked(invoke).mockRejectedValueOnce("Datei gehört nicht zu diesem Agenten");
  await expect(teamDateiAnsehen("Kern", "fremd.rs")).rejects.toBe("Datei gehört nicht zu diesem Agenten");
});
