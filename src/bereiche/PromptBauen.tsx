import { useEffect, useRef, useState } from "react";
import { MessageCircleReply, MessageCircleQuestion, Pencil, X } from "lucide-react";
import { Knopf } from "../bausteine/Knopf";
import "./PromptBauen.css";

const titel = ["Ziel", "Hintergrund", "Was genau", "Fertig, wenn", "Nicht tun"];
export const auftragText = (abschnitte: string[]) => abschnitte.flatMap((text, i) => text.trim() ? [`## ${titel[i]}\n${text.trim()}`] : []).join("\n\n");
export type PromptFrage = { text: string; aktionen: { text: string; antwort: string }[] };
export default function PromptBauen({ idee, abschnitte, abschnittId = "", rueckfragen = [], frage, laeuft = false, fehler, onSchliessen, onSenden, onAntwort }: {
  abschnittId?: string; rueckfragen?: { text: string; antwort: string }[]; frage?: PromptFrage; laeuft?: boolean; onAntwort?: (text: string) => void;
  idee: string; abschnitte?: string[]; fehler?: string; onSchliessen: () => void; onSenden: (text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), [ideeText, setIdee] = useState(idee);
  const [bearbeitet, setTexte] = useState(() => ({ id: abschnittId, texte: abschnitte ?? [idee, "", "", "", ""] })), [antwort, setAntwort] = useState("");
  const texte = bearbeitet.id === abschnittId ? bearbeitet.texte : abschnitte!;
  const grund = laeuft ? "Bitte warte auf die Antwort des Orchestrators." : undefined;
  const antworten = (text: string) => { if (!laeuft && text.trim()) { setAntwort(""); return onAntwort?.(text.trim()); } };
  useEffect(() => { const fenster = dialog.current!, vorher = document.activeElement as HTMLElement;
    fenster.showModal(); return () => { fenster.close(); vorher?.focus(); }; }, []);
  const leer = !texte[0].trim(), verfeinernGrund = grund ?? (!abschnitte ? "Bitte warte zuerst auf einen Auftragsentwurf." : undefined);
  return <dialog ref={dialog} className="prompt-bauen" aria-labelledby="prompt-titel" aria-describedby="prompt-hilfe"
    onCancel={e => { e.preventDefault(); onSchliessen(); }} onKeyDown={e => {
      if (e.key !== "Tab") return;
      const ziele = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),textarea:not(:disabled)")], erstes = ziele[0], letztes = ziele.at(-1);
      if (e.shiftKey && document.activeElement === erstes) { e.preventDefault(); letztes?.focus(); }
      else if (!e.shiftKey && document.activeElement === letztes) { e.preventDefault(); erstes?.focus(); }
    }}>
    <header className="pb-kopf"><span className="pb-symbol"><Pencil size={24} strokeWidth={1.5} aria-hidden="true" /></span>
      <div><h2 id="prompt-titel">Prompt bauen</h2><p id="prompt-hilfe">Aus deiner groben Idee wird ein ausführlicher Auftrag. Du prüfst und änderst ihn, bevor er an den Orchestrator geht.</p></div>
      <Knopf text="Prompt bauen schließen" symbol={X} nurSymbol variante="leise" onClick={onSchliessen} /></header>
    <div className="pb-inhalt"><div className="pb-links"><section className="pb-idee"><div className="pb-zeile"><h3>Deine Idee</h3><span className="pb-marke">Stichworte</span></div>
      <textarea aria-label="Deine Idee" rows={3} value={ideeText} onChange={e => setIdee(e.target.value)} />{fehler && <p className="ein-meldung" role="alert">{fehler}</p>}</section>
      {!!rueckfragen.length && <section className="pb-idee" aria-label="Rückfragen"><div className="pb-zeile"><h3>Rückfragen</h3><span className="pb-marke">{rueckfragen.length} beantwortet</span></div>
        <ul className="pb-rueckfragen">{rueckfragen.map((f, i) => <li className="pb-karte" key={i}><p><MessageCircleReply size={16} aria-hidden="true" />{f.text}</p><span className="pb-antwort">{f.antwort}</span></li>)}</ul></section>}
      {(frage || laeuft) && <section className="pb-idee pb-frage" aria-label="Frage an dich"><div className="pb-zeile"><MessageCircleQuestion size={16} aria-hidden="true" /><h3>Frage an dich</h3></div>
        {laeuft && <p role="status">Orchestrator schreibt …</p>}{frage && <><p>{frage.text}</p><div className="pb-vorschlaege">
          {frage.aktionen.map(a => <Knopf key={a.antwort} text={a.text} variante="antwort" disabled={laeuft} grund={grund} onClick={() => antworten(a.antwort)} />)}</div>
          <textarea aria-label="Deine Antwort" rows={1} value={antwort} disabled={laeuft} onChange={e => setAntwort(e.target.value)} />
          <Knopf text="Antwort senden" disabled={laeuft || !antwort.trim()} grund={grund ?? (!antwort.trim() ? "Bitte gib eine Antwort ein." : undefined)} onClick={() => antworten(antwort)} /></>}</section>}</div>
      <section className="pb-auftrag"><div className="pb-zeile"><h3>Fertiger Auftrag</h3><span className="pb-marke">5 Abschnitte</span><span className="pb-marke">Direkt bearbeitbar</span></div>
        {titel.map((name, i) => <label className="pb-karte" key={name}><span className="pb-kartentitel"><span className="pb-nummer">{i + 1}</span>{name}</span>
          <textarea aria-label={name} rows={1} placeholder="Noch leer" value={texte[i]} onChange={e => setTexte(v => ({ id: abschnittId, texte: (v.id === abschnittId ? v.texte : abschnitte!).map((text, j) => j === i ? e.target.value : text) }))} /></label>)}
      </section></div>
    <footer className="pb-fuss"><div><Knopf text="Weiter verfeinern" disabled={!!verfeinernGrund} grund={verfeinernGrund} onClick={() => { if (!verfeinernGrund) return onAntwort?.(`Verfeinere diesen Auftrag. Frag nach, wenn etwas fehlt.\n\n${auftragText(texte)}`); }} />
      <Knopf text="Als Ziel übernehmen" disabled grund="Ziele gibt es ab 0.2 Punkt 1." /></div><div>
      <Knopf text="Abbrechen" onClick={onSchliessen} /><Knopf text="Als Auftrag senden" variante="haupt" disabled={leer || laeuft}
        grund={grund ?? (leer ? "Bitte fülle zuerst das Ziel aus." : undefined)} onClick={() => { if (!leer && !laeuft) onSenden(auftragText(texte)); }} /></div></footer>
  </dialog>;
}
