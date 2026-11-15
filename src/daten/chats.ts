import { isTauri } from "@tauri-apps/api/core";
import { beispiel } from "./beispiel";
import type { Chat } from "./typen";
import type { BeispielQuelle } from "./quelle";
import { chatsLaden, chatsSpeichern } from "./tauri";

export function neuerChat(): Chat {
  return { ...beispiel.chats[0], id: crypto.randomUUID(), titel: "Neuer Chat", modus: "Ausführen",
    verlauf: [], sitzung: null, gestartetUm: null, kontextProzent: 0 };
}

export function chatsVerbinden(quelle: BeispielQuelle, melden: (text: string) => void) {
  if (!isTauri()) return;
  type Stand = { pfad: string; geladen: boolean; zuletzt: string; kette: Promise<unknown> };
  const projekte = new Map<string, Stand>();
  let aktuell: Stand | undefined;
  const fehler = (stand: Stand, art: string, e: unknown) => {
    const grund = e instanceof Error ? e.message : String(e), titel = `Chats konnten nicht ${art} werden: `;
    if (aktuell === stand) melden(grund.startsWith(titel) ? grund : titel + grund);
  };
  const lesen = () => {
    const daten = quelle.lesen(), pfad = daten.kopf.geoeffnet ? daten.kopf.pfad : undefined;
    if (pfad !== aktuell?.pfad) {
      aktuell = undefined; melden("");
      if (pfad === undefined) return;
      const stand: Stand = { pfad, geladen: false, zuletzt: "", kette: projekte.get(pfad)?.kette ?? Promise.resolve() };
      aktuell = stand; projekte.set(pfad, stand);
      // Alte Projekt-Chats dürfen während des Ladens keine neuen Aufträge erhalten.
      quelle.aktualisieren({ ...daten, chats: [], aktiverChatId: null });
      stand.kette = stand.kette.then(() => chatsLaden(pfad)).then(geladen => {
        if (aktuell !== stand) return;
        if (!geladen || !Array.isArray(geladen.chats) || !(geladen.aktiverChatId === null || typeof geladen.aktiverChatId === "string")) throw new Error("Ungültiges Chat-Format");
        stand.zuletzt = JSON.stringify({ chats: geladen.chats, aktiverChatId: geladen.aktiverChatId });
        if (!geladen.chats.length) {
          const chat = neuerChat(); geladen = { chats: [chat], aktiverChatId: chat.id };
        }
        stand.geladen = true;
        quelle.aktualisieren({ ...quelle.lesen(), chats: geladen.chats, aktiverChatId: geladen.aktiverChatId });
      }).catch(e => fehler(stand, "geladen", e));
      return;
    }
    const stand = aktuell;
    if (!stand?.geladen) return;
    const chats = { chats: daten.chats, aktiverChatId: daten.aktiverChatId }, vergleich = JSON.stringify(chats);
    if (vergleich === stand.zuletzt) return;
    stand.zuletzt = vergleich;
    stand.kette = stand.kette.then(() => chatsSpeichern(stand.pfad, chats)).then(() => {
      if (aktuell === stand) melden("");
    }).catch(e => fehler(stand, "gespeichert", e));
  };
  const ab = quelle.abonnieren(lesen); lesen();
  return () => { ab(); aktuell = undefined; };
}
