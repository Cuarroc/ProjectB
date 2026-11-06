import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Circle, CircleDot, Folder, IdCard } from "lucide-react";
import { chatEingabeQuelle } from "./ChatEingabe";
import { PostfachKnopf } from "./PostfachKnopf";
import "./Kopf.css";
import Berechtigungen from "./Berechtigungen";

export type Bewegung = "auto" | "voll" | "reduziert";
export function bewegungSetzen(wahl: Bewegung, wurzel = document.documentElement) { wurzel.dataset.bewegung = wahl; }
export function bewegungAktuell(wahl: Bewegung, reduziert: boolean) { return wahl === "auto" ? (reduziert ? "reduziert" : "voll") : wahl; }
const symbol = { size: 16, strokeWidth: 1.5, absoluteStrokeWidth: true, "aria-hidden": true } as const;

function KopfMenue({ name, inhalt, children, klasse = "", beschriftung = name }: { name: string; inhalt: ReactNode; children: ReactNode; klasse?: string; beschriftung?: string }) {
  const [offen, zeige] = useState(false), ort = useRef<HTMLDivElement>(null), knopf = useRef<HTMLButtonElement>(null);
  const fokus = (i: number) => { const alle = ort.current?.querySelectorAll<HTMLButtonElement>("[role^=menuitem]"); if (alle?.length) alle[(i + alle.length) % alle.length].focus(); };
  const zu = () => { zeige(false); knopf.current?.focus(); };
  useEffect(() => {
    if (!offen) return;
    (ort.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? ort.current?.querySelector<HTMLButtonElement>('[role^=menuitem]'))?.focus();
    const daneben = (e: PointerEvent) => { if (!ort.current?.contains(e.target as Node)) zeige(false); };
    document.addEventListener("pointerdown", daneben); return () => document.removeEventListener("pointerdown", daneben);
  }, [offen]);
  return <div className={`kopf-anker ${klasse}`} ref={ort} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) zeige(false); }}>
    <button ref={knopf} type="button" className="kopf-knopf" aria-label={name === "ProjectB" ? undefined : beschriftung} aria-haspopup="menu" aria-expanded={offen}
      onClick={() => zeige(!offen)} onKeyDown={e => { if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); zeige(true); } }}>{inhalt}</button>
    {offen && <div className="kopf-menue" role="menu" aria-label={name} onClick={e => { if ((e.target as Element).closest('[role^=menuitem]:not([aria-disabled=true])')) zu(); }} onKeyDown={e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); zu(); }
      if (e.key === "Tab") setTimeout(() => zeige(false), 0);
      const i = [...e.currentTarget.querySelectorAll("button")].indexOf(document.activeElement as HTMLButtonElement);
      const ziel = e.key === "Home" ? 0 : e.key === "End" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : null;
      if (ziel !== null) { e.preventDefault(); fokus(ziel); }
    }}>{children}</div>}
  </div>;
}

export default function Kopf() {
  const [daten, setDaten] = useState(() => chatEingabeQuelle.lesen()), [projekt, waehleProjekt] = useState(daten.kopf.pfad);
  const [bewegung, waehleBewegung] = useState<Bewegung>("auto"), [ruhig, setRuhig] = useState(false);
  useEffect(() => chatEingabeQuelle.abonnieren(() => setDaten(chatEingabeQuelle.lesen())), []);
  useEffect(() => { bewegungSetzen(bewegung); }, [bewegung]);
  useEffect(() => { const m = matchMedia("(prefers-reduced-motion: reduce)"), lesen = () => setRuhig(m.matches); lesen();
    m.addEventListener("change", lesen); return () => m.removeEventListener("change", lesen); }, []);
  const aktuell = bewegungAktuell(bewegung, ruhig) === "voll" ? "Voll" : "Reduziert";
  return <header className="app-kopf kopf">
    <h1 className="kopf-sr">ProjectB</h1>
    <KopfMenue name="ProjectB" klasse="kopf-logo" inhalt={<><span className="kopf-marke" aria-hidden="true">P</span><strong>ProjectB</strong><ChevronDown {...symbol} /></>}>
      <div className="kopf-menue-titel"><h2 role="presentation">Bewegung</h2><span>Wie lebendig die App sich bewegt.</span></div>
      <div className="kopf-bewegung" role="group" aria-label="Bewegung">{(["auto", "voll", "reduziert"] as const).map(w => <button key={w} type="button" role="menuitemradio" tabIndex={-1}
        aria-checked={bewegung === w} onClick={() => waehleBewegung(w)} className={`kopf-wahl kopf-${w}`}>
        <span className="kopf-wahl-titel">{bewegung === w ? <CircleDot {...symbol} /> : <Circle {...symbol} />}{w === "auto" ? "Automatisch (wie Windows)" : w === "voll" ? "Voll" : "Reduziert"}{w === "auto" && <span className="kopf-gerade">{aktuell}</span>}</span>
        {w !== "auto" && <><span className="kopf-probe"><span /></span><span>{w === "voll" ? "Flüssig, mit Glanz und weichen Übergängen" : "Ruhiger, ohne Dauer-Animationen"}</span></>}
      </button>)}</div>
    </KopfMenue>
    <KopfMenue name="Projekt wählen" klasse="kopf-projekt" beschriftung={`Projekt wählen: ${projekt} ${daten.kopf.zweig}`} inhalt={<><Folder {...symbol} /><code>{projekt}</code>{" "}<code className="kopf-zweig">{daten.kopf.zweig}</code><ChevronDown {...symbol} /></>}>
      <h2 role="presentation">Projekt wählen</h2>{daten.kopf.projekte.map(p => <button key={p} type="button" role="menuitemradio" tabIndex={-1} aria-checked={projekt === p} onClick={() => waehleProjekt(p)}>{p}</button>)}
    </KopfMenue>
    <div className="kopf-kontingent" role="group" aria-label={`Kontingent diese Woche · Genutzt · Weiße Marke: Soll ${daten.kopf.kontingent.soll} %`}>
      {(["claude", "codex"] as const).map(a => <span className="kopf-nutzung" key={a} aria-label={`${a === "claude" ? "Claude" : "Codex"}: Genutzt ${daten.kopf.kontingent[a]} %, Soll ${daten.kopf.kontingent.soll} %`}>
        {a === "claude" ? "Claude" : "Codex"}<span className="kopf-balken" aria-hidden="true"><span style={{ width: `${daten.kopf.kontingent[a]}%` }} /><i className="kopf-soll" style={{ left: `${daten.kopf.kontingent.soll}%` }} /></span><b>{daten.kopf.kontingent[a]} %</b>
      </span>)}
    </div>
    <Berechtigungen daten={daten.berechtigungen} quelle={chatEingabeQuelle} />
    <PostfachKnopf zahl={daten.kopf.postfach} />
    <KopfMenue name="Rollen" klasse="kopf-rollen" inhalt={<><IdCard {...symbol} /><span>Rollen</span></>}>
      <h2 role="presentation">Rollen</h2>{["Orchestrator", "Arbeiter Codex", "Prüfer Claude"].map(r => <button type="button" role="menuitem" aria-disabled="true" tabIndex={-1} key={r}>{r}</button>)}
    </KopfMenue>
  </header>;
}
