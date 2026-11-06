import { Check, ChevronRight, Circle, CircleDashed, CircleX } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Zeitspur, type ZeitspurProps } from "./Zeitspur";

export type AgentenkarteProps = { name: string; modell: string; zustand: "offen" | "arbeitet" | "wartet" | "fertig" | "problem"; fortschritt?: number; zeitspur: ZeitspurProps; zeile: string; tokens: string; laufzeit: string; gewaehlt?: boolean; onDetails?: () => void; aktion?: string; onAktion?: () => void };
export function Agentenkarte({ name, modell, zustand, fortschritt, zeitspur, zeile, tokens, laufzeit, gewaehlt, onDetails, aktion, onAktion }: AgentenkarteProps) {
  const tippId = useId();
  const wort = { offen: "Offen", arbeitet: "Arbeitet", wartet: "Wartet auf dich", fertig: "Fertig", problem: "Problem" }[zustand];
  const Symbol = { offen: Circle, arbeitet: CircleDashed, wartet: Circle, fertig: Check, problem: CircleX }[zustand];
  const vorher = useRef(zustand), [meldung, setMeldung] = useState("");
  useEffect(() => { if (vorher.current !== zustand) { setMeldung(`${name}: ${wort}`); vorher.current = zustand; } }, [zustand, name, wort]);
  return <div className={`ak ${zustand}${gewaehlt ? " gewaehlt" : ""}`} style={{ "--glanz": `var(--status-${zustand}-grund)`, "--zustand": `var(--status-${zustand})` } as CSSProperties}>
    <button type="button" className="ak-kopf" onClick={onDetails} aria-expanded={!!gewaehlt} aria-describedby={tippId}>
      <span className="rg" role="img" aria-label={fortschritt === undefined ? "Fortschritt unbekannt" : `${fortschritt} Prozent fertig`}><svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle className="rg-spur" cx="22" cy="22" r="20.25" fill="none" strokeWidth="3.5" /><circle className="rg-bogen" cx="22" cy="22" r="20.25" fill="none" stroke="var(--zustand)" strokeWidth="3.5" strokeLinecap="round" pathLength="100" strokeDasharray="100" opacity={fortschritt === undefined ? 0 : 1} strokeDashoffset={100 - Math.max(0, Math.min(100, fortschritt ?? 0))} transform="rotate(-90 22 22)" /></svg><span className="rg-mitte">{zustand === "fertig" ? <Check size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /> : fortschritt === undefined ? "–" : `${fortschritt} %`}</span></span>
      <span className="ak-name"><b>{name}</b><span>{modell}</span></span><span className="mk"><Symbol className={zustand === "arbeitet" ? "b2-dreht" : ""} fill={zustand === "wartet" ? "currentColor" : "none"} size={12} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /><span>{wort}</span></span><ChevronRight className="ak-pfeil" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
    </button><span className="b2-tipp ak-tipp" id={tippId} role="tooltip">{name}</span>
    <Zeitspur {...zeitspur} />
    <div className="ak-fuss"><span className={zeitspur.zustand === "startet" || zustand === "wartet" ? "ak-zeile" : "code"} title={zeile}>{zeile}</span>{aktion ? <button type="button" className={`b2-kn${zustand === "wartet" ? " b2-zweit" : ""}`} onClick={onAktion}>{aktion}</button> : <><span>{tokens} Tokens</span><span>{laufzeit} min</span></>}</div>
    <span className="b2-sr" aria-live="polite">{meldung}</span>
  </div>;
}
