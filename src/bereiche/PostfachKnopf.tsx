import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { postfach } from "../daten/postfach";
import type { BeispielQuelle } from "../daten/quelle";
import type { Datenstand } from "../daten/typen";
import "./ChatListe.css";

export function PostfachKnopf({ daten, quelle }: { daten: Datenstand; quelle: BeispielQuelle }) {
  const { zahl, eintraege } = postfach(daten), inhaltId = useId();
  const [offen, zeige] = useState(false), wartet = zahl === 1 ? "wartet" : "warten";
  const [ziel, setZiel] = useState<string | null>(null);
  const ort = useRef<HTMLDivElement>(null), knopf = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (ziel === null) return;
    const nachricht = document.getElementById(`nachricht-${ziel}`);
    nachricht?.focus({ preventScroll: true }); nachricht?.scrollIntoView({ block: "center", behavior: "instant" });
    setZiel(null);
  }, [ziel]);
  useEffect(() => { if (!offen) return; const daneben = (e: PointerEvent) => { if (!ort.current?.contains(e.target as Node)) zeige(false); };
    document.addEventListener("pointerdown", daneben); return () => document.removeEventListener("pointerdown", daneben); }, [offen]);
  return <div className="postfach-anker" ref={ort} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) zeige(false); }} onKeyDown={e => { if (e.key === "Escape") { zeige(false); knopf.current?.focus(); } }}><button ref={knopf} type="button" className="rand-postfach" aria-expanded={offen} aria-controls={inhaltId} onClick={() => zeige(!offen)}
    aria-label={zahl ? `Postfach ${zahl > 99 ? "99+, " : ""}${zahl} ${wartet} auf dich` : "Postfach"}>
    <Mail size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />Postfach{" "}
    {zahl > 0 && <span className="rand-zaehler" aria-hidden="true">{zahl > 99 ? "99+" : zahl}</span>}
  </button>{offen && <div id={inhaltId} className="postfach-inhalt">
    {eintraege.length ? <ul className="postfach-eintraege">{eintraege.map(e => <li key={`${e.chatId}/${e.nachrichtId}`}>
      <button type="button" className="postfach-eintrag" onClick={() => {
        quelle.aktualisieren({ ...quelle.lesen(), aktiverChatId: e.chatId }); zeige(false); setZiel(e.nachrichtId);
      }}><span>{e.text}</span><span>{e.titel}</span></button>
    </li>)}</ul> : <p role="status">{zahl ? `${zahl} ${wartet} auf dich.` : "Nichts wartet auf dich."}</p>}
  </div>}</div>;
}
