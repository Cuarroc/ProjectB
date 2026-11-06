import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Circle, CircleX, Info, X } from "lucide-react";
import { Knopf } from "./Knopf";
import { tokenMs, Tooltip } from "./Tooltip";
import "./meldungen.css";

export type Meldung = { id: string; art: "info" | "wartet" | "problem"; agent: string; titel: string; zeile: string; handlung?: string; onHandlung?: () => void };
type Eintrag = Meldung & { schluessel: string[]; weg?: boolean; anzahl: number; rest: number; start: number; pausen: Set<string>; timer?: ReturnType<typeof setTimeout> };
const ansage = (m: Meldung) => `${m.titel.includes(m.agent) ? "" : `${m.agent}: `}${m.titel}: ${m.zeile}`;
export class ToastSpeicher {
  vorSchliessen?: (id: string) => void;
  private daten = { aktiv: [] as Eintrag[], wartend: [] as Meldung[], hoeflich: "", dringend: "" };
  private leser = new Set<() => void>(); private verborgen = false;
  constructor(private ms = tokenMs, private protokollOeffnen?: () => void) {}
  bild = () => this.daten;
  abonnieren = (fn: () => void) => { this.leser.add(fn); return () => { this.leser.delete(fn); }; };
  private neu() { this.daten = { ...this.daten, aktiv: [...this.daten.aktiv], wartend: [...this.daten.wartend] }; this.leser.forEach(fn => fn()); }
  melden(m: Meldung) {
    const schluessel = ansage(m); if (this.daten.aktiv.some(x => x.schluessel.includes(schluessel)) || this.daten.wartend.some(x => ansage(x) === schluessel)) return;
    this.daten[m.art === "wartet" ? "dringend" : "hoeflich"] = schluessel;
    const info = this.daten.aktiv.find(x => x.art === "info" && !x.weg);
    if (this.daten.aktiv.length === 3 && info) {
      if (m.art === "info") { clearTimeout(info.timer); info.schluessel.push(schluessel); Object.assign(info, m, { id: info.id, anzahl: info.anzahl + 1, titel: `${info.anzahl + 1} neue Meldungen`, zeile: `Zuletzt: ${m.titel}. ${m.zeile}`, handlung: this.protokollOeffnen ? "Protokoll öffnen" : undefined, onHandlung: this.protokollOeffnen, rest: this.ms("standzeit-toast-info"), timer: undefined }); this.weiter(info); this.neu(); return; }
      this.vorSchliessen?.(info.id); clearTimeout(info.timer); this.daten.aktiv = this.daten.aktiv.filter(x => x !== info);
    }
    this.daten.wartend.push(m); this.fuellen(); this.neu();
  }
  private fuellen() {
    while (this.daten.aktiv.length < 3 && this.daten.wartend.length) {
      const m = this.daten.wartend.shift()!, x: Eintrag = { ...m, schluessel: [ansage(m)], anzahl: 1, rest: this.ms("standzeit-toast-info"), start: 0, pausen: new Set() };
      this.daten.aktiv.push(x); this.weiter(x);
    }
  }
  private weiter(x: Eintrag) { if (x.art === "info" && !x.weg && !x.pausen.size && !this.verborgen && !x.timer) { x.start = Date.now(); x.timer = setTimeout(() => this.schliessen(x.id), x.rest); } }
  pause(id: string, grund: string, an: boolean) {
    const x = this.daten.aktiv.find(x => x.id === id); if (!x || x.weg) return;
    if (x.timer) { clearTimeout(x.timer); x.timer = undefined; x.rest = Math.max(0, x.rest - (Date.now() - x.start)); }
    if (an) x.pausen.add(grund); else x.pausen.delete(grund); this.weiter(x);
  }
  hintergrund(an: boolean) { this.verborgen = an; this.daten.aktiv.forEach(x => this.pause(x.id, "fenster", an)); }
  schliessen(id: string) {
    const x = this.daten.aktiv.find(x => x.id === id); if (!x || x.weg) return; this.vorSchliessen?.(id); clearTimeout(x.timer); x.weg = true; this.neu();
    const entfernen = () => { this.daten.aktiv = this.daten.aktiv.filter(t => t !== x); for (const art of ["hoeflich", "dringend"] as const) if (x.schluessel.includes(this.daten[art])) this.daten[art] = ""; this.fuellen(); this.neu(); };
    const dauer = this.ms("dauer-kurz"); if (dauer === 0) entfernen(); else x.timer = setTimeout(entfernen, dauer);
  }
}
export function Toast({ speicher, vorschau = false, dialog, fokusZiel }: { speicher: ToastSpeicher; vorschau?: boolean; dialog?: HTMLDialogElement; fokusZiel?: () => void }) {
  const bild = useSyncExternalStore(speicher.abonnieren, speicher.bild, speicher.bild), stapel = useRef<HTMLDivElement>(null);
  useEffect(() => { const sicht = () => speicher.hintergrund(document.hidden); sicht(); document.addEventListener("visibilitychange", sicht); return () => { document.removeEventListener("visibilitychange", sicht); speicher.hintergrund(true); }; }, [speicher]);
  useEffect(() => { speicher.vorSchliessen = (id: string) => {
    const el = stapel.current?.querySelector<HTMLElement>(`[data-toast-id="${CSS.escape(id)}"]`);
    if (el?.contains(document.activeElement)) { const knoepfe = [...stapel.current!.querySelectorAll<HTMLButtonElement>(".to:not(.weg) [data-zu]")], i = knoepfe.findIndex(kn => el.contains(kn)), ziel = knoepfe[i + 1] ?? knoepfe[i - 1]; if (ziel) ziel.focus(); else if (fokusZiel) fokusZiel(); else stapel.current?.focus(); }
  }; return () => { speicher.vorSchliessen = undefined; }; }, [speicher, fokusZiel]);
  const live = <><span className="meldungen-sr" aria-live="polite" aria-atomic="true">{bild.hoeflich}</span><span className="meldungen-sr" aria-live="assertive" aria-atomic="true">{bild.dringend}</span></>;
  return <>{dialog ? createPortal(live, dialog) : live}<div ref={stapel} tabIndex={-1} aria-label="Meldungen" className={`to-stapel ${vorschau ? "to-vorschau" : ""}`} hidden={!!dialog}>
    {bild.aktiv.map(m => { const Symbol = m.art === "info" ? Info : m.art === "wartet" ? Circle : CircleX; return <div key={m.id} data-toast-id={m.id} data-art={m.art} className={`to auf-3 ${m.weg ? "weg" : ""}`} inert={m.weg} onPointerEnter={() => speicher.pause(m.id, "hover", true)} onPointerLeave={() => speicher.pause(m.id, "hover", false)} onFocus={() => speicher.pause(m.id, "fokus", true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) speicher.pause(m.id, "fokus", false); }}>
      <span className="to-sym"><Symbol size={m.art === "wartet" ? 12 : 16} strokeWidth={1.5} absoluteStrokeWidth fill={m.art === "wartet" ? "currentColor" : "none"} aria-hidden="true" /></span><div className="to-text"><p className="to-titel">{m.titel}</p><p className="to-zeile">{m.zeile}</p>{m.handlung && <Knopf className="to-handlung" text={m.handlung} variante={m.art === "wartet" ? "antwort" : "leise"} onClick={() => { m.onHandlung?.(); if (m.art === "wartet") speicher.schliessen(m.id); }} />}</div><Tooltip text="Schließen"><button className="knopf kn kn-leise kn-symbol" type="button" data-variante="leise" data-symbol aria-label="Schließen" data-zu onClick={() => speicher.schliessen(m.id)}><X size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></button></Tooltip>
    </div>; })}{bild.wartend.length > 0 && <p className="to-mehr">{bild.wartend.length} weitere Meldungen warten. Sie erscheinen, sobald Platz ist.</p>}
  </div></>;
}
