import { useEffect, useState } from "react";
import { Check, ChevronRight, Circle, Copy, MessageCircleQuestion, Users } from "lucide-react";
import { BeispielQuelle, type Datenquelle } from "../daten/quelle";
import { Knopf } from "../bausteine/Knopf";
import { Fortschrittsring } from "../bausteine/Fortschrittsring";
import { Statusmarke, type Zustand } from "../bausteine/Statusmarke";
import type { Planschritt } from "../daten/typen";
import "./ChatVerlauf.css";

const standardQuelle = new BeispielQuelle();
const zustaende: Record<Planschritt["zustand"], Zustand> = {
  Offen: "offen", Arbeitet: "arbeitet", "Wartet auf dich": "wartet", Fertig: "fertig", Problem: "problem",
};
type Props = {
  quelle?: Datenquelle;
  onPlanOeffnen?: (planId: string) => void;
  onAntwort?: (frageId: string, antwortId: string) => void;
  onAktion?: (nachrichtId: string, aktionId: string) => void;
};

export default function ChatVerlauf({ quelle = standardQuelle, onPlanOeffnen, onAntwort, onAktion }: Props) {
  const [daten, setDaten] = useState(() => quelle.lesen());
  const [antworten, setAntworten] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState("");
  useEffect(() => {
    const aktualisieren = () => setDaten(quelle.lesen());
    const abmelden = quelle.abonnieren(aktualisieren);
    aktualisieren();
    return abmelden;
  }, [quelle]);
  const chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  // Die kompakte Karte zählt die Teilaufgaben mit Agenten; der volle Plan bleibt erreichbar.
  const teilaufgaben = daten.plan.schritte.filter(s => s.agentId !== null);
  const fertig = teilaufgaben.filter(s => s.zustand === "Fertig").length;
  const risiko = teilaufgaben.filter(s => s.zustand === "Wartet auf dich");
  const kopieren = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setMeldung("Kopiert."); }
    catch { setMeldung("Kopieren fehlgeschlagen."); }
  };
  return <>
    <header className="chat-kopf"><h2 id="chat">Chat</h2></header>
    <div className="chat-verlauf" role="log" aria-label="Chatverlauf" aria-relevant="additions text">
      <ol className="chat-nachrichten">
        {chat?.verlauf.map(n => {
          const frage = daten.fragen.find(f => f.id === n.frageId);
          const plan = n.planId === daten.plan.id ? daten.plan : null;
          return <li key={n.id} className={n.von === "Du" ? "r-du" : undefined}>
            <article className={`r-karte r-msg${n.von === "Du" ? " r-du-blase" : ""}`} aria-label={`${n.von}, ${n.zeit}`}>
              <header className="r-msg-kopf">
                {n.von === "Orchestrator" && <span className="r-avatar"><Users size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span>}
                <span className="r-msg-name">{n.von}</span><time className="r-msg-zeit">{n.zeit}</time>
                <Knopf text="Kopieren" symbol={Copy} nurSymbol variante="leise" onClick={() => void kopieren(n.text)} />
              </header>
              {!frage && <p className="r-msg-text">{n.text}</p>}
              {plan && <section className="r-innen r-plan" aria-label={plan.titel}>
                <div className="r-plan-kopf">
                  <Fortschrittsring wert={teilaufgaben.length ? fertig / teilaufgaben.length * 100 : 0} text={`${fertig} / ${teilaufgaben.length}`} />
                  <span><strong className="r-plan-titel">Plan · {fertig} / {teilaufgaben.length} fertig</strong><span className="r-plan-unter">{plan.titel}</span></span>
                </div>
                <ul className="r-plan-liste">{teilaufgaben.map(s => <li key={s.id} className="r-plan-zeile">
                  <span>{s.titel}</span><Statusmarke zustand={zustaende[s.zustand]} />
                </li>)}</ul>
                <details className="r-bedingungen"><summary>Fertig, wenn</summary>
                  <ul>{plan.schritte.map(s => <li key={s.id}><strong>{s.titel}</strong> <Statusmarke zustand={zustaende[s.zustand]} />
                    {s.fertigWenn.map((b, i) => <p key={i} data-erfuellt={b.erfuellt}>
                      {b.erfuellt ? <Check size={14} strokeWidth={1.5} absoluteStrokeWidth aria-label="Erfüllt" /> : <Circle size={14} strokeWidth={1.5} absoluteStrokeWidth aria-label="Offen" />}{b.text}
                    </p>)}
                  </li>)}</ul>
                </details>
                {risiko.map(s => <p className="r-plan-risiko" key={s.id}>Risiko: {s.beschreibung}</p>)}
                <Knopf text="Plan öffnen" symbol={ChevronRight} onClick={() => onPlanOeffnen?.(plan.id)} disabled={!onPlanOeffnen} grund={onPlanOeffnen ? undefined : "Noch nicht verfügbar."} />
              </section>}
              {frage && <section className="r-innen r-frage" aria-label={n.text} aria-live="assertive">
                <div className="r-frage-kopf"><MessageCircleQuestion size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /><strong>{n.text}</strong></div>
                <p className="r-frage-text">{frage.text}</p>
                <div className="r-antworten">{frage.antwortknoepfe.map(a => <Knopf key={a.id} text={a.text} variante="antwort" aria-pressed={antworten[frage.id] === a.id}
                  onClick={() => { setAntworten(v => ({ ...v, [frage.id]: a.id })); onAntwort?.(frage.id, a.id); }} />)}</div>
              </section>}
              {n.aktionen.length > 0 && <div className="r-aktionen">{n.aktionen.map(a => <Knopf key={a.id} text={a.text} disabled={!onAktion} onClick={() => onAktion?.(n.id, a.id)} />)}</div>}
            </article>
          </li>;
        })}
      </ol>
    </div>
    <div className="chat-meldung" role="status">{meldung}</div>
  </>;
}
