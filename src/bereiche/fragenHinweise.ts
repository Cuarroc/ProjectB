import type { Datenquelle } from "../daten/quelle";
import type { Frage } from "../daten/typen";

export type FragenMeldung = { melden: (frage: Frage) => void; ton: () => void };
export function leiserTon(Audio = AudioContext) {
  const audio = new Audio(), welle = audio.createOscillator(), lautstaerke = audio.createGain(), jetzt = audio.currentTime;
  welle.frequency.value = 660;
  lautstaerke.gain.setValueAtTime(0, jetzt);
  lautstaerke.gain.linearRampToValueAtTime(0.025, jetzt + 0.02);
  lautstaerke.gain.linearRampToValueAtTime(0, jetzt + 0.18);
  welle.connect(lautstaerke); lautstaerke.connect(audio.destination);
  welle.onended = () => { void audio.close(); };
  welle.start(); welle.stop(jetzt + 0.2);
}
// Ohne freigegebenes Tauri-Benachrichtigungsplugin bleibt die Ausgabe austauschbar.
export const fragenMeldung: FragenMeldung = { melden: () => {}, ton: () => { if ("__TAURI_INTERNALS__" in window) leiserTon(); } };
let tonAn = true;
export const frageTon = { lesen: () => tonAn, setzen: (wert: boolean) => { tonAn = wert; } };
export function beobachteFragen(quelle: Datenquelle, ausgabe = fragenMeldung, fokus = () => document.hasFocus()) {
  const bekannt = new Set(quelle.lesen().fragen.map(f => f.id));
  return quelle.abonnieren(() => {
    for (const frage of quelle.lesen().fragen) {
      if (bekannt.has(frage.id)) continue;
      bekannt.add(frage.id);
      if (fokus()) continue;
      ausgabe.melden(frage);
      if (frageTon.lesen()) ausgabe.ton();
    }
  });
}
