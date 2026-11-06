import { Check, CircleX, ListTodo, Zap } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import "./bausteine2.css";

export type KachelProps = { titel: string; zahl?: string; unterzeile: string; thema?: "aufgaben" | "tests" | "tokens"; zustand?: "wert" | "laedt" | "leer" | "fehler"; balken?: number; grafik?: ReactNode; onWiederholen?: () => void };
export function Kachel({ titel, zahl, unterzeile, thema = "tests", zustand = "wert", balken, grafik, onWiederholen }: KachelProps) {
  const farbe = thema === "tests" ? "status-fertig" : "akzent", Symbol = thema === "tests" ? Check : thema === "tokens" ? Zap : ListTodo;
  return <div className="ka" aria-busy={zustand === "laedt"} style={{ "--thema": `var(--${farbe})`, "--glanz": `var(--${farbe}-grund)` } as CSSProperties}>
    <span className="ka-kopf"><span className="ka-sym"><Symbol size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span><span className="ka-titel">{titel}</span></span>
    {zustand === "laedt" ? <span className="ka-platzhalter" aria-hidden="true"><span /><span /></span> : zustand === "fehler" ? <span className="ka-fehler"><CircleX size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />Nicht geladen</span> : <><span className={`ka-zahl${zustand === "leer" ? " ka-leer" : ""}`}>{zustand === "leer" ? "–" : zahl}</span>{zustand === "wert" && (grafik ?? (balken !== undefined && <span className="ka-balken" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, balken))}%` }} /></span>))}</>}
    <span className="ka-unter">{zustand === "fehler" ? <button type="button" className="b2-kn" onClick={onWiederholen}>Erneut versuchen</button> : zustand === "laedt" ? "Lädt …" : unterzeile}</span>
  </div>;
}
