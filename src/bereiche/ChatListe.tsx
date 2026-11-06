import { useEffect, useState } from "react";
import { Mail, MessageSquare, PanelLeftClose, Plus } from "lucide-react";
import { BeispielQuelle } from "../daten/quelle";
import { Fortschrittsring } from "../bausteine/Fortschrittsring";
import { Knopf } from "../bausteine/Knopf";
import "./ChatListe.css";

type Props = { quelle: BeispielQuelle; offen: boolean; umschalten: () => void };
export default function ChatListe({ quelle, offen, umschalten }: Props) {
  const [daten, setDaten] = useState(() => quelle.lesen()), [text, schreiben] = useState("");
  useEffect(() => { const lesen = () => setDaten(quelle.lesen()); lesen(); return quelle.abonnieren(lesen); }, [quelle]);
  const fertig = daten.plan.schritte.filter(s => s.zustand === "Fertig").length, gesamt = daten.plan.schritte.length;
  const [postfachOffen, zeigePostfach] = useState(false);
  const wartet = daten.kopf.postfach === 1 ? "wartet" : "warten";
  const aendern = (neu: typeof daten) => quelle.aktualisieren(neu);
  return <section className="chat-rand" aria-label="Chats und Aufgaben" data-offen={offen}>
    <button type="button" className="rand-schalter" aria-expanded={offen} aria-controls="rand-inhalt" onClick={umschalten}
      aria-label={offen ? "Chats und Aufgaben einklappen" : `Chats und Aufgaben öffnen, ${fertig} von ${gesamt} Aufgaben fertig`}>
      {offen ? <PanelLeftClose size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /> :
        <Fortschrittsring wert={gesamt ? fertig / gesamt * 100 : 0} zustand="ziel" groesse={40} text={`${fertig} / ${gesamt}`} />}
    </button>
    <div id="rand-inhalt" hidden={!offen}>
      <h2>Chats und Aufgaben</h2>
      <div className="rand-inhalt">
        <section className="rand-karte" aria-labelledby="chats"><h3 id="chats">Chats</h3>
          <ul>{daten.chats.map(chat => <li key={chat.id}><button type="button" className="rand-chat" aria-current={chat.id === daten.aktiverChatId ? "true" : undefined}
            onClick={() => aendern({ ...daten, aktiverChatId: chat.id })}><MessageSquare size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /><span>{chat.titel}</span></button></li>)}</ul>
        </section>
        <section className="rand-karte" aria-labelledby="todos"><h3 id="todos">Todo-Liste <span>Orchestrator</span></h3>
          <ul>{daten.todos.map(todo => <li key={todo.id}><label className="rand-todo"><input type="checkbox" checked={todo.fertig}
            onChange={() => aendern({ ...daten, todos: daten.todos.map(t => t.id === todo.id ? { ...t, fertig: !t.fertig } : t) })} /><span>{todo.text}</span></label></li>)}</ul>
          <form className="rand-form" onSubmit={e => { e.preventDefault(); if (!text.trim()) return;
            aendern({ ...daten, todos: [...daten.todos, { id: crypto.randomUUID(), text: text.trim(), fertig: false }] }); schreiben(""); }}>
            <input aria-label="Aufgabe hinzufügen" placeholder="Neue Aufgabe …" value={text} onChange={e => schreiben(e.target.value)} />
            <Knopf text="Aufgabe hinzufügen" nurSymbol symbol={Plus} type="submit" />
          </form>
        </section>
        <div className="rand-karte"><button type="button" className="rand-postfach" aria-expanded={postfachOffen} aria-controls="rand-postfach" onClick={() => zeigePostfach(!postfachOffen)}
          aria-label={daten.kopf.postfach ? `Postfach ${daten.kopf.postfach > 99 ? "99+, " : ""}${daten.kopf.postfach} ${wartet} auf dich` : "Postfach"}>
          <Mail size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />Postfach{" "}
          {daten.kopf.postfach > 0 && <span className="rand-zaehler" aria-hidden="true">{daten.kopf.postfach > 99 ? "99+" : daten.kopf.postfach}</span>}
        </button><p id="rand-postfach" hidden={!postfachOffen}>{daten.kopf.postfach ? `${daten.kopf.postfach} ${wartet} auf dich.` : "Nichts wartet auf dich."}</p></div>
      </div>
    </div>
  </section>;
}
