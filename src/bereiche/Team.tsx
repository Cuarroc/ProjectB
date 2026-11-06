import { useState } from "react";
import { ChartGantt, Kanban, LayoutGrid, OctagonPause, Users } from "lucide-react";
import { Agentenkarte } from "../bausteine/Agentenkarte";
import { Kachel } from "../bausteine/Kachel";
import { Knopf } from "../bausteine/Knopf";
import { BeispielQuelle } from "../daten/quelle";
import { orchestratorBeispiel, teamTestverlauf } from "../daten/quelle";
import { Umschalter } from "../bausteine/Umschalter";
import { TeamBoard, TeamZeitstrahl, spur, teamAngehalten } from "./TeamAnsichten";
import type { Datenstand, Agent } from "../daten/typen";
import "./Team.css";
import { TeamDetails, mitBeleg } from "./TeamDetails";
import { allesAnhalten, AnhalteHinweis, useAnhalten } from "./anhalten";

const status = { Arbeitet: "arbeitet", "Wartet auf dich": "wartet", Fertig: "fertig", Problem: "problem" } as const;
const jetzt = orchestratorBeispiel.laufzeitSekunden;
const dauer = (wert: number) => `${Math.floor(wert / 60)}:${String(wert % 60).padStart(2, "0")}`;
const tokens = (wert: number) => wert >= 999950 ? `${(wert / 1000000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}M` : wert >= 1000 ? `${(wert / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k` : String(wert);
type TeamAgent = Agent & { vorPause?: Pick<Agent, "zustand" | "liveZeile"> };
const fortsetzen = ({ vorPause, ...agent }: TeamAgent): Agent => ({ ...agent, ...vorPause });

export function anhalten(daten: Datenstand, id?: string): Datenstand {
  return { ...daten, agenten: daten.agenten.map((a: TeamAgent) => (!id || a.id === id) && a.zustand !== "Fertig" && !a.vorPause
    ? { ...a, vorPause: { zustand: a.zustand, liveZeile: a.liveZeile }, zustand: "Wartet auf dich", liveZeile: "Angehalten. Weiter mit Fortsetzen." } : a) };
}

type Props = { daten: Datenstand; auswahl: string | null; waehlen: (id: string | null) => void; aendern: (daten: Datenstand) => void; ansicht?: string; umschalten?: (wert: string) => void; pause?: boolean; allesStoppen?: () => void };
export function TeamAnsicht({ daten, auswahl, waehlen, aendern, ansicht = "Karten", umschalten = () => {}, pause = false, allesStoppen }: Props) {
  const original = daten;
  if (pause) {
    daten = anhalten(daten);
    daten = { ...daten, agenten: daten.agenten.map(a => a.liveZeile.startsWith("Angehalten.") ? { ...a, liveZeile: "Angehalten. Weiter mit Weitermachen." } : a) };
  }
  daten = mitBeleg(daten);
  const agenten = daten.agenten.slice(0, 3).sort((a, b) => Number(a.zustand === "Fertig") - Number(b.zustand === "Fertig"));
  const details = auswahl === "orchestrator" ? { id: "orchestrator", name: "Orchestrator", liveZeile: `Koordiniert ${agenten.length} Agenten`, anbieter: "Claude", modell: daten.chats[0]?.modell, zustand: teamAngehalten(agenten) ? "Wartet auf dich" : "Arbeitet", tokens: orchestratorBeispiel.tokens, laufzeitSekunden: jetzt, dateien: [], phasen: [], arbeitskopie: "", effort: "Hoch", fortschritt: 0, letzteZeilen: [], tests: null, schaetzung: null } as Agent : agenten.find(a => a.id === auswahl);
  const fertig = daten.plan.schritte.filter(s => s.zustand === "Fertig").length;
  const alleAngehalten = teamAngehalten(agenten);
  const tests = agenten.reduce((summe, a) => ({ gruen: summe.gruen + (a.tests?.gruen ?? 0), gesamt: summe.gesamt + (a.tests?.gesamt ?? 0) }), { gruen: 0, gesamt: 0 });
  const gesamtTokens = orchestratorBeispiel.tokens + agenten.reduce((summe, a) => summe + a.tokens, 0);
  return <section className="team-bereich" aria-labelledby="team">
    <header className="team-kopf"><h2 id="team">Team</h2><span className="team-chip">{agenten.length} Agenten</span>
      <Umschalter className="team-ansichten" moeglichkeiten={["Karten", "Board", "Zeitstrahl"]} wert={ansicht} beschriftung="Team-Ansicht" onChange={umschalten} symbole={[LayoutGrid, Kanban, ChartGantt].map((Symbol, i) => <Symbol key={i} size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />)} />
      <Knopf text="Alle anhalten" vorsatz={<OctagonPause size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />} variante="gefaehrlich" onClick={() => allesStoppen ? allesStoppen() : aendern(anhalten(original))} /></header>
    <AnhalteHinweis pause={pause} />
    {ansicht !== "Karten" && <div className="team-wechsel" key={ansicht}>
      <div className="team-summe"><span>Aufgaben <b>{fertig} / {daten.plan.schritte.length}</b></span><span>Tests grün <b>{tests.gruen} / {tests.gesamt}</b></span><span>Tokens <b>{tokens(gesamtTokens)}</b></span><span>Laufzeit <b>{dauer(jetzt)} min</b></span></div>
      {ansicht === "Board" ? <TeamBoard daten={daten} agenten={agenten} waehlen={waehlen} auswahl={auswahl} /> : <TeamZeitstrahl daten={daten} agenten={agenten} waehlen={waehlen} auswahl={auswahl} />}
    </div>}
    <div className="team-standard" hidden={ansicht !== "Karten"}>
    <div className="team-kacheln">
      <Kachel titel="Aufgaben" thema="aufgaben" zusatz={`${Math.round(fertig / Math.max(1, daten.plan.schritte.length) * 100)} %`} zahl={`${fertig} / ${daten.plan.schritte.length}`} unterzeile={<span className="team-legende">{["Fertig", "Arbeitet", "Wartet auf dich", "Offen"].map(wort => <span key={wort}><i aria-hidden="true" style={{ background: `var(--status-${wort === "Offen" ? "offen" : status[wort as keyof typeof status]})` }} />{daten.plan.schritte.filter(s => s.zustand === wort).length} {wort}</span>)}</span>} grafik={<span className="team-aufgaben" aria-hidden="true">{daten.plan.schritte.map(s => <span key={s.id} style={{ background: `var(--status-${s.zustand === "Offen" ? "offen" : status[s.zustand]})` }} />)}</span>} />
      <Kachel titel="Tests grün" zusatz={`${Math.round(tests.gruen / Math.max(1, tests.gesamt) * 100)} %`} zahl={`${tests.gruen} / ${tests.gesamt}`} unterzeile={<span className="team-diagramm-zeiten"><span>14:31</span><span>14:34</span><span>Jetzt</span></span>}
        grafik={<div className="team-testverlauf" role="img" aria-label={`Tests grün: von 0 auf ${tests.gruen} von ${tests.gesamt}. Um 14:35 waren 3 rot.`}>
          <span>{tests.gesamt}</span><svg viewBox="0 0 120 50" preserveAspectRatio="none" aria-hidden="true"><polyline points={teamTestverlauf.map((p, i) => `${i * 20},${48 - p.gruen / Math.max(1, tests.gesamt) * 46}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg><span className="team-rot">3 rot</span><span>0</span>
        </div>} />
      <Kachel titel="Tokens" thema="tokens" zusatz="Seit 14:30" zahl={tokens(gesamtTokens)} unterzeile={<span className="team-legende team-reihen"><span><i aria-hidden="true" style={{ background: "var(--reihe-agenten)" }} />Agenten <b>{tokens(gesamtTokens - orchestratorBeispiel.tokens)}</b></span><span><i aria-hidden="true" style={{ background: "var(--reihe-orchestrator)" }} />Orchestrator <b>{tokens(orchestratorBeispiel.tokens)}</b></span></span>}
        grafik={<><span className="team-rate">{tokens(Math.round(gesamtTokens / jetzt * 60 / 1000) * 1000)} / min</span><span className="team-tokens" aria-hidden="true"><span style={{ flex: gesamtTokens - orchestratorBeispiel.tokens }} /><span style={{ flex: orchestratorBeispiel.tokens }} /></span></>} />
    </div>
    <div className="team-liste" aria-label="Agenten">
      <div className="team-achse"><span className="team-jetzt">Jetzt 14:37</span><div><span>14:30</span><span>14:32</span><span>14:34</span><span>14:36</span><span>14:38</span><span>14:40</span></div></div>
      <div className="team-orchestrator" data-agent="orchestrator"><Agentenkarte name="Orchestrator" modell={`${daten.chats[0]?.modell ?? "–"} · Koordiniert ${agenten.length} Agenten`}
        zustand={alleAngehalten ? "wartet" : "arbeitet"} zeile={alleAngehalten ? "Angehalten" : `Koordiniert ${agenten.length} Agenten`} tokens={tokens(orchestratorBeispiel.tokens)} laufzeit={dauer(jetzt)}
        zeitspur={{ jetzt, phasen: orchestratorBeispiel.phasen.map(p => ({ ...p, laufend: p.art === "koordiniert" && !alleAngehalten })), zustand: alleAngehalten ? "wartet" : "arbeitet" }}
        onDetails={() => waehlen(auswahl === "orchestrator" ? null : "orchestrator")} gewaehlt={auswahl === "orchestrator"} avatar={<Users size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />} /></div>
      {agenten.map(a => <div key={a.id} data-agent={a.id}>
        <Agentenkarte name={a.name} modell={`${a.anbieter} · ${a.modell}`} zustand={status[a.zustand]} fortschritt={a.fortschritt}
          zeitspur={spur(a)} zeile={a.liveZeile} tokens={tokens(a.tokens)} laufzeit={dauer(a.laufzeitSekunden)}
          gewaehlt={auswahl === a.id} onDetails={() => waehlen(auswahl === a.id ? null : a.id)}
          aktion={pause || a.zustand === "Fertig" ? undefined : a.liveZeile.startsWith("Angehalten.") ? "Fortsetzen" : "Anhalten"}
          onAktion={() => aendern(a.liveZeile.startsWith("Angehalten.") ? { ...original, agenten: original.agenten.map(agent => agent.id === a.id ? fortsetzen(agent) : agent) } : anhalten(original, a.id))} />
      </div>)}
    </div>
    </div>
    {details && <TeamDetails agent={details} daten={daten} schliessen={() => waehlen(null)} />}
  </section>;
}

export default function Team() {
  const pause = useAnhalten();
  const [quelle] = useState(() => new BeispielQuelle());
  const [daten, setDaten] = useState(() => quelle.lesen()), [auswahl, waehlen] = useState<string | null>(null);
  const [ansicht, umschalten] = useState("Karten");
  return <div className="team-spalte"><TeamAnsicht daten={daten} pause={pause} allesStoppen={() => allesAnhalten.setzen(true)} auswahl={auswahl} waehlen={waehlen} ansicht={ansicht} umschalten={wert => { umschalten(wert); waehlen(null); }} aendern={neu => { quelle.aktualisieren(neu); setDaten(quelle.lesen()); }} /></div>;
}
