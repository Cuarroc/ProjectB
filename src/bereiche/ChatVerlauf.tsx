import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Check, ChevronRight, Circle, Copy, MessageCircleQuestion, Users } from "lucide-react";
import { BeispielQuelle } from "../daten/quelle";
import { isTauri } from "@tauri-apps/api/core";
import { chatAnlegen } from "../daten/chats";
import { Knopf } from "../bausteine/Knopf";
import { Fortschrittsring } from "../bausteine/Fortschrittsring";
import { Statusmarke, zustaende as statusDefinitionen, type Zustand } from "../bausteine/Statusmarke";
import { tokenMs } from "../bausteine/Tooltip";
import type { Plan, Planschritt } from "../daten/typen";
import "./ChatVerlauf.css";
import "../bausteine/bausteine2.css";
import Planfenster, { type PlanMarken } from "./Planfenster";
import { planKommentare, markdownKlartext } from "../daten/plan";
import Interview, { type InterviewZustand } from "./Interview";
import { AnhalteHinweis, useAnhalten } from "./anhalten";

import { teamLauf } from "../daten/tauri";

const standardQuelle = new BeispielQuelle();
const LaufSymbol = statusDefinitionen.arbeitet.Symbol;
const zustaende: Record<Planschritt["zustand"], Zustand> = {
  Offen: "offen", Arbeitet: "arbeitet", "Wartet auf dich": "wartet", Fertig: "fertig", Problem: "problem",
};
type Props = {
  quelle?: BeispielQuelle;
  onPlanOeffnen?: (planId: string) => void;
  onAntwort?: (frageId: string, antwortId: string) => void;
  onAktion?: (nachrichtId: string, aktionId: string, kommentar?: string) => void;
};

export default function ChatVerlauf({ quelle = standardQuelle, onPlanOeffnen, onAntwort, onAktion }: Props) {
  const pause = useAnhalten();
  const teamLaeuft = useSyncExternalStore(teamLauf.abonnieren, teamLauf.lesen, teamLauf.lesen);
  const [daten, setDaten] = useState(() => quelle.lesen());
  const [interviews, setInterviews] = useState<Record<string, InterviewZustand>>({});
  const [antworten, setAntworten] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState("");
  const [planOffen, setPlanOffen] = useState<{ plan: Plan; echt: boolean } | null>(null);
  const [planFreigabe, setPlanFreigabe] = useState("");
  const [planMarken, setPlanMarken] = useState<Record<string, PlanMarken>>({});
  useEffect(() => {
    if (!meldung) return;
    const timer = setTimeout(() => setMeldung(""), tokenMs("standzeit-toast-info"));
    return () => clearTimeout(timer);
  }, [meldung]);
  useEffect(() => {
    const aktualisieren = () => setDaten(quelle.lesen());
    const abmelden = quelle.abonnieren(aktualisieren);
    aktualisieren();
    return abmelden;
  }, [quelle]);
  const chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  const [, zeitAktualisieren] = useState(0);
  useEffect(() => {
    if (!chat?.gestartetUm) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { zeitAktualisieren(wert => wert + 1); timer = setTimeout(tick, 60_000 - Date.now() % 60_000); };
    timer = setTimeout(tick, 60_000 - Date.now() % 60_000);
    return () => clearTimeout(timer);
  }, [chat?.gestartetUm]);
  const jetzt = new Date(), [stunden, minuten] = (chat?.gestartetUm ?? "00:00").split(":").map(Number);
  const laufzeit = (jetzt.getHours() * 60 + jetzt.getMinutes() - stunden * 60 - minuten + 1440) % 1440;
  // Die kompakte Karte zählt die Teilaufgaben mit Agenten; der volle Plan bleibt erreichbar.
  const teilaufgaben = daten.plan.schritte.filter(s => s.agentId !== null);
  const fertig = teilaufgaben.filter(s => s.zustand === "Fertig").length;
  const risiko = teilaufgaben.filter(s => s.zustand === "Wartet auf dich");
  const kopieren = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setMeldung("Kopiert."); }
    catch { setMeldung("Kopieren fehlgeschlagen."); }
  };
  return <>
    <header className="chat-kopf">
      <h2 id="chat">Chat</h2>
      <span className="chat-empfaenger">An <span className="r-avatar"><Users size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span><strong>Orchestrator</strong></span>
      {chat?.gestartetUm && <span className="chat-laufzeit statusmarke" role="timer" aria-live="off" data-zustand="arbeitet">
        <LaufSymbol size={12} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />Läuft seit {laufzeit < 1 ? "weniger als 1 min" : laufzeit < 60 ? `${laufzeit} min` : `${Math.floor(laufzeit / 60)} h${laufzeit % 60 ? ` ${laufzeit % 60} min` : ""}`}
      </span>}
      <Knopf text="Neuer Chat" disabled={!daten.chats.length || (isTauri() && daten.rollenPfad !== daten.kopf.pfad)} onClick={() => chatAnlegen(quelle)} />
    </header>
    <AnhalteHinweis pause={pause} />
    <div className="chat-verlauf" role="log" aria-label="Chatverlauf" aria-relevant="additions text">
      {chat?.modus === "Interview" && <Interview key={chat.id} zustand={interviews[chat.id] ?? { antworten: [], auswahl: "", frei: "" }} aendern={wert => setInterviews(v => ({ ...v, [chat.id]: wert }))} />}
      <ol className="chat-nachrichten">
        {chat?.verlauf.map(n => {
          const frage = daten.fragen.find(f => f.id === n.frageId);
          const plan = n.planId === daten.plan.id ? daten.plan : null;
          return <li key={n.id} className={n.von === "Du" ? "r-du" : undefined}>
            <article id={`nachricht-${n.id}`} tabIndex={-1} className={`r-karte r-msg${n.von === "Du" ? " r-du-blase" : ""}`} aria-label={`${n.von}, ${n.zeit}`}>
              <header className="r-msg-kopf">
                {n.von === "Orchestrator" && <span className="r-avatar"><Users size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span>}
                <span className="r-msg-name">{n.von}</span><time className="r-msg-zeit">{n.zeit}</time>
                <Knopf text="Kopieren" symbol={Copy} nurSymbol variante="leise" onClick={() => void kopieren(frage ? `${n.text}\n${frage.text}` : n.text)} />
              </header>
              {!frage && <p className="r-msg-text">{n.text}</p>}
              {plan && <section className="r-innen r-plan" aria-label={plan.titel}>
                <div className="r-plan-kopf">
                  <Fortschrittsring wert={teilaufgaben.length ? fertig / teilaufgaben.length * 100 : 0} text={`${fertig} / ${teilaufgaben.length}`} />
                  <span><strong className="r-plan-titel">Plan · {fertig} / {teilaufgaben.length} fertig</strong><span className="r-plan-unter">{plan.titel}</span></span>
                </div>
                <ul className="r-plan-liste">{teilaufgaben.map(s => {
                  const agent = daten.agenten.find(a => a.id === s.agentId), zustand = zustaende[s.zustand];
                  const { Symbol } = statusDefinitionen[zustand];
                  return <li key={s.id} className="r-plan-zeile" style={{ "--thema": `var(--status-${zustand})` } as CSSProperties}>
                    <span className="r-plan-symbol" role="img" aria-label={s.zustand} title={s.zustand}><Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" fill={zustand === "wartet" ? "currentColor" : "none"} /></span>
                    <span className="r-plan-name" title={s.titel}>{s.titel}</span><span className="r-plan-wer">{agent?.anbieter}</span>
                    <span className="ka-balken" role="progressbar" aria-label={`${s.titel}: ${s.zustand}`} aria-valuenow={agent?.fortschritt ?? undefined} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${agent?.fortschritt ?? 0}%` }} /></span>
                  </li>;
                })}</ul>
                <details className="r-bedingungen"><summary>Fertig, wenn</summary>
                  <ul>{plan.schritte.map(s => <li key={s.id}><strong>{s.titel}</strong> <Statusmarke zustand={zustaende[s.zustand]} />
                    {s.fertigWenn.map((b, i) => <p key={i} data-erfuellt={b.erfuellt}>
                      {b.erfuellt ? <Check size={14} strokeWidth={1.5} absoluteStrokeWidth aria-label="Erfüllt" /> : <Circle size={14} strokeWidth={1.5} absoluteStrokeWidth aria-label="Offen" />}{b.text}
                    </p>)}
                  </li>)}</ul>
                </details>
                {risiko.map(s => <p className="r-plan-risiko" key={s.id}>Risiko: {s.beschreibung}</p>)}
                {planFreigabe && <p role="status">{planFreigabe}</p>}
                <Knopf text="Plan öffnen" symbol={ChevronRight} onClick={() => { setPlanOffen({ plan, echt: false }); onPlanOeffnen?.(plan.id); }} />
              </section>}
              {frage && <section className="r-innen r-frage" aria-label={n.text} aria-live="assertive">
                <div className="r-frage-kopf"><MessageCircleQuestion size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /><strong>{n.text}</strong></div>
                <p className="r-frage-text">{frage.text}</p>
                <div className="r-antworten">{frage.antwortknoepfe.map(a => <Knopf key={a.id} text={a.text} variante="antwort" aria-pressed={antworten[frage.id] === a.id}
                  onClick={() => { setAntworten(v => ({ ...v, [frage.id]: a.id })); onAntwort?.(frage.id, a.id); }} />)}</div>
              </section>}
              {(n.aktionen.length > 0 || n.plan) && <div className="r-aktionen">{n.aktionen.map(a => <Knopf key={a.id} text={a.text} aria-label={a.antwort === undefined ? undefined : markdownKlartext(a.antwort)} variante={a.id === "plan-freigeben" ? "haupt" : a.id.startsWith("antwort-") ? "antwort" : "zweit"} disabled={!onAktion || !!chat.gestartetUm || (a.id === "plan-freigeben" && teamLaeuft)} grund={a.id === "plan-freigeben" && teamLaeuft ? "Das letzte Team läuft noch oder ist nicht gesichert." : undefined} onClick={() => onAktion?.(n.id, a.id)} />)}
                {n.plan && <Knopf text="Plan öffnen" symbol={ChevronRight} onClick={() => { setPlanOffen({ plan: n.plan!, echt: true }); onPlanOeffnen?.(n.plan!.id); }} />}
              </div>}
            </article>
          </li>;
        })}
      </ol>
    </div>
    <div className="chat-meldung" role="status">{meldung}</div>
    {planOffen && <Planfenster daten={daten} laeuft={!!chat?.gestartetUm || teamLaeuft} plan={planOffen.echt ? planOffen.plan : undefined} freigabeGesperrt={teamLaeuft} entscheidbar={!planOffen.echt || (!!onAktion && !chat?.gestartetUm && !!chat?.verlauf.find(n => n.id === planOffen.plan.id)?.aktionen.length)} gespeicherteMarken={planMarken[planOffen.plan.id] ?? {}} onSchliessen={() => setPlanOffen(null)} onEntscheiden={(plan, marken, stil) => {
      if (planOffen.echt) { onAktion?.(plan.id, plan.freigabe === "Freigegeben" ? "plan-freigeben" : "plan-kommentieren", planKommentare(plan, stil, marken)); return; }
      if (quelle instanceof BeispielQuelle) quelle.aktualisieren({ ...quelle.lesen(), plan });
      else setDaten(d => ({ ...d, plan }));
      setPlanMarken(m => ({ ...m, [plan.id]: marken })); setPlanFreigabe(plan.freigabe === "Freigegeben" ? "Freigegeben" : "Zurückgegeben");
    }} />}
  </>;
}
