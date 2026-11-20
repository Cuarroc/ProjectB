import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beispiel, modusEinstellungen } from "./beispiel";
import type { Agent, Berechtigungsstufe, Chat, Datenstand, Kontingent, Kopf, Rollen } from "./typen";

type TeamAuftrag = Pick<Agent, "name" | "anbieter" | "modell" | "effort"> & { text: string };
export type AnhalteBericht = {
  ordner: { ordner: string; status: "gesichert" | "sauber" | "fehler"; sha?: string; meldung?: string }[];
  lauffehler: { pid: number; meldung: string }[]; fristUeberschritten: boolean;
};
let teamLaeuft = false;
let teamAnzahl = 0;
const laufAbos = new Set<() => void>();
export const teamLauf = {
  neu: false,
  get anzahl() { return teamAnzahl; },
  set anzahl(wert: number) { teamAnzahl = wert; for (const abo of laufAbos) abo(); },
  anzahlLesen: () => teamAnzahl,
  get laeuft() { return teamLaeuft; },
  set laeuft(wert: boolean) { teamLaeuft = wert; for (const abo of laufAbos) abo(); },
  lesen: () => teamLaeuft,
  abonnieren: (abo: () => void) => { laufAbos.add(abo); return () => { laufAbos.delete(abo); }; },
};
export async function teamStarten(pfad: string, auftraege: TeamAuftrag[]): Promise<void> {
  if (!isTauri()) return;
  if (teamLauf.laeuft) throw new Error("Das letzte Team läuft noch oder ist nicht gesichert.");
  teamLauf.neu = true;
  try { await invoke("team_starten", { pfad, auftraege }); }
  catch (e) { teamLauf.neu = false; throw e; }
}
export async function teamAnhalten(name?: string): Promise<AnhalteBericht | undefined> {
  if (isTauri()) return invoke<AnhalteBericht>("team_anhalten", name === undefined ? {} : { name });
}
export async function teamAgentHoeren(cb: (agent: Agent) => void): Promise<() => void> {
  return isTauri() ? listen<string>("team-agent", ({ payload }) => cb(JSON.parse(payload))) : () => {};
}

export type Chats = Pick<Datenstand, "chats" | "aktiverChatId">;
export async function anhangSpeichern(pfad: string, datei: File): Promise<string> {
  return isTauri() ? invoke<string>("anhang_speichern", { pfad, name: datei.name, inhalt: Array.from(new Uint8Array(await datei.arrayBuffer())) })
    : `.projectb/anhaenge/${crypto.randomUUID()}-${datei.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}
export async function chatsLaden(projekt: string): Promise<Chats | undefined> {
  if (isTauri()) return invoke<Chats>("chats_laden", { projekt });
}
export async function chatsSpeichern(projekt: string, daten: Chats): Promise<void> {
  if (isTauri()) await invoke("chats_speichern", { projekt, daten });
}

export async function auftragSenden(auftrag: { chat: string; pfad: string; modell: string; effort: Chat["effort"]; modus: Chat["modus"]; sitzung: NonNullable<Chat["sitzung"]> | null; text: string }): Promise<{ sitzung: NonNullable<Chat["sitzung"]> | null; erfolg: boolean }> {
  if (!isTauri()) throw new Error("Echte Aufträge gehen nur in der Desktop-App.");
  return invoke("auftrag_senden", auftrag);
}

export async function chatNachrichtenHoeren(cb: (chat: string, text: string) => void): Promise<() => void> {
  return isTauri() ? listen<{ chat: string; text: string }>("chat-nachricht", ({ payload }) => cb(payload.chat, payload.text)) : () => {};
}

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

export async function kontingentLesen(): Promise<Kontingent> {
  return isTauri() ? invoke<Kontingent>("kontingent") : beispiel.kopf.kontingent;
}

const felder = {
  Ausführen: [["agentenGleichzeitig", ["einer", "bisZu3", "bisZu5"]], ["pruefungDurch", ["andereModellfamilie", "gleicheFamilie"]], ["pruefrundenHoechstens", ["eins", "zwei", "drei"]]],
  Planen: [["plan", ["kurz", "normal", "ausfuehrlich"]], ["dauerUndTokensSchaetzen", ["an", "aus"]], ["beiUnklaremNachfragen", ["an", "aus"]]],
  "Prompt bauen": [["laenge", ["kurz", "mittel", "ausfuehrlich"]], ["auftragFuer", ["orchestrator", "codex", "claude"]], ["abnahmePunkteErgaenzen", ["an", "aus"]]],
} as const;
type Kernwerte = { rollen?: Rollen; ausfuehren?: Record<string, string>; planen?: Record<string, string>; prompt_bauen?: Record<string, string>; berechtigung?: Berechtigungsstufe };
const modusSchluessel = (modus: string) => modus === "Ausführen" ? "ausfuehren" : modus === "Prompt bauen" ? "prompt_bauen" : "planen";
function anzeigen(daten: Kernwerte): Record<string, string[]> {
  return Object.fromEntries(Object.entries(felder).map(([modus, zeilen]) => [modus, zeilen.map(([feld, texte], i) => {
    const z = modusEinstellungen[modus as keyof typeof modusEinstellungen][i];
    return z.werte[(texte as readonly string[]).indexOf(daten[modusSchluessel(modus)]?.[feld] ?? "")] ?? z.empfohlen;
  })]));
}
export function einstellungenAenderung(modus: string, werte: string[], index?: number): Kernwerte {
  const zeilen = modusEinstellungen[modus as keyof typeof modusEinstellungen];
  return { [modusSchluessel(modus)]: Object.fromEntries(felder[modus as keyof typeof felder]
    .flatMap(([feld, texte], i) => index !== undefined && index !== i ? [] : [[feld, texte[(zeilen[i].werte as readonly string[]).indexOf(werte[i])]]])) };
}
export async function einstellungenLaden(projekt: string) {
  const daten = await invoke<Kernwerte>("einstellungen_laden", { projekt });
  return { werte: anzeigen(daten), berechtigung: daten.berechtigung ?? "Nur bei Wichtigem", rollen: daten.rollen ?? structuredClone(beispiel.rollen) };
}
export async function einstellungenAendern(projekt: string, werte: Kernwerte) {
  const daten = await invoke<Kernwerte>("einstellungen_speichern", { projekt, werte });
  return { werte: anzeigen(daten), berechtigung: daten.berechtigung ?? "Nur bei Wichtigem", rollen: daten.rollen ?? structuredClone(beispiel.rollen) };
}

export async function teamDateiAnsehen(name: string, pfad: string): Promise<string> {
  if (!isTauri()) throw new Error("Ansehen geht nur in der App.");
  return invoke<string>("team_datei_ansehen", { name, pfad });
}

export async function prOeffnen(url: string): Promise<void> {
  await invoke("pr_oeffnen", { url });
}
