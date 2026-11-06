import { ChevronRight } from "lucide-react";
import { Statusmarke } from "../bausteine/Statusmarke";
import { Zeitspur } from "../bausteine/Zeitspur";
import { orchestratorBeispiel, teamTokenverlauf } from "../daten/quelle";
import type { Agent, Datenstand } from "../daten/typen";
import { spur } from "./Team";
import "./TeamAnsichten.css";

type Props = { daten: Datenstand; agenten: Agent[]; waehlen: (id: string) => void; auswahl?: string | null };
const status = { Arbeitet: "arbeitet", "Wartet auf dich": "wartet", Fertig: "fertig", Problem: "problem" } as const;
const dauer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const tokens = (n: number) => `${(n / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k`;
const jetzt = orchestratorBeispiel.laufzeitSekunden;

export function TeamBoard({ daten, agenten, waehlen, auswahl }: Props) {
  const orch = { id: "orchestrator", name: "Orchestrator", anbieter: "Claude", modell: daten.chats[0]?.modell,
    zustand: agenten.filter(a => a.zustand !== "Fertig").every(a => a.liveZeile.startsWith("Angehalten.")) ? "Wartet auf dich" : "Arbeitet",
    liveZeile: `Koordiniert ${agenten.length} Agenten`, tokens: orchestratorBeispiel.tokens, laufzeitSekunden: jetzt } as Agent;
  return <div className="team-board">{["wartet", "arbeitet", "offen", "fertig"].map(z => {
    const karten = [...agenten, orch].filter(a => (a.zustand === "Problem" ? "wartet" : status[a.zustand]) === z);
    const offen = z === "offen" ? daten.plan.schritte.filter(s => s.zustand === "Offen") : [];
    return <section className={`team-feld team-feld-${z}`} key={z} aria-label={z === "offen" ? "Offen" : z === "wartet" ? "Wartet" : z === "arbeitet" ? "Arbeitet" : "Fertig"}>
      <header><Statusmarke zustand={z as "wartet" | "arbeitet" | "offen" | "fertig"} /><b>{karten.length + offen.length}</b></header>
      {karten.map(a => <button className="team-bkarte" key={a.id} data-agent={a.id} aria-expanded={auswahl === a.id} aria-controls={auswahl === a.id ? "team-details" : undefined} onClick={() => waehlen(a.id)}>
        <span className="team-bmodell">{a.anbieter} · {a.modell}</span><strong>{a.name}<ChevronRight size={16} aria-hidden="true" strokeWidth={1.5} absoluteStrokeWidth /></strong>
        <Statusmarke zustand={status[a.zustand]} />
        {a.fortschritt !== undefined && a.zustand === "Arbeitet" && <span className="team-bfortschritt"><progress max={100} value={a.fortschritt} aria-label={`Fortschritt: ${a.name}`} />{a.fortschritt} %</span>}
        <span>{daten.fragen.find(f => f.agentId === a.id)?.text ?? a.liveZeile}</span>
        <span className="team-bfuss">{tokens(a.tokens)} Tokens <span>{dauer(a.laufzeitSekunden)} min</span></span>
      </button>)}
      {offen.map(s => <div className="team-bkarte" key={s.id}><strong>{s.titel}</strong><Statusmarke zustand="offen" /><span>{s.beschreibung}</span></div>)}
    </section>;
  })}</div>;
}

export function TeamZeitstrahl({ daten, agenten, waehlen, auswahl }: Props) {
  const angehalten = agenten.filter(a => a.zustand !== "Fertig").every(a => a.liveZeile.startsWith("Angehalten."));
  const reihen = [{ id: "orchestrator", name: "Orchestrator", anbieter: daten.chats[0]?.modell, tokens: orchestratorBeispiel.tokens,
    zustand: angehalten ? "wartet" : "arbeitet", spur: { jetzt, phasen: orchestratorBeispiel.phasen.map(p => ({ ...p, laufend: p.art === "koordiniert" && !angehalten })), zustand: angehalten ? "wartet" : "arbeitet" } },
  ...agenten.map(a => ({ ...a, zustand: status[a.zustand], spur: spur(a) }))] as const;
  const phasen = reihen.flatMap(r => r.spur.phasen);
  const agTokens = agenten.reduce((summe, a) => summe + a.tokens, 0);
  const punkte = (reihe: number) => teamTokenverlauf.map((werte, i) => [i * 72 / (teamTokenverlauf.length - 1), 100 - werte.slice(0, reihe + 1).reduce((a, b) => a + b, 0) / 40 * 100]);
  const kurve = (punkte: number[][]) => punkte.map(([x, y], i) => i ? `C${(punkte[i - 1][0] + x) / 2},${punkte[i - 1][1]} ${(punkte[i - 1][0] + x) / 2},${y} ${x},${y}` : `M${x},${y}`).join(" ");
  return <div className="team-zeit">
    <section className="team-tokenplot" aria-label="Token-Diagramm">
      <h3>Tokens pro 30 s <small>In Tausend (k)</small></h3>
      <div className="team-reihen team-legende"><span><i style={{ background: "var(--reihe-agenten)" }} />Agenten <b>{tokens(agTokens)}</b></span><span><i style={{ background: "var(--reihe-orchestrator)" }} />Orchestrator <b>{tokens(orchestratorBeispiel.tokens)}</b></span><span>Zusammen <b>{tokens(agTokens + orchestratorBeispiel.tokens)}</b></span></div>
      <div className="team-plot" role="img" aria-label="Tokens pro 30 Sekunden in Tausend, von 14:30 bis Jetzt 14:37; y-Achse 0 bis 40k">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[0, 25, 50, 75, 100].map(y => <line key={y} x1={0} x2={100} y1={y} y2={y} className="team-gitter" />)}
          {[1, 0].map(i => <g key={i} style={{ color: `var(--reihe-${i ? "orchestrator" : "agenten"})` }}><defs><linearGradient id={`team-token-${i}`} x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".5" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs><path d={`${kurve(punkte(i))} L72,100 L0,100 Z`} fill={`url(#team-token-${i})`} /><path d={kurve(punkte(i))} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></g>)}
          <line x1={72} x2={72} y1={0} y2={100} stroke="var(--marke-jetzt)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg><div className="team-plot-y">{[40, 30, 20, 10, 0].map(n => <span key={n}>{n ? `${n}k` : 0}</span>)}</div><span className="team-jetzt">Jetzt</span>
      </div><div className="team-plot-x">{["14:30", "14:32", "14:34", "14:36", "14:38", "14:40"].map(t => <span key={t}>{t}</span>)}</div>
    </section>
    <section className="team-spuren" aria-label="Zeitstrahl der Agenten">
      <div className="team-achse"><span className="team-jetzt">Jetzt 14:37</span><div>{["14:30", "14:32", "14:34", "14:36", "14:38", "14:40"].map(t => <span key={t}>{t}</span>)}</div></div>
      {reihen.map(r => <div className="team-spurzeile" key={r.id} data-agent={r.id}>
        <button title={r.name} aria-expanded={auswahl === r.id} aria-controls={auswahl === r.id ? "team-details" : undefined} onClick={() => waehlen(r.id)}><strong>{r.name}</strong><span><Statusmarke zustand={r.zustand} /> · {r.anbieter}</span><b>{tokens(r.tokens)}</b></button>
        <Zeitspur {...r.spur} zustand={r.zustand} />
      </div>)}
    </section>
    <div className="team-phasenlegende" aria-label="Legende mit Dauern">{["Lesen", "Bauen", "Testen", "Review", "Koordiniert"].map(name => <span key={name}><i style={{ background: `var(--phase-${name.toLowerCase()}-verlauf)` }} />{name} <b>{dauer(phasen.filter(p => p.art === name.toLowerCase()).reduce((s, p) => s + p.ende - p.start, 0))} min</b></span>)}
      <span>Wartet auf dich <b>{dauer(agenten.filter(a => a.zustand === "Wartet auf dich").reduce((s, a) => s + jetzt - (spur(a).wartebeginn ?? jetzt), 0))} min</b></span>
      {agenten.some(a => a.schaetzung && a.zustand === "Arbeitet") && <span>Schätzung <b>~{Math.max(...agenten.filter(a => a.zustand === "Arbeitet").map(a => a.schaetzung?.restMinuten ?? 0))} min</b></span>}
    </div>
  </div>;
}
