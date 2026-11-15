import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beispiel } from "./beispiel";
import { auftragSenden, chatNachrichtenHoeren, projektOeffnen, projektPruefen, projekteZuletzt } from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => false) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("Projektbrücke", () => {
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

const auftrag = { chat: "chat-1", pfad: "D:\\Mein Projekt", modell: "gpt-6.1-sol", effort: "Sehr hoch" as const, sitzung: { id: "s-0", anbieter: "Codex" as const, pfad: "D:\\Mein Projekt" }, text: "Baue CSV" };
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
