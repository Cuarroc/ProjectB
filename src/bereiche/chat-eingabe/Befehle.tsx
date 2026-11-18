import { useState, useSyncExternalStore, type ReactNode, type TextareaHTMLAttributes } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { ListChecks, MessageSquarePlus, MessagesSquare, OctagonPause } from "lucide-react";
import { teamLauf } from "../../daten/tauri";
import { useAnhalten } from "../anhalten";

const befehle = [
  { name: "neu", text: "Neuen Chat beginnen", Symbol: MessageSquarePlus },
  { name: "planen", text: "Zum Modus Planen wechseln", Symbol: ListChecks },
  { name: "interview", text: "Zum Modus Interview wechseln", Symbol: MessagesSquare },
  { name: "anhalten", text: "Alle Agenten anhalten", Symbol: OctagonPause },
];
export function Befehle({ text, anzahl = 0, neuGesperrt = false, ausfuehren, children }: {
  text: string; anzahl?: number; neuGesperrt?: boolean; ausfuehren: (name: string) => void;
  children: (feld: TextareaHTMLAttributes<HTMLTextAreaElement>, abfangen: (text: string) => boolean, fehler: string) => ReactNode;
}) {
  const [geschlossen, schliessen] = useState(false), [index, waehlen] = useState(0);
  const [fehler, melden] = useState("");
  const echt = useSyncExternalStore(teamLauf.abonnieren, teamLauf.anzahlLesen, teamLauf.anzahlLesen), pause = useAnhalten();
  const laufend = isTauri() ? echt : pause ? 0 : anzahl;
  const liste = befehle.filter(b => b.name.startsWith(text.slice(1).toLowerCase()));
  const offen = /^\/\S*$/.test(text) && !geschlossen;
  const gesperrt = (name: string) => (name === "neu" && neuGesperrt) || (name === "anhalten" && !laufend);
  const aktiv = liste[Math.min(index, liste.length - 1)];
  const auswahl = (inhalt: string) => {
    const befehl = befehle.find(b => `/${b.name}` === inhalt.trim().toLowerCase());
    if (!befehl) return false;
    if (gesperrt(befehl.name)) melden(befehl.name === "neu" ? "Rollen laden …" : "Kein Agent läuft.");
    else { melden(""); ausfuehren(befehl.name); schliessen(true); }
    return true;
  };
  const aktivId = offen && aktiv && !gesperrt(aktiv.name) ? `befehl-${aktiv.name}` : undefined;
  return <div className="ein-befehle-anker">
    {offen && <div className="ein-menue ein-befehle">
      <header><b>Befehle</b><span>{liste.length}</span></header>
      <div id="befehle" role="listbox" aria-label="Befehle">
        {liste.map(({ name, text, Symbol }) => <button key={name} id={`befehl-${name}`} type="button" role="option" tabIndex={-1}
          aria-selected={aktiv?.name === name} disabled={gesperrt(name)} onMouseDown={e => e.preventDefault()} onClick={() => auswahl(`/${name}`)}>
          <span className="ein-befehl-symbol"><Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span>
          <span><code>/{name}</code><small>{text}</small></span>
          {name === "anhalten" && <small>{laufend ? `${laufend} laufen` : "Kein Agent läuft"}</small>}
          {name === "neu" && neuGesperrt && <small>Rollen laden …</small>}
        </button>)}
      </div>
      {!liste.length && <p role="status">Kein Befehl gefunden</p>}
      <footer><kbd>↑</kbd> <kbd>↓</kbd> Wählen <kbd>Enter</kbd> Ausführen <kbd>Esc</kbd> Schließen</footer>
    </div>}
    {children({ "aria-autocomplete": "list", "aria-controls": offen ? "befehle" : undefined, "aria-activedescendant": aktivId,
      onChange: () => { schliessen(false); waehlen(0); melden(""); }, onBlur: () => schliessen(true),
      onKeyDown: e => {
        if (!offen || e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); schliessen(true); }
        if (["ArrowDown", "ArrowUp"].includes(e.key) && liste.length) {
          e.preventDefault(); const richtung = e.key === "ArrowDown" ? 1 : -1;
          for (let n = 1; n <= liste.length; n++) { const i = (Math.min(index, liste.length - 1) + richtung * n + liste.length) % liste.length;
            if (!gesperrt(liste[i].name)) { waehlen(i); break; } }
        }
        if (e.key === "Enter" && !e.shiftKey && aktiv) { e.preventDefault(); auswahl(`/${aktiv.name}`); }
      },
    }, auswahl, fehler)}
  </div>;
}
