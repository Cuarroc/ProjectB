import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type HTMLAttributes } from "react";
import { createPortal } from "react-dom";
import "./meldungen.css";

export function tokenMs(name: string) {
  const wert = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return parseFloat(wert) * (wert.endsWith("ms") ? 1 : 1000) || 0;
}
type Anzeige = (offen: boolean, sofort: boolean) => void;
export class TooltipZeit {
  private zuletzt = -Infinity; private timer?: ReturnType<typeof setTimeout>; private sichtbar?: Anzeige; private wartend?: Anzeige;
  constructor(private ms = tokenMs) {}
  an(zeige: Anzeige) {
    this.abbrechen(); const sofort = !!this.sichtbar || Date.now() - this.zuletzt < this.ms("fenster-tooltip-wechsel");
    const auf = () => { this.zu(); this.sichtbar = zeige; zeige(true, sofort); };
    if (sofort) auf(); else { this.wartend = zeige; this.timer = setTimeout(auf, this.ms("verzoegerung-tooltip")); }
  }
  abbrechen(zeige?: Anzeige) { if (!zeige || this.wartend === zeige) { clearTimeout(this.timer); this.wartend = undefined; } }
  zu(zeige?: Anzeige) { this.abbrechen(zeige); if (zeige && this.sichtbar !== zeige) return; if (this.sichtbar) { this.sichtbar(false, false); this.sichtbar = undefined; this.zuletzt = Date.now(); } }
  taste(e: Pick<KeyboardEvent, "key" | "preventDefault" | "stopPropagation">) { if (e.key === "Escape" && this.sichtbar) { e.preventDefault(); e.stopPropagation(); this.zu(); } }
}
const tooltipZeit = new TooltipZeit();
export function Tooltip({ text, children, code = false }: { text: string; children: ReactElement<HTMLAttributes<HTMLElement>>; code?: boolean }) {
  const id = useId(), ausloeser = useRef<HTMLSpanElement>(null), tipp = useRef<HTMLSpanElement>(null);
  const [zustand, setZustand] = useState({ offen: false, sofort: false }), [lage, setLage] = useState({ left: 0, top: 0, oben: true });
  const bleibt = useRef({ maus: false, tipp: false, fokus: false, gesperrt: false });
  const zuTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const zeige = useRef<Anzeige>((offen, sofort) => setZustand({ offen, sofort })).current;
  const an = () => { clearTimeout(zuTimer.current); if (!bleibt.current.gesperrt && !zustand.offen) tooltipZeit.an(zeige); };
  const aus = () => { if (!bleibt.current.fokus) tooltipZeit.abbrechen(zeige); clearTimeout(zuTimer.current); zuTimer.current = setTimeout(() => { if (!bleibt.current.maus && !bleibt.current.tipp && !bleibt.current.fokus) { bleibt.current.gesperrt = false; tooltipZeit.zu(zeige); } }, tokenMs("dauer-druck")); };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (zustand.offen && e.key === "Escape") { bleibt.current.gesperrt = true; tooltipZeit.taste(e); } };
    document.addEventListener("keydown", esc, true); return () => document.removeEventListener("keydown", esc, true);
  }, [zustand.offen]);
  useEffect(() => () => { clearTimeout(zuTimer.current); tooltipZeit.zu(zeige); }, [zeige]);
  useLayoutEffect(() => {
    if (!zustand.offen) return;
    const messen = () => {
      const a = ausloeser.current!.getBoundingClientRect(), t = tipp.current!, rand = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--abstand-2")), luecke = rand * .75;
      const oben = a.top - luecke - t.offsetHeight >= rand;
      setLage({ oben, left: Math.max(rand, Math.min(a.left + a.width / 2 - t.offsetWidth / 2, innerWidth - rand - t.offsetWidth)), top: Math.max(rand, oben ? a.top - luecke - t.offsetHeight : Math.min(a.bottom + luecke, innerHeight - rand - t.offsetHeight)) });
    };
    messen(); window.addEventListener("resize", messen); window.addEventListener("scroll", messen, true);
    return () => { window.removeEventListener("resize", messen); window.removeEventListener("scroll", messen, true); };
  }, [zustand.offen, text]);
  return <span className="tt-ausloeser" ref={ausloeser} onPointerEnter={() => { bleibt.current.maus = true; an(); }} onPointerLeave={() => { bleibt.current.maus = false; aus(); }} onFocus={e => { if (e.target.matches(":focus-visible")) { bleibt.current.fokus = true; an(); } }} onBlur={() => { bleibt.current.fokus = false; aus(); }}>
    {cloneElement(children, { "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" "), title: undefined })}
    {typeof document !== "undefined" && createPortal(<span ref={tipp} id={id} role="tooltip" className={`tt ${lage.oben ? "oben" : "unten"} ${zustand.offen ? "offen" : ""} ${zustand.sofort ? "sofort" : ""} ${code ? "code" : ""}`} style={{ left: lage.left, top: lage.top }} onPointerEnter={() => { clearTimeout(zuTimer.current); bleibt.current.tipp = true; }} onPointerLeave={() => { bleibt.current.tipp = false; aus(); }}>{text}</span>, ausloeser.current?.closest("dialog") ?? document.body)}
  </span>;
}
