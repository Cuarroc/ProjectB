import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Circle, CircleDot, CircleX, Folder, IdCard } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { chatEingabeQuelle } from "./ChatEingabe";
import { kontingentLesen, projektOeffnen, projektPruefen, projekteZuletzt } from "../daten/tauri";
import type { Kontingent, Kopf as KopfDaten } from "../daten/typen";
import "../bausteine/Eingabefeld.css";
import { PostfachKnopf } from "./PostfachKnopf";
import "./Kopf.css";
import Berechtigungen from "./Berechtigungen";
import { AnhalteKnopf, AnhalteMarke, useAnhalten } from "./anhalten";
import { frageTon } from "./fragenHinweise";

export type Bewegung = "auto" | "voll" | "reduziert";
export function bewegungSetzen(wahl: Bewegung, wurzel = document.documentElement) { wurzel.dataset.bewegung = wahl; }
export function bewegungAktuell(wahl: Bewegung, reduziert: boolean) { return wahl === "auto" ? (reduziert ? "reduziert" : "voll") : wahl; }
const symbol = { size: 16, strokeWidth: 1.5, absoluteStrokeWidth: true, "aria-hidden": true } as const;

function KopfMenue({ name, inhalt, children, klasse = "", beschriftung = name, formular = false, beimSchliessen }: { name: string; inhalt: ReactNode; children: ReactNode | ((zu: () => void) => ReactNode); klasse?: string; beschriftung?: string; formular?: boolean; beimSchliessen?: () => void }) {
  const [offen, zeige] = useState(false), ort = useRef<HTMLDivElement>(null), knopf = useRef<HTMLButtonElement>(null);
  const fokus = (i: number) => { const alle = ort.current?.querySelectorAll<HTMLButtonElement>("[role^=menuitem]"); if (alle?.length) alle[(i + alle.length) % alle.length].focus(); };
  const zu = () => { zeige(false); if (ort.current?.contains(document.activeElement)) knopf.current?.focus(); };
  useEffect(() => {
    if (!offen) { beimSchliessen?.(); return; }
    (ort.current?.querySelector<HTMLInputElement>("input") ?? ort.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? ort.current?.querySelector<HTMLButtonElement>('[role^=menuitem]'))?.focus();
    const daneben = (e: PointerEvent) => { if (!ort.current?.contains(e.target as Node)) zeige(false); };
    document.addEventListener("pointerdown", daneben); return () => document.removeEventListener("pointerdown", daneben);
  }, [offen, formular]);
  return <div className={`kopf-anker ${klasse}`} ref={ort} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) zeige(false); }}>
    <button ref={knopf} type="button" className="kopf-knopf" aria-label={name === "ProjectB" ? undefined : beschriftung} aria-haspopup={formular ? "dialog" : "menu"} aria-expanded={offen}
      onClick={() => zeige(!offen)} onKeyDown={e => { if (["ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); zeige(true); } }}>{inhalt}</button>
    {offen && <div className="kopf-menue" role={formular ? "dialog" : "menu"} aria-label={name} onClick={e => { if ((e.target as Element).closest('[role^=menuitem]:not([aria-disabled=true]):not([data-bleibt])')) zu(); }} onKeyDown={e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); zu(); }
      if (formular) return;
      if (e.key === "Tab") setTimeout(() => zeige(false), 0);
      const i = [...e.currentTarget.querySelectorAll("button")].indexOf(document.activeElement as HTMLButtonElement);
      const ziel = e.key === "Home" ? 0 : e.key === "End" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : null;
      if (ziel !== null) { e.preventDefault(); fokus(ziel); }
    }}>{typeof children === "function" ? children(zu) : children}</div>}
  </div>;
}

export function ProjektWahl({ kopf }: { kopf: KopfDaten }) {
  const [formular, setFormular] = useState(false), [pfad, setPfad] = useState(""), [fehler, setFehler] = useState(""), [oeffnet, setOeffnet] = useState(false);
  const laedt = useRef(false), geoeffnet = useRef(false);
  useEffect(() => {
    let aktiv = true;
    projekteZuletzt().then(async projekte => {
      if (!aktiv || geoeffnet.current || laedt.current) return;
      const daten = chatEingabeQuelle.lesen(); chatEingabeQuelle.aktualisieren({ ...daten, kopf: { ...daten.kopf, projekte } });
      if (!isTauri() || !projekte.length) return;
      const projekt = await projektPruefen(projekte[0]);
      if (aktiv && !geoeffnet.current && !laedt.current) {
        const daten = chatEingabeQuelle.lesen(); chatEingabeQuelle.aktualisieren({ ...daten, kopf: { ...daten.kopf, ...projekt, geoeffnet: true } });
      }
    }).catch(() => { /* Beim Start bleiben nicht erreichbare Projekte still beim bisherigen Zustand. */ });
    return () => { aktiv = false; };
  }, []);
  const oeffnen = async (pfad: string, zu: () => void) => {
    if (laedt.current) return;
    laedt.current = true; setOeffnet(true); setFehler("");
    try {
      const projekt = await projektOeffnen(pfad.trim()), daten = chatEingabeQuelle.lesen();
      chatEingabeQuelle.aktualisieren({ ...daten, kopf: { ...daten.kopf, ...projekt, geoeffnet: true, projekte: [projekt.pfad, ...daten.kopf.projekte.filter(p => p !== projekt.pfad)] } });
      geoeffnet.current = true; setFormular(false); zu();
      try {
        const projekte = await projekteZuletzt(), daten = chatEingabeQuelle.lesen();
        chatEingabeQuelle.aktualisieren({ ...daten, kopf: { ...daten.kopf, projekte } });
      } catch { setFehler("Zuletzt geöffnete Projekte konnten nicht geladen werden."); }
    } catch (e) {
      setPfad(pfad); setFormular(true); setFehler(typeof e === "string" ? e : e instanceof Error ? e.message : "Der Ordner konnte nicht geöffnet werden.");
    } finally { laedt.current = false; setOeffnet(false); }
  };
  return <KopfMenue name="Projekt wählen" klasse="kopf-projekt" formular={formular} beimSchliessen={() => { setFormular(false); setFehler(""); }}
    beschriftung={`Projekt wählen: ${kopf.projekt} ${kopf.pfad} ${kopf.zweig}`}
    inhalt={<><Folder {...symbol} /><code title={`${kopf.projekt} · ${kopf.pfad}`}>{kopf.pfad}</code>{kopf.pfad.split(/[\\/]/).at(-1) !== kopf.projekt && <span>{kopf.projekt}</span>}{" "}<code className="kopf-zweig" title={kopf.zweig}>{kopf.zweig}</code><ChevronDown {...symbol} /></>}>
    {zu => <><h2 role={formular ? undefined : "presentation"}>Projekt wählen</h2>
      {formular ? <form className="ein kopf-pfad" aria-busy={oeffnet} onSubmit={e => { e.preventDefault(); void oeffnen(pfad, zu); }}>
        <label htmlFor="projekt-pfad">Pfad zum Projekt</label>
        <input id="projekt-pfad" value={pfad} placeholder="C:\\ProjectB" autoComplete="off" spellCheck={false}
          onChange={e => { setPfad(e.target.value); setFehler(""); }} aria-invalid={!!fehler} aria-describedby="projekt-fehler" />
        <span id="projekt-fehler" className="ein-meldung" aria-live="polite">{fehler && <><CircleX {...symbol} />{fehler}</>}</span>
        <div className="ein-leiste"><span className="luecke" /><button type="submit" className="kn kn-haupt" aria-disabled={oeffnet}>{oeffnet ? "Öffnet …" : "Öffnen"}</button></div>
      </form> : <>
        <div className="kopf-projekte" role="group" aria-label="Zuletzt geöffnet">{kopf.projekte.map(p => <button key={p} type="button" role="menuitemradio" tabIndex={-1}
          data-bleibt aria-disabled={oeffnet} aria-checked={kopf.pfad === p} onClick={() => { void oeffnen(p, zu); }}>{p}</button>)}</div>
        {fehler && <p id="projekt-listenfehler" className="ein-meldung"><CircleX {...symbol} />{fehler}</p>}
        <button type="button" role="menuitem" tabIndex={-1} data-bleibt aria-describedby={fehler ? "projekt-listenfehler" : undefined} onClick={() => { setFehler(""); setFormular(true); }}>Ordner öffnen…</button>
      </>}
    </>}
  </KopfMenue>;
}

export default function Kopf() {
  const pause = useAnhalten(), [ton, setTon] = useState(frageTon.lesen);
  const [daten, setDaten] = useState(() => chatEingabeQuelle.lesen());
  const [kontingent, setKontingent] = useState<Kontingent>(() => isTauri() ? { claude: null, codex: null } : daten.kopf.kontingent);
  const [bewegung, waehleBewegung] = useState<Bewegung>("auto"), [ruhig, setRuhig] = useState(false);
  useEffect(() => chatEingabeQuelle.abonnieren(() => setDaten(chatEingabeQuelle.lesen())), []);
  useEffect(() => {
    let aktiv = true;
    const lesen = () => kontingentLesen().then(wert => { if (aktiv) setKontingent(wert); })
      .catch(() => { /* Bei Lesefehlern bleibt der letzte Stand sichtbar. */ });
    void lesen();
    const intervall = setInterval(() => { void lesen(); }, 5 * 60 * 1000);
    return () => { aktiv = false; clearInterval(intervall); };
  }, []);
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
      <button type="button" role="menuitemcheckbox" tabIndex={-1} aria-checked={ton} onClick={() => { frageTon.setzen(!ton); setTon(!ton); }}>Ton bei Fragen: {ton ? "An" : "Aus"}</button>
    </KopfMenue>
    <ProjektWahl kopf={daten.kopf} />
    <div className="kopf-kontingent" role="group" aria-label="Kontingent diese Woche · Genutzt · Weiße Marke: Soll">
      {(["claude", "codex"] as const).map(a => {
        const wert = kontingent[a], name = a === "claude" ? "Claude" : "Codex";
        return <span className="kopf-nutzung" key={a} aria-label={`${name}: ${wert ? `Genutzt ${wert.genutzt} %, Soll ${wert.soll} %` : "unbekannt"}`}>
          {name}{wert ? <><span className="kopf-balken" aria-hidden="true"><span style={{ width: `${wert.genutzt}%` }} /><i className="kopf-soll" style={{ left: `${wert.soll}%` }} /></span><b>{wert.genutzt} %</b></> : <b>unbekannt</b>}
        </span>;
      })}
    </div>
    <Berechtigungen daten={daten.berechtigungen} quelle={chatEingabeQuelle} />
    <PostfachKnopf zahl={daten.kopf.postfach} />
    <span className="anhalte-kopf">{pause && <AnhalteMarke />}<AnhalteKnopf pause={pause} /></span>
    <KopfMenue name="Rollen" klasse="kopf-rollen" inhalt={<><IdCard {...symbol} /><span>Rollen</span></>}>
      <h2 role="presentation">Rollen</h2>{["Orchestrator", "Arbeiter Codex", "Prüfer Claude"].map(r => <button type="button" role="menuitem" aria-disabled="true" tabIndex={-1} key={r}>{r}</button>)}
    </KopfMenue>
  </header>;
}
