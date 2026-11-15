import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { beispiel } from "./beispiel";
import { projektOeffnen, projektPruefen, projekteZuletzt } from "./tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => false) }));
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
