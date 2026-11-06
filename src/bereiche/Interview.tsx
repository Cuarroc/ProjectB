import { useEffect, useRef } from "react";
import { Check, MessageCircleQuestion } from "lucide-react";
import { Knopf } from "../bausteine/Knopf";
import "./Interview.css";

export const interviewFragen = [
  { text: "Wer soll den CSV-Export nutzen?", optionen: ["Nur ich", "Mein Team"] },
  { text: "Welche Spalten brauchst du?", optionen: ["Status und Dauer", "Alle Spalten"] },
  { text: "Wo soll die Datei gespeichert werden?", optionen: ["Im Projektordner", "Jedes Mal fragen"] },
];
type Antwort = { auswahl: string; frei: string };
export type InterviewZustand = { antworten: Antwort[]; auswahl: string; frei: string };
export function interviewAntwort(antworten: Antwort[], auswahl: string, frei: string) {
  return antworten.length < interviewFragen.length && (auswahl || frei.trim()) ? [...antworten, { auswahl, frei: frei.trim() }] : antworten;
}
export function InterviewZusammenfassung({ antworten }: { antworten: Antwort[] }) {
  return <ol className="interview-ergebnis">{antworten.map((a, i) => <li key={interviewFragen[i].text}><strong>{interviewFragen[i].text}</strong><p>{[a.auswahl, a.frei].filter(Boolean).join(" · ")}</p></li>)}</ol>;
}
export default function Interview({ zustand, aendern }: { zustand: InterviewZustand; aendern: (wert: InterviewZustand) => void }) {
  const { antworten, auswahl, frei } = zustand;
  const titel = useRef<HTMLHeadingElement>(null), schritt = antworten.length, frage = interviewFragen[schritt];
  useEffect(() => { if (schritt > 0) titel.current?.focus(); }, [schritt]);
  return <article className="r-karte r-msg interview" aria-label="Interview">
    <header className="r-msg-kopf"><span className="r-msg-name">Orchestrator · Interview</span><span className="r-msg-zeit">Beispiel</span></header>
    <section className={`r-innen${frage ? " r-frage" : ""}`} aria-labelledby="interview-titel">
      <h3 className="r-frage-kopf" id="interview-titel" tabIndex={-1} ref={titel}>{frage ? <MessageCircleQuestion size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /> : <Check size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}{frage ? `Frage ${schritt + 1} von ${interviewFragen.length}` : "Zusammenfassung"}</h3>
      {frage ? <form onSubmit={e => { e.preventDefault(); const neu = interviewAntwort(antworten, auswahl, frei); if (neu !== antworten) aendern({ antworten: neu, auswahl: "", frei: "" }); }}>
        <p className="r-frage-text">{frage.text}</p><div className="r-antworten">{frage.optionen.map(text => <Knopf key={text} text={text} variante="antwort" aria-pressed={auswahl === text} onClick={() => aendern({ ...zustand, auswahl: auswahl === text ? "" : text })} />)}</div>
        <label htmlFor="interview-frei">Deine Antwort oder Ergänzung</label><textarea id="interview-frei" value={frei} onChange={e => aendern({ ...zustand, frei: e.target.value })} rows={2} />
        <Knopf type="submit" text={schritt === interviewFragen.length - 1 ? "Zusammenfassen" : "Weiter"} disabled={!auswahl && !frei.trim()} />
      </form> : <InterviewZusammenfassung antworten={antworten} />}
    </section>
  </article>;
}
