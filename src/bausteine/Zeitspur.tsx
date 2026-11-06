import { Check, CircleX, GitPullRequest, MessageCircleQuestion, Play } from "lucide-react";
import type { CSSProperties } from "react";
import "./bausteine2.css";

export type Phase = { art: "lesen" | "koordiniert" | "bauen" | "testen" | "review"; name: string; start: number; ende: number; laufend?: boolean };
export type Ereignis = { zeit: number; art: "problem" | "frage" | "fertig" | "pr" | "start"; text: string };
export type ZeitspurProps = { phasen: Phase[]; zustand?: "arbeitet" | "wartet" | "fertig" | "problem" | "startet"; jetzt: number; von?: number; bis?: number; schaetzung?: number; wartebeginn?: number; wartezeit?: string; ereignisse?: Ereignis[]; zeitursprung?: string };
export function Zeitspur({ phasen, zustand = "arbeitet", jetzt, von = 0, bis = 600, schaetzung, wartebeginn = jetzt, wartezeit = "0:00", ereignisse = [], zeitursprung = "2026-11-06T14:30:00" }: ZeitspurProps) {
  const prozent = (t: number) => Math.max(0, Math.min(100, (t - von) / Math.max(1, bis - von) * 100));
  const lage = (start: number, ende: number) => ({ left: `${prozent(start)}%`, width: `max(0px, calc(${Math.max(0, prozent(ende) - prozent(start))}% - var(--abstand-1) / 2))` });
  const uhr = (t: number) => new Date(new Date(zeitursprung).getTime() + t * 1000).toLocaleTimeString("de-DE");
  const dauer = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const ueber = zustand === "arbeitet" && schaetzung !== undefined && schaetzung <= jetzt;
  return <span className="zs" role="group" aria-label={`Zeitspur: ${zustand === "wartet" ? "Wartet auf dich" : zustand === "fertig" ? "Fertig" : zustand === "problem" ? "Problem" : zustand === "startet" ? "Startet" : "Arbeitet"}`}>
    {zustand !== "startet" && phasen.map((p, i) => {
      const text = `${p.name} · ${dauer(Math.max(0, p.ende - p.start))} min · ${uhr(p.start)} bis ${uhr(p.ende)}`;
      return <span className="zs-huelle" key={`${p.start}-${i}`}><span role="img" tabIndex={0} aria-label={text} className={`zs-stueck${i === 0 ? " zs-l" : ""}${i === phasen.length - 1 && zustand !== "wartet" && !(schaetzung && schaetzung > jetzt && zustand === "arbeitet") ? " zs-r" : ""}${p.laufend && zustand === "arbeitet" ? " zs-lebt" : ""}`} style={{ ...lage(p.start, p.ende), "--a": `var(--phase-${p.art})`, "--b": `var(--phase-${p.art}-ende)` } as CSSProperties}>
        <span className="zs-text" ref={el => { if (!el) return; const messen = () => { if (!el.isConnected) return; el.style.visibility = el.scrollWidth + 20 > el.parentElement!.clientWidth ? "hidden" : "visible"; }; const observer = new ResizeObserver(messen); observer.observe(el.parentElement!); void document.fonts.ready.then(messen); messen(); return () => observer.disconnect(); }}>{p.name}</span>
      </span><span className="b2-tipp" role="tooltip">{text}</span></span>;
    })}
    {zustand === "arbeitet" && schaetzung !== undefined && schaetzung > jetzt && <span className="zs-schaetzung" style={lage(jetzt, schaetzung)}>~{Math.max(1, Math.round((schaetzung - jetzt) / 60))} min</span>}
    {zustand === "wartet" && <span className="zs-wartet" style={lage(wartebeginn, jetzt)}>Wartet {wartezeit}</span>}
    {(zustand === "startet" || ueber) && <span className={ueber ? "zs-ueber" : "zs-hinweis"} style={ueber ? { left: `calc(${prozent(jetzt)}% + var(--abstand-2))` } : { right: `calc(${100 - prozent(jetzt)}% + var(--abstand-2))` }}>{ueber ? "Dauert länger als geschätzt" : "Startet …"}</span>}
    {ereignisse.map((e, i) => { const Symbol = { problem: CircleX, frage: MessageCircleQuestion, fertig: Check, pr: GitPullRequest, start: Play }[e.art]; return <span key={i} className={`zs-ereignis zs-${e.art}`} title={`${e.text} · ${uhr(e.zeit)}`} style={{ left: `calc(${prozent(e.zeit)}% - var(--abstand-4) * .75)` }}><Symbol size={12} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /><span className="b2-sr">{e.text}</span></span>; })}
    <span className="zs-jetzt" aria-hidden="true" style={{ left: `${prozent(jetzt)}%` }} />
  </span>;
}
