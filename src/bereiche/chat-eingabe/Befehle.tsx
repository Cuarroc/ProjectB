import { useState, useSyncExternalStore, type ReactNode, type TextareaHTMLAttributes } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { FileText, Users, ListChecks, MessageSquarePlus, MessagesSquare, Minimize2, OctagonPause } from "lucide-react";
import { teamLauf } from "../../daten/tauri";
import type { Agent, Chat } from "../../daten/typen";
import { useAnhalten } from "../anhalten";
import { bezugAmCursor, bezugEinfuegen, bezugMuster } from "./Bezuege";
import { Statusmarke } from "../../bausteine/Statusmarke";

export const kompaktSperrgrund = (chat: Chat, laeuft: boolean, projektOffen: boolean) => !isTauri()
  ? "Nur in der Desktop-App" : laeuft || !!chat.gestartetUm
  ? "Dieser Chat läuft bereits. Bitte warte auf die Antwort." : !chat.verlauf.some(n => n.von === "Orchestrator")
    ? "Noch nichts zusammenzufassen" : !projektOffen ? "Bitte zuerst oben ein Projekt öffnen." : "";

const befehle = [
  { name: "kompakt", text: "Verlauf zusammenfassen, Kontext wird frei", Symbol: Minimize2 },
  { name: "neu", text: "Neuen Chat beginnen", Symbol: MessageSquarePlus },
  { name: "planen", text: "Zum Modus Planen wechseln", Symbol: ListChecks },
  { name: "interview", text: "Zum Modus Interview wechseln", Symbol: MessagesSquare },
  { name: "anhalten", text: "Alle Agenten anhalten", Symbol: OctagonPause },
];
type Eintrag = typeof befehle[number] & { gruppe?: string; titel?: string; zustand?: Agent["zustand"] };
const status = { Arbeitet: "arbeitet", "Wartet auf dich": "wartet", Fertig: "fertig", Problem: "problem" } as const;
export function Befehle({ text, anzahl = 0, neuGesperrt = false, kompaktGrund = "", kontextProzent = 0, ausfuehren, children, dateien = [], agenten = [], schreiben }: {
  text: string; kompaktGrund?: string; kontextProzent?: number; anzahl?: number; neuGesperrt?: boolean; ausfuehren: (name: string) => void;
  dateien?: string[]; agenten?: Agent[]; schreiben?: (text: string) => void;
  children: (feld: TextareaHTMLAttributes<HTMLTextAreaElement>, abfangen: (text: string) => boolean, fehler: string, marken?: ReactNode) => ReactNode;
}) {
  const [geschlossen, schliessen] = useState(false), [index, waehlen] = useState(0);
  const [fehler, melden] = useState("");
  const [gewaehlt, merken] = useState<Eintrag[]>([]), marken = gewaehlt.filter(e => bezugMuster(e.name).test(text));
  const [position, cursorSetzen] = useState<number | undefined>(undefined), cursor = position ?? text.length;
  const bezug = bezugAmCursor(text, cursor), suche = bezug?.[1].toLowerCase() ?? "";
  const echt = useSyncExternalStore(teamLauf.abonnieren, teamLauf.anzahlLesen, teamLauf.anzahlLesen), pause = useAnhalten();
  const laufend = isTauri() ? echt : pause ? 0 : anzahl;
  const liste: Eintrag[] = bezug ? [
    ...dateien.filter(p => p.toLowerCase().includes(suche)).slice(0, 5).map(p => ({ name: p, titel: p.split("/").at(-1), text: p.slice(0, p.lastIndexOf("/") + 1) || "./", Symbol: FileText, gruppe: "Dateien" })),
    ...agenten.filter(a => a.name.toLowerCase().includes(suche)).map(a => ({ name: a.name, titel: a.name, text: `Agent · ${a.anbieter}`, Symbol: Users, gruppe: "Agenten", zustand: a.zustand })),
  ] : befehle.filter(b => b.name.startsWith(text.slice(1).toLowerCase()));
  const offen = (!!bezug || /^\/\S*$/.test(text)) && !geschlossen, id = bezug ? "bezuege" : "befehle";
  const gesperrt = (name: string) => !bezug && ((name === "kompakt" && !!kompaktGrund) || (name === "neu" && neuGesperrt) || (name === "anhalten" && !laufend));
  const aktiv = liste[Math.min(index, liste.length - 1)];
  const auswahl = (inhalt: string) => {
    if (bezug) return false;
    const befehl = befehle.find(b => `/${b.name}` === inhalt.trim().toLowerCase());
    if (!befehl) return false;
    if (gesperrt(befehl.name)) melden(befehl.name === "kompakt" ? kompaktGrund : befehl.name === "neu" ? "Rollen laden …" : "Kein Agent läuft.");
    else { melden(""); ausfuehren(befehl.name); schliessen(true); }
    return true;
  };
  const einfuegen = (name: string, gruppe?: string) => {
    if (!bezug) { auswahl(`/${name}`); return; }
    const neu = bezugEinfuegen(text, cursor, name); schreiben?.(neu.text); cursorSetzen(neu.cursor); schliessen(true);
    merken([...gewaehlt.filter(e => e.name !== name), liste.find(e => e.name === name && e.gruppe === gruppe)!]);
    requestAnimationFrame(() => { const feld = document.getElementById("chat-nachricht") as HTMLTextAreaElement | null;
      feld?.focus(); feld?.setSelectionRange(neu.cursor, neu.cursor); });
  };
  const markiert = (wert: string) => { const i = wert.toLowerCase().indexOf(suche);
    return bezug && suche && i >= 0 ? <>{wert.slice(0, i)}<mark>{wert.slice(i, i + suche.length)}</mark>{wert.slice(i + suche.length)}</> : wert; };
  const optionId = (name: string, gruppe?: string) => bezug ? `bezug-${liste.findIndex(e => e.name === name && e.gruppe === gruppe)}` : `befehl-${name}`;
  const aktivId = offen && aktiv && !gesperrt(aktiv.name) ? optionId(aktiv.name, aktiv.gruppe) : undefined;
  return <div className="ein-befehle-anker">
    {offen && <div className="ein-menue ein-befehle">
      <div id={id} role="listbox" aria-label={bezug ? "Bezüge" : "Befehle"}>
      {(bezug ? ["Dateien", "Agenten"] : [undefined]).map(gruppe => <div key={gruppe ?? id} role="group" aria-label={gruppe ?? "Befehle"}>
        <header role="presentation"><b>{gruppe ?? "Befehle"}</b><span>{liste.filter(e => e.gruppe === gruppe).length}</span></header>
        {liste.filter(e => e.gruppe === gruppe).map(({ name, text, Symbol, titel, zustand }) => <button key={name} id={optionId(name, gruppe)} type="button" role="option" tabIndex={-1}
          aria-selected={aktiv?.name === name && aktiv?.gruppe === gruppe} disabled={gesperrt(name)} onMouseDown={e => e.preventDefault()} onClick={() => einfuegen(name, gruppe)}>
          <span className="ein-befehl-symbol"><Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span>
          <span><code>{markiert(titel ?? `/${name}`)}</code><small>{markiert(text)}</small></span>
          {zustand && <Statusmarke zustand={status[zustand]} />}
          {!bezug && name === "kompakt" && <small>{kompaktGrund || `${Math.round(kontextProzent)} % belegt`}</small>}
          {!bezug && name === "anhalten" && <small>{laufend ? `${laufend} ${laufend === 1 ? "läuft" : "laufen"}` : "Kein Agent läuft"}</small>}
          {!bezug && name === "neu" && neuGesperrt && <small>Rollen laden …</small>}
        </button>)}
      </div>)}
      </div>
      {!liste.length && <p role="status">{bezug ? "Nichts gefunden" : "Kein Befehl gefunden"}</p>}
      <footer><kbd>↑</kbd> <kbd>↓</kbd> Wählen <kbd>Enter</kbd> {bezug ? "Einfügen" : "Ausführen"} <kbd>Esc</kbd> Schließen</footer>
    </div>}
    {children({ "aria-autocomplete": "list", "aria-controls": offen ? id : undefined, "aria-activedescendant": aktivId,
      onSelect: e => cursorSetzen(e.currentTarget.selectionStart),
      onChange: e => { cursorSetzen(e.target.selectionStart ?? e.target.value.length); schliessen(false); waehlen(0); melden(""); }, onBlur: () => schliessen(true),
      onKeyDown: e => {
        if (!offen || e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); schliessen(true); }
        if (["ArrowDown", "ArrowUp"].includes(e.key) && liste.length) {
          e.preventDefault(); const richtung = e.key === "ArrowDown" ? 1 : -1;
          for (let n = 1; n <= liste.length; n++) { const i = (Math.min(index, liste.length - 1) + richtung * n + liste.length) % liste.length;
            if (!gesperrt(liste[i].name)) { waehlen(i); e.currentTarget?.ownerDocument.getElementById(optionId(liste[i].name, liste[i].gruppe))?.scrollIntoView({ block: "nearest" }); break; } }
        }
        if (e.key === "Enter" && !e.shiftKey && aktiv) { e.preventDefault(); einfuegen(aktiv.name, aktiv.gruppe); }
      },
    }, auswahl, fehler, !!marken.length && <div className="ein-bezugmarken">{marken.map(({ name, Symbol }) => <button type="button" className="kn kn-leise" key={name}
      aria-label={`Bezug ${name} entfernen`} onClick={() => { schreiben?.(text.replace(bezugMuster(name), "$1")); cursorSetzen(undefined); }}>
      <Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />{name}<span aria-hidden="true">×</span></button>)}</div>)}
  </div>;
}
