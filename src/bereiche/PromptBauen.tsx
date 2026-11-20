import { useEffect, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";
import { Knopf } from "../bausteine/Knopf";
import "./PromptBauen.css";

const titel = ["Ziel", "Hintergrund", "Was genau", "Fertig, wenn", "Nicht tun"];
export const auftragText = (abschnitte: string[]) => abschnitte.flatMap((text, i) => text.trim() ? [`## ${titel[i]}\n${text.trim()}`] : []).join("\n\n");
export default function PromptBauen({ idee, abschnitte, onSchliessen, onSenden }: {
  idee: string; abschnitte?: string[]; onSchliessen: () => void; onSenden: (text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), [ideeText, setIdee] = useState(idee);
  const [texte, setTexte] = useState(() => abschnitte ?? [idee, "", "", "", ""]);
  useEffect(() => { const fenster = dialog.current!, vorher = document.activeElement as HTMLElement;
    fenster.showModal(); return () => { fenster.close(); vorher?.focus(); }; }, []);
  const leer = !texte[0].trim();
  return <dialog ref={dialog} className="prompt-bauen" aria-labelledby="prompt-titel" aria-describedby="prompt-hilfe"
    onCancel={e => { e.preventDefault(); onSchliessen(); }} onKeyDown={e => {
      if (e.key !== "Tab") return;
      const ziele = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),textarea")], erstes = ziele[0], letztes = ziele.at(-1);
      if (e.shiftKey && document.activeElement === erstes) { e.preventDefault(); letztes?.focus(); }
      else if (!e.shiftKey && document.activeElement === letztes) { e.preventDefault(); erstes?.focus(); }
    }}>
    <header className="pb-kopf"><span className="pb-symbol"><Pencil size={24} strokeWidth={1.5} aria-hidden="true" /></span>
      <div><h2 id="prompt-titel">Prompt bauen</h2><p id="prompt-hilfe">Aus deiner groben Idee wird ein ausführlicher Auftrag. Du prüfst und änderst ihn, bevor er an den Orchestrator geht.</p></div>
      <Knopf text="Prompt bauen schließen" symbol={X} nurSymbol variante="leise" onClick={onSchliessen} /></header>
    <div className="pb-inhalt"><section className="pb-idee"><div className="pb-zeile"><h3>Deine Idee</h3><span className="pb-marke">Stichworte</span></div>
      <textarea aria-label="Deine Idee" rows={3} value={ideeText} onChange={e => setIdee(e.target.value)} /></section>
      <section className="pb-auftrag"><div className="pb-zeile"><h3>Fertiger Auftrag</h3><span className="pb-marke">5 Abschnitte</span><span className="pb-marke">Direkt bearbeitbar</span></div>
        {titel.map((name, i) => <label className="pb-karte" key={name}><span className="pb-kartentitel"><span className="pb-nummer">{i + 1}</span>{name}</span>
          <textarea aria-label={name} rows={1} placeholder="Noch leer" value={texte[i]} onChange={e => setTexte(v => v.map((text, j) => j === i ? e.target.value : text))} /></label>)}
      </section></div>
    <footer className="pb-fuss"><div><Knopf text="Weiter verfeinern" disabled grund="Rückfragen kommen mit dem nächsten Paket." />
      <Knopf text="Als Ziel übernehmen" disabled grund="Ziele gibt es ab 0.2 Punkt 1." /></div><div>
      <Knopf text="Abbrechen" onClick={onSchliessen} /><Knopf text="Als Auftrag senden" variante="haupt" disabled={leer}
        grund={leer ? "Bitte fülle zuerst das Ziel aus." : undefined} onClick={() => { if (!leer) onSenden(auftragText(texte)); }} /></div></footer>
  </dialog>;
}
