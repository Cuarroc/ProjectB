import { useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import "./ChatListe.css";

export function PostfachKnopf({ zahl }: { zahl: number }) {
  const [offen, zeige] = useState(false), wartet = zahl === 1 ? "wartet" : "warten";
  const ort = useRef<HTMLDivElement>(null), knopf = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!offen) return; const daneben = (e: PointerEvent) => { if (!ort.current?.contains(e.target as Node)) zeige(false); };
    document.addEventListener("pointerdown", daneben); return () => document.removeEventListener("pointerdown", daneben); }, [offen]);
  return <div className="postfach-anker" ref={ort} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) zeige(false); }} onKeyDown={e => { if (e.key === "Escape") { zeige(false); knopf.current?.focus(); } }}><button ref={knopf} type="button" className="rand-postfach" aria-expanded={offen} onClick={() => zeige(!offen)}
    aria-label={zahl ? `Postfach ${zahl > 99 ? "99+, " : ""}${zahl} ${wartet} auf dich` : "Postfach"}>
    <Mail size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />Postfach{" "}
    {zahl > 0 && <span className="rand-zaehler" aria-hidden="true">{zahl > 99 ? "99+" : zahl}</span>}
  </button>{offen && <p role="status">{zahl ? `${zahl} ${wartet} auf dich.` : "Nichts wartet auf dich."}</p>}</div>;
}
