import { isTauri } from "@tauri-apps/api/core";
import { einstellungenLaden, einstellungenAendern } from "./tauri";
import { beispiel } from "./beispiel";
import type { BeispielQuelle } from "./quelle";
import type { Rollen } from "./typen";

const speichert = new Map<string, Promise<unknown>>();

export async function rollenLaden(quelle: BeispielQuelle, projekt: string, aktiv = () => true) {
  if (!isTauri()) return;
  await speichert.get(projekt);
  try {
    const { rollen } = await einstellungenLaden(projekt), daten = quelle.lesen();
    if (aktiv() && daten.kopf.pfad === projekt) quelle.aktualisieren({ ...daten, rollen, rollenPfad: projekt });
  } catch (e) {
    const daten = quelle.lesen();
    if (aktiv() && daten.kopf.pfad === projekt) quelle.aktualisieren({ ...daten, rollen: beispiel.rollen, rollenPfad: projekt });
    throw e;
  }
}
export async function rollenSpeichern(quelle: BeispielQuelle, projekt: string, wahl: Rollen, aktiv = () => true) {
  const antwort = isTauri() ? einstellungenAendern(projekt, { rollen: wahl }) : Promise.resolve({ rollen: wahl });
  const fertig = antwort.catch(() => {}); speichert.set(projekt, fertig);
  try {
    const { rollen } = await antwort, daten = quelle.lesen();
    if (aktiv() && daten.kopf.pfad === projekt) quelle.aktualisieren({ ...daten, rollen, rollenPfad: projekt });
  } finally { if (speichert.get(projekt) === fertig) speichert.delete(projekt); }
}
