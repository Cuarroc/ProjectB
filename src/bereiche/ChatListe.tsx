import { useEffect, useState } from "react";
import { MessageSquare, PanelLeftClose, Plus } from "lucide-react";
import { PostfachKnopf } from "./PostfachKnopf";
import { BeispielQuelle } from "../daten/quelle";
import { chatsVerbinden, chatAnlegen } from "../daten/chats";
import { Fortschrittsring } from "../bausteine/Fortschrittsring";
import { Knopf } from "../bausteine/Knopf";
import type { Todo } from "../daten/typen";
import "./ChatListe.css";

type Props = { quelle: BeispielQuelle; offen: boolean; umschalten: () => void };
export default function ChatListe({ quelle, offen, umschalten }: Props) {
  const [daten, setDaten] = useState(() => quelle.lesen()), [text, schreiben] = useState("");
  const [fehler, setFehler] = useState("");
  useEffect(() => { const lesen = () => setDaten(quelle.lesen()); lesen(); return quelle.abonnieren(lesen); }, [quelle]);
  useEffect(() => chatsVerbinden(quelle, setFehler), [quelle]);
  const fertig = daten.plan.schritte.filter(s => s.zustand === "Fertig").length, gesamt = daten.plan.schritte.length;
  const aendern = (neu: Partial<typeof daten>) => quelle.aktualisieren({ ...quelle.lesen(), ...neu });
  const chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  const todos = chat?.todos ?? (daten.kopf.geoeffnet ? [] : daten.todos);
  const todosAendern = (ersetzen: (todos: Todo[]) => Todo[]) => {
    const neu = quelle.lesen(), ziel = neu.chats.find(c => c.id === neu.aktiverChatId);
    if (!ziel) return;
    ziel.todos = ersetzen(ziel.todos ?? (neu.kopf.geoeffnet ? [] : neu.todos));
    quelle.aktualisieren(neu);
  };
  return <section className="chat-rand" aria-label="Chats und Aufgaben" data-offen={offen}>
    <button type="button" className="rand-schalter" aria-expanded={offen} aria-controls="rand-inhalt" onClick={umschalten}
      aria-label={offen ? "Chats und Aufgaben einklappen" : `${fertig} / ${gesamt} – Chats und Aufgaben öffnen`}>
      {offen ? <PanelLeftClose size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /> :
        <Fortschrittsring wert={gesamt ? fertig / gesamt * 100 : 0} zustand="ziel" groesse={40} text={`${fertig} / ${gesamt}`} />}
    </button>
    <div id="rand-inhalt" hidden={!offen}>
      <h2>Chats und Aufgaben</h2>
      <div className="rand-inhalt">
        <section className="rand-karte" aria-labelledby="chats"><h3 id="chats">Chats</h3>
          <Knopf text="Neuer Chat" symbol={Plus} disabled={!daten.chats.length} onClick={() => chatAnlegen(quelle)} />
          {fehler && <p role="alert">{fehler}</p>}
          <ul>{daten.chats.map(chat => <li key={chat.id}><button type="button" className="rand-chat" aria-current={chat.id === daten.aktiverChatId ? "true" : undefined}
            onClick={() => aendern({ aktiverChatId: chat.id })}><MessageSquare size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /><span>{chat.titel}</span></button></li>)}</ul>
        </section>
        <section className="rand-karte" aria-labelledby="todos"><h3 id="todos">Todo-Liste <span>Orchestrator</span></h3>
          {!todos.length && <p>Noch keine Aufgaben.</p>}
          {todos.length >= 20 && <p>Höchstens 20 Aufgaben.</p>}
          <ul>{todos.map(todo => <li key={todo.id}><label className="rand-todo"><input type="checkbox" checked={todo.fertig}
            onChange={() => todosAendern(stand => stand.map(t => t.id === todo.id ? { ...t, fertig: !t.fertig } : t))} /><span>{todo.text}</span></label></li>)}</ul>
          <form className="rand-form" onSubmit={e => { e.preventDefault(); if (!text.trim()) return;
            todosAendern(stand => stand.length >= 20 ? stand : [...stand, { id: crypto.randomUUID(), text: text.trim(), fertig: false, von: "Du" }]); schreiben(""); }}>
            <input aria-label="Aufgabe hinzufügen" placeholder="Neue Aufgabe …" disabled={!chat || todos.length >= 20} value={text} onChange={e => schreiben(e.target.value)} />
            <Knopf text="Aufgabe hinzufügen" nurSymbol symbol={Plus} type="submit" disabled={!chat || todos.length >= 20} />
          </form>
        </section>
        <div className="rand-karte"><PostfachKnopf zahl={daten.kopf.postfach} /></div>
      </div>
    </div>
  </section>;
}
