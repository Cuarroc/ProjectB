import { useLayoutEffect, useRef, useState } from "react";
import { OctagonPause, Users } from "lucide-react";
import { Agentenkarte } from "../bausteine/Agentenkarte";
import { Kachel } from "../bausteine/Kachel";
import { Knopf } from "../bausteine/Knopf";
import type { Phase, ZeitspurProps } from "../bausteine/Zeitspur";
import { BeispielQuelle } from "../daten/quelle";
import { orchestratorBeispiel, teamTestverlauf } from "../daten/beispiel";
import type { Datenstand, Agent } from "../daten/typen";
import "./Team.css";

const status = { Arbeitet: "arbeitet", "Wartet auf dich": "wartet", Fertig: "fertig", Problem: "problem" } as const;
const jetzt = orchestratorBeispiel.laufzeitSekunden;
const sekunden = (zeit: string) => zeit.split(":").reduce((wert, teil) => wert * 60 + Number(teil), 0) - 14 * 3600 - 30 * 60;
const dauer = (wert: number) => `${Math.floor(wert / 60)}:${String(wert % 60).padStart(2, "0")}`;
const tokens = (wert: number) => wert >= 999950 ? `${(wert / 1000000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}M` : wert >= 1000 ? `${(wert / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k` : String(wert);

export function anhalten(daten: Datenstand, id?: string): Datenstand {
  return { ...daten, agenten: daten.agenten.map(a => (!id || a.id === id) && a.zustand !== "Fertig"
    ? { ...a, zustand: "Wartet auf dich", liveZeile: "Angehalten. Weiter mit Fortsetzen." } : a) };
}

function spur(agent: Agent): ZeitspurProps {
  const angehalten = agent.liveZeile.startsWith("Angehalten.");
  const phasen: Phase[] = agent.phasen.map(p => ({ name: p.name, art: p.name.toLowerCase() as Phase["art"],
    start: sekunden(p.start), ende: p.ende ? sekunden(p.ende) : jetzt, laufend: p.ende === null && !angehalten }));
  return { phasen, jetzt, bis: 600, zustand: status[agent.zustand],
    wartebeginn: angehalten ? jetzt : phasen.at(-1)?.ende ?? jetzt, wartezeit: angehalten ? "0:00" : dauer(jetzt - (phasen.at(-1)?.ende ?? jetzt)),
    ereignisse: agent.zustand === "Fertig" ? [{ zeit: phasen.at(-1)?.ende ?? jetzt, art: "fertig", text: "Fertig" }] : [],
    schaetzung: agent.schaetzung ? sekunden(`${agent.schaetzung.fertigUm}:00`) : undefined };
}

type Props = { daten: Datenstand; auswahl: string | null; waehlen: (id: string | null) => void; aendern: (daten: Datenstand) => void };
export function TeamAnsicht({ daten, auswahl, waehlen, aendern }: Props) {
  const agenten = daten.agenten.slice(0, 3).sort((a, b) => Number(a.zustand === "Fertig") - Number(b.zustand === "Fertig"));
  const details = auswahl === "orchestrator" ? { name: "Orchestrator", liveZeile: `Koordiniert ${agenten.length} Agenten`, anbieter: "Claude", modell: daten.chats[0]?.modell, arbeitskopie: null } : agenten.find(a => a.id === auswahl);
  const fertig = daten.plan.schritte.filter(s => s.zustand === "Fertig").length;
  const alleAngehalten = agenten.filter(a => a.zustand !== "Fertig").every(a => a.liveZeile.startsWith("Angehalten."));
  const tests = agenten.reduce((summe, a) => ({ gruen: summe.gruen + (a.tests?.gruen ?? 0), gesamt: summe.gesamt + (a.tests?.gesamt ?? 0) }), { gruen: 0, gesamt: 0 });
  return <section className="team-bereich" aria-labelledby="team">
    <header className="team-kopf"><h2 id="team">Team</h2><span className="team-chip">{agenten.length} Agenten</span>
      <Knopf text="Alle anhalten" symbol={OctagonPause} variante="gefaehrlich" onClick={() => aendern(anhalten(daten))} /></header>
    <div className="team-kacheln">
      <Kachel titel="Aufgaben" thema="aufgaben" zahl={`${fertig} / ${daten.plan.schritte.length}`} unterzeile={<span className="team-legende">{["Fertig", "Arbeitet", "Wartet auf dich", "Offen"].map(wort => <span key={wort}>{daten.plan.schritte.filter(s => s.zustand === wort).length} {wort}</span>)}</span>} grafik={<span className="team-aufgaben" aria-hidden="true">{daten.plan.schritte.map(s => <span key={s.id} style={{ background: `var(--status-${s.zustand === "Offen" ? "offen" : status[s.zustand]})` }} />)}</span>} />
      <Kachel titel="Tests grün" zahl={`${tests.gruen} / ${tests.gesamt}`} unterzeile={<span className="team-diagramm-zeiten"><span>14:31</span><span>14:34</span><span>Jetzt</span></span>}
        grafik={<div className="team-testverlauf" role="img" aria-label={`Tests grün: von 0 auf ${tests.gruen} von ${tests.gesamt}. Um 14:35 waren 3 rot.`}>
          <span>{tests.gesamt}</span><svg viewBox="0 0 120 50" preserveAspectRatio="none" aria-hidden="true"><polyline points={teamTestverlauf.map((p, i) => `${i * 20},${48 - p.gruen / Math.max(1, tests.gesamt) * 46}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg><span className="team-rot">3 rot</span><span>0</span>
        </div>} />
      <Kachel titel="Tokens" thema="tokens" zahl={tokens(orchestratorBeispiel.tokens + agenten.reduce((summe, a) => summe + a.tokens, 0))} unterzeile={<span className="team-legende"><span>Agenten {tokens(agenten.reduce((summe, a) => summe + a.tokens, 0))}</span><span>Orchestrator {tokens(orchestratorBeispiel.tokens)}</span></span>}
        grafik={<span className="team-tokens" aria-hidden="true"><span style={{ flex: agenten.reduce((summe, a) => summe + a.tokens, 0) }} /><span style={{ flex: orchestratorBeispiel.tokens }} /></span>} />
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
          aktion={a.liveZeile.startsWith("Angehalten.") ? "Fortsetzen" : "Anhalten"} aktionDeaktiviert={a.zustand === "Fertig"}
          onAktion={() => aendern(a.liveZeile.startsWith("Angehalten.") ? { ...daten, agenten: daten.agenten.map(agent => agent.id === a.id ? { ...agent, zustand: "Arbeitet", liveZeile: "Arbeitet wieder." } : agent) } : anhalten(daten, a.id))} />
      </div>)}
    </div>
    {details && <aside className="team-details" aria-label={`Details: ${details.name}`}>
      <header><h3>{details.name}</h3><Knopf text="Schließen" variante="leise" onClick={() => waehlen(null)} /></header>
      <p>{details.liveZeile}</p><p>{details.anbieter} · {details.modell}{details.arbeitskopie && ` · Arbeitskopie ${details.arbeitskopie}`}</p>
    </aside>}
  </section>;
}

export default function Team() {
  const [quelle] = useState(() => new BeispielQuelle());
  const [daten, setDaten] = useState(() => quelle.lesen()), [auswahl, waehlen] = useState<string | null>(null);
  const bereich = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (auswahl) bereich.current?.querySelector(`[data-agent="${auswahl}"]`)?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [auswahl]);
  return <div className="team-spalte" ref={bereich}><TeamAnsicht daten={daten} auswahl={auswahl} waehlen={waehlen} aendern={neu => { quelle.aktualisieren(neu); setDaten(quelle.lesen()); }} /></div>;
}
