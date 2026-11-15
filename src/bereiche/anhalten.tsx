import { useSyncExternalStore } from "react";
import { OctagonPause, Play } from "lucide-react";
import { Knopf } from "../bausteine/Knopf";
import "./anhalten.css";

let angehalten = false;
const abos = new Set<() => void>();
export const allesAnhalten = {
  lesen: () => angehalten,
  abonnieren: (abo: () => void) => { abos.add(abo); return () => { abos.delete(abo); }; },
  setzen: (wert: boolean) => { angehalten = wert; for (const abo of abos) abo(); },
};
export const useAnhalten = () => useSyncExternalStore(allesAnhalten.abonnieren, allesAnhalten.lesen, allesAnhalten.lesen);
export function AnhalteMarke() { return <span className="mk pause-marke"><OctagonPause size={12} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />Angehalten</span>; }
export function AnhalteKnopf({ pause }: { pause: boolean }) {
  return <Knopf text={pause ? "Weitermachen" : "Alles anhalten"} symbol={pause ? Play : OctagonPause}
    aria-pressed={pause} onClick={() => allesAnhalten.setzen(!pause)} />;
}
export function AnhalteHinweis({ pause }: { pause: boolean }) {
  return pause ? <div className="anhalte-hinweis" role="status"><AnhalteMarke /><AnhalteKnopf pause /></div> : null;
}
