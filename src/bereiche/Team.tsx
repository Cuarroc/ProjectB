import { useLayoutEffect, useRef, useState } from "react";
import { ChartGantt, Kanban, LayoutGrid, OctagonPause, Users } from "lucide-react";
import { Agentenkarte } from "../bausteine/Agentenkarte";
import { Kachel } from "../bausteine/Kachel";
import { Knopf } from "../bausteine/Knopf";
import type { Phase, ZeitspurProps } from "../bausteine/Zeitspur";
import { BeispielQuelle } from "../daten/quelle";
import { orchestratorBeispiel, teamTestverlauf } from "../daten/quelle";
import { Umschalter } from "../bausteine/Umschalter";
import { TeamBoard, TeamZeitstrahl } from "./TeamAnsichten";
import type { Datenstand, Agent } from "../daten/typen";
import "./Team.css";

const status = { Arbeitet: "arbeitet", "Wartet auf dich": "wartet", Fertig: "fertig", Problem: "problem" } as const;
const jetzt = orchestratorBeispiel.laufzeitSekunden;
const sekunden = (zeit: string) => zeit.split(":").reduce((wert, teil) => wert * 60 + Number(teil), 0) - 14 * 3600 - 30 * 60;
const dauer = (wert: number) => `${Math.floor(wert / 60)}:${String(wert % 60).padStart(2, "0")}`;
const tokens = (wert: number) => wert >= 999950 ? `${(wert / 1000000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}M` : wert >= 1000 ? `${(wert / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k` : String(wert);
type TeamAgent = Agent & { vorPause?: Pick<Agent, "zustand" | "liveZeile"> };
const fortsetzen = ({ vorPause, ...agent }: TeamAgent): Agent => ({ ...agent, ...vorPause });

export function anhalten(daten: Datenstand, id?: string): Datenstand {
  return { ...daten, agenten: daten.agenten.map((a: TeamAgent) => (!id || a.id === id) && a.zustand !== "Fertig" && !a.vorPause
    ? { ...a, vorPause: { zustand: a.zustand, liveZeile: a.liveZeile }, zustand: "Wartet auf dich", liveZeile: "Angehalten. Weiter mit Fortsetzen." } : a) };
}

export function spur(agent: Agent): ZeitspurProps {
  const angehalten = agent.liveZeile.startsWith("Angehalten.");
  const phasen: Phase[] = agent.phasen.map(p => ({ name: p.name, art: p.name.toLowerCase() as Phase["art"],
    start: sekunden(p.start), ende: p.ende ? sekunden(p.ende) : jetzt, laufend: p.ende === null && !angehalten }));
  return { phasen, jetzt, bis: 600, zustand: status[agent.zustand],
    wartebeginn: angehalten ? jetzt : phasen.at(-1)?.ende ?? jetzt, wartezeit: angehalten ? "0:00" : dauer(jetzt - (phasen.at(-1)?.ende ?? jetzt)),
    ereignisse: agent.zustand === "Fertig" ? [{ zeit: phasen.at(-1)?.ende ?? jetzt, art: "fertig", text: "Fertig" }] : [],
    schaetzung: agent.schaetzung ? sekunden(`${agent.schaetzung.fertigUm}:00`) : undefined };
}

type Props = { daten: Datenstand; auswahl: string | null; waehlen: (id: string | null) => void; aendern: (daten: Datenstand) => void; ansicht?: string; umschalten?: (wert: string) => void };
export function TeamAnsicht({ daten, auswahl, waehlen, aendern, ansicht = "Karten", umschalten = () => {} }: Props) {
  const agenten = daten.agenten.slice(0, 3).sort((a, b) => Number(a.zustand === "Fertig") - Number(b.zustand === "Fertig"));
  const details = auswahl === "orchestrator" ? { name: "Orchestrator", liveZeile: `Koordiniert ${agenten.length} Agenten`, anbieter: "Claude", modell: daten.chats[0]?.modell, arbeitskopie: null } : agenten.find(a => a.id === auswahl);
  const fertig = daten.plan.schritte.filter(s => s.zustand === "Fertig").length;
  const alleAngehalten = agenten.filter(a => a.zustand !== "Fertig").every(a => a.liveZeile.startsWith("Angehalten."));
  const tests = agenten.reduce((summe, a) => ({ gruen: summe.gruen + (a.tests?.gruen ?? 0), gesamt: summe.gesamt + (a.tests?.gesamt ?? 0) }), { gruen: 0, gesamt: 0 });
  const gesamtTokens = orchestratorBeispiel.tokens + agenten.reduce((summe, a) => summe + a.tokens, 0);
  return <section className="team-bereich" aria-labelledby="team">
    <header className="team-kopf"><h2 id="team">Team</h2><span className="team-chip">{agenten.length} Agenten</span>
      <Umschalter className="team-ansichten" moeglichkeiten={["Karten", "Board", "Zeitstrahl"]} wert={ansicht} beschriftung="Team-Ansicht" onChange={umschalten} symbole={[LayoutGrid, Kanban, ChartGantt].map((Symbol, i) => <Symbol key={i} size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />)} />
      <Knopf text="Alle anhalten" vorsatz={<OctagonPause size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />} variante="gefaehrlich" onClick={() => aendern(anhalten(daten))} /></header>
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
          aktion={a.zustand === "Fertig" ? undefined : a.liveZeile.startsWith("Angehalten.") ? "Fortsetzen" : "Anhalten"}
          onAktion={() => aendern(a.liveZeile.startsWith("Angehalten.") ? { ...daten, agenten: daten.agenten.map(agent => agent.id === a.id ? fortsetzen(agent) : agent) } : anhalten(daten, a.id))} />
      </div>)}
    </div>
    </div>
    {details && <aside id="team-details" className="team-details" aria-label={`Details: ${details.name}`}>
      <header><h3>{details.name}</h3><Knopf text="Schließen" variante="leise" onClick={() => waehlen(null)} /></header>
      <p>{details.liveZeile}</p><p>{details.anbieter} · {details.modell}{details.arbeitskopie && ` · Arbeitskopie ${details.arbeitskopie}`}</p>
    </aside>}
  </section>;
}

export default function Team() {
  const [quelle] = useState(() => new BeispielQuelle());
  const [daten, setDaten] = useState(() => quelle.lesen()), [auswahl, waehlen] = useState<string | null>(null);
  const [ansicht, umschalten] = useState("Karten");
  const bereich = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (auswahl) bereich.current?.querySelector(`[data-agent="${auswahl}"]`)?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [auswahl]);
  return <div className="team-spalte" ref={bereich}><TeamAnsicht daten={daten} auswahl={auswahl} waehlen={waehlen} ansicht={ansicht} umschalten={wert => { umschalten(wert); waehlen(null); }} aendern={neu => { quelle.aktualisieren(neu); setDaten(quelle.lesen()); }} /></div>;
}
