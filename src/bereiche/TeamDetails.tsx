import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { FileText, MessageCircle, X } from "lucide-react";
import { Knopf } from "../bausteine/Knopf";
import { Fortschrittsring } from "../bausteine/Fortschrittsring";
import { Statusmarke } from "../bausteine/Statusmarke";
import { Zeitspur } from "../bausteine/Zeitspur";
import type { Agent, Datenstand } from "../daten/typen";
import { orchestratorBeispiel } from "../daten/quelle";
import { agentenTestverlauf } from "../daten/beispiel";
import { spur } from "./TeamAnsichten";
import "./TeamDetails.css";

const status = { Arbeitet: "arbeitet", "Wartet auf dich": "wartet", Fertig: "fertig", Problem: "problem" } as const;
const dauer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
export const belegFuer = (daten: Datenstand, id: string) => daten.belege.find(b => b.agentId === id && b.prLink.trim());
export const mitBeleg = (daten: Datenstand): Datenstand => ({ ...daten, agenten: daten.agenten.map(a => a.zustand === "Fertig" && !belegFuer(daten, a.id)
  ? { ...a, zustand: "Problem", liveZeile: "Beleg mit PR-Link fehlt" } : a) });

export function TeamDetails({ agent, daten, schliessen }: { agent: Agent; daten: Datenstand; schliessen: () => void }) {
  const bereich = useRef<HTMLElement>(null), [vorschau, zeige] = useState<string | null>(null);
  const vorschauBereich = useRef<HTMLElement>(null), vorschauKnopf = useRef<HTMLButtonElement>(null);
  const zustand = status[agent.zustand], beleg = belegFuer(daten, agent.id);
  const zeitspur = agent.id === "orchestrator" ? { jetzt: orchestratorBeispiel.laufzeitSekunden, phasen: [...orchestratorBeispiel.phasen] } : spur(agent);
  const ausgaben = daten.ausgaben.filter(a => a.sitzungId === agent.id);
  const phase = agent.id === "orchestrator" ? "koordiniert" : zeitspur.phasen.find(p => "laufend" in p && p.laufend)?.art;
  const taetigkeit = phase && { lesen: "liest", koordiniert: "koordiniert", bauen: "baut", testen: "testet", review: "prüft" }[phase];
  const rot = agent.tests?.verlauf.find(p => p.rot > 0);
  const testpunkte = agentenTestverlauf[agent.id] ?? [], testzeit = (zeit: string) => Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3));
  const testX = (zeit: string) => 20 + (testzeit(zeit) - testzeit(testpunkte[0]?.zeit ?? zeit)) / Math.max(1, testzeit(testpunkte.at(-1)?.zeit ?? zeit) - testzeit(testpunkte[0]?.zeit ?? zeit)) * 195;
  useLayoutEffect(() => {
    zeige(null);
    const spalte = bereich.current?.closest(".team-bereich");
    const karte = [...spalte?.querySelectorAll<HTMLElement>(`[data-agent="${agent.id}"]`) ?? []].find(el => el.getClientRects().length);
    const liste = karte?.closest<HTMLElement>(".team-liste"), achse = liste?.querySelector<HTMLElement>(".team-achse");
    if (liste && achse) {
      liste.style.scrollPaddingTop = `${achse.offsetHeight + parseFloat(getComputedStyle(liste).gap)}px`;
      liste.style.paddingBottom = `${liste.clientHeight}px`;
    }
    karte?.scrollIntoView({ block: "start", behavior: "instant" });
    bereich.current?.focus({ preventScroll: true });
    return () => { if (liste) { liste.style.scrollPaddingTop = ""; liste.style.paddingBottom = ""; } };
  }, [agent.id]);
  useLayoutEffect(() => { if (vorschau) { vorschauBereich.current?.scrollIntoView({ block: "nearest" }); vorschauBereich.current?.focus({ preventScroll: true }); } }, [vorschau]);
  const zu = () => {
    const knopf = [...bereich.current?.closest(".team-bereich")?.querySelectorAll<HTMLElement>(`[data-agent="${agent.id}"] [aria-expanded="true"]`) ?? []].find(el => el.getClientRects().length);
    schliessen(); knopf?.focus({ preventScroll: true });
  };
  const oeffnen = (e: React.MouseEvent<HTMLButtonElement>, inhalt: string) => { vorschauKnopf.current = e.currentTarget; zeige(inhalt); };
  return <aside id="team-details" ref={bereich} tabIndex={-1} className="team-details" aria-label={`Details: ${agent.name}`} style={{ "--detail-glanz": `var(--status-${zustand}-grund)` } as CSSProperties}
    onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); zu(); } }}>
    <div className="tm-det">
      <header className="tm-det-kopf"><Fortschrittsring wert={agent.zustand === "Problem" || agent.id === "orchestrator" ? undefined : agent.fortschritt} zustand={zustand} />
        <div className="tm-det-titel"><h3>{agent.name}</h3><p>{agent.anbieter} · {agent.modell}{agent.arbeitskopie && <> · Arbeitskopie <span className="tm-arbeitskopie">{agent.arbeitskopie}</span></>}</p></div>
        <Knopf text="Schließen" symbol={X} nurSymbol variante="leise" onClick={zu} /></header>
      <div className="tm-det-leiste"><span className="tm-status"><Statusmarke zustand={zustand} />{agent.zustand === "Arbeitet" && taetigkeit && ` · ${taetigkeit}`}</span>
        <div className="tm-det-knoepfe"><Knopf text="Protokoll öffnen" symbol={FileText} onClick={e => oeffnen(e, "Protokoll")} /><Knopf text="Agent fragen" symbol={MessageCircle} onClick={e => oeffnen(e, "Agent fragen")} /></div></div>
      <section className="tm-dkarte"><h4>Kennzahlen</h4><dl className="tm-zellen">{[
        ["Fortschritt", agent.id === "orchestrator" ? "–" : `${agent.fortschritt} %`], ["Laufzeit", `${dauer(agent.laufzeitSekunden)} min`],
        ["Tokens", `${(agent.tokens / 1000).toLocaleString("de-DE")}k`], ["Fertig um", agent.schaetzung ? `~${agent.schaetzung.fertigUm}` : "–"],
      ].map(([titel, wert]) => <div key={titel}><dt>{titel}</dt><dd>{wert}{titel === "Fortschritt" && agent.id !== "orchestrator" && <progress value={agent.fortschritt} max={100} aria-label="Fortschritt" />}</dd></div>)}</dl></section>
      <div className="tm-det-raster">
        <section className="tm-dkarte"><h4>Phasen <small>Dauer in min</small></h4><Zeitspur {...zeitspur} zustand={zustand} />
          <div className="team-diagramm-zeiten"><span>{agent.phasen[0]?.start.slice(0, 5) ?? "14:30"}</span><span className="tm-jetzt">Jetzt</span><span>{agent.schaetzung ? `~${agent.schaetzung.fertigUm}` : agent.phasen.at(-1)?.ende?.slice(0, 5)}</span></div>
          <div className="tm-phasenlegende">{zeitspur.phasen.map((p, i) => <span key={i}><i style={{ background: `var(--phase-${p.art}-verlauf)` }} />{p.name} <b>{dauer(p.ende - p.start)} min</b></span>)}{agent.schaetzung && <span>Noch <b>~{agent.schaetzung.restMinuten} min</b></span>}</div></section>
        <section className="tm-dkarte"><h4>Tests{agent.tests?.gruenSeit && ` grün seit ${agent.tests.gruenSeit}`}<small>Anzahl Tests</small></h4>
          {agent.tests ? <><div className="tm-testplot" role="img" aria-label={`Testverlauf: jetzt ${agent.tests.gruen} von ${agent.tests.gesamt} grün${rot ? `, um ${rot.zeit} waren ${rot.rot} rot` : ""}`}>
            <svg viewBox="0 0 220 70" preserveAspectRatio="none" aria-hidden="true"><path d="M20 5H215M20 65H215" className="tm-gitter" />
              <polyline points={testpunkte.map(p => `${testX(p.zeit)},${65 - p.gruen / Math.max(1, agent.tests!.gesamt) * 60}`).join(" ")} />
              {rot && <circle className="tm-rotpunkt" cx={testX(rot.zeit)} cy={65 - (testpunkte.find(p => p.zeit === rot.zeit)?.gruen ?? 0) / Math.max(1, agent.tests.gesamt) * 60} r="3" />}
              <path d="M215 5V65" className="tm-jetztlinie" /><circle cx="215" cy={65 - agent.tests.gruen / Math.max(1, agent.tests.gesamt) * 60} r="3" /></svg>
            <span>{agent.tests.gesamt}</span><span className="tm-null">0</span>{rot && <b className="tm-rot">{rot.rot} rot</b>}<b className="tm-gruen">{agent.tests.gruen} / {agent.tests.gesamt}</b></div>
            <div className="team-diagramm-zeiten"><span>{rot?.zeit ?? agent.tests.gruenSeit}</span><span className="tm-jetzt">Jetzt</span></div>
            <p>{agent.tests.gruen} von {agent.tests.gesamt} grün{rot && ` · Um ${rot.zeit} waren ${rot.rot} rot, der Agent hat sie repariert`}</p></> : <p>Noch keine Tests</p>}</section>
        <section className="tm-dkarte"><h4>Dateien</h4><ul className="tm-dateien">{agent.dateien.map(d => <li key={d.pfad}><span><code>{d.pfad}</code><small>+{d.hinzugefuegt} −{d.entfernt}</small></span><Knopf text="Ansehen" onClick={e => { vorschauKnopf.current = e.currentTarget; zeige(d.pfad); }} /></li>)}</ul>{!agent.dateien.length && <p>Noch keine Dateien</p>}</section>
        <section className="tm-dkarte"><h4>Ausgaben</h4><ul className="tm-dateien">{ausgaben.map(a => <li key={a.id}><span>{a.name}<small>{a.pfad}</small></span><Knopf text="Ansehen" onClick={e => { vorschauKnopf.current = e.currentTarget; zeige(a.pfad); }} /></li>)}</ul>{!ausgaben.length && <p>Noch keine Ausgaben</p>}</section>
        {beleg && agent.zustand === "Fertig" && <section className="tm-dkarte tm-breit"><h4>Beleg</h4><p>{beleg.titel}</p><a href={beleg.prLink} target="_blank" rel="noreferrer">PR ansehen</a></section>}
        {vorschau && <section ref={vorschauBereich} tabIndex={-1} className="tm-dkarte tm-breit" aria-label="Vorschau" aria-live="polite"><h4><FileText size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /> Vorschau</h4><code>{vorschau}</code>{vorschau === "Protokoll" ? <pre>{agent.letzteZeilen.join("\n") || "Noch keine Ausgabe"}</pre> : <p>{vorschau === "Agent fragen" ? "Nachrichten an Agenten sind in dieser Vorschau noch nicht verfügbar." : "Die Vorschau dieser Beispieldatei ist noch nicht verfügbar."}</p>}<Knopf text="Vorschau schließen" variante="leise" onClick={() => { zeige(null); vorschauKnopf.current?.focus(); }} /></section>}
      </div>
    </div>
  </aside>;
}
