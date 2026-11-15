import { invoke, isTauri } from "@tauri-apps/api/core";
import { beispiel } from "./beispiel";
import type { Kopf } from "./typen";

export type Projekt = Pick<Kopf, "projekt" | "pfad" | "zweig">;

function beispielProjekt(pfad: string): Projekt {
  if (pfad !== beispiel.kopf.pfad) {
    throw new Error("Echte Projekte lassen sich nur in der Desktop-App prüfen und öffnen.");
  }
  const { projekt, zweig } = beispiel.kopf;
  return { projekt, pfad, zweig };
}

export async function projektPruefen(pfad: string): Promise<Projekt> {
  return isTauri() ? invoke<Projekt>("projekt_pruefen", { pfad }) : beispielProjekt(pfad);
}

export async function projektOeffnen(pfad: string): Promise<Projekt> {
  return isTauri() ? invoke<Projekt>("projekt_oeffnen", { pfad }) : beispielProjekt(pfad);
}

export async function projekteZuletzt(): Promise<string[]> {
  return isTauri() ? invoke<string[]>("projekte_zuletzt") : [...beispiel.kopf.projekte];
}
