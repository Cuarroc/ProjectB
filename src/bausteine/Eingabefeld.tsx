import type { KeyboardEvent, ReactNode } from "react";
import { ArrowUp, CircleX, Plus } from "lucide-react";
import "./Eingabefeld.css";

type Props = {
  id: string;
  text: string;
  onTextAendern: (text: string) => void;
  onSenden: (text: string) => void;
  onAnhaengen?: () => void;
  sendet?: boolean;
  fehler?: string;
  kopf?: ReactNode;
  werkzeuge?: ReactNode;
  beschreibungId?: string;
  ohneAnhaengen?: boolean;
};

export function Eingabefeld({ id, text, onTextAendern, onSenden, onAnhaengen, sendet = false, fehler, kopf, werkzeuge, beschreibungId, ohneAnhaengen }: Props) {
  const senden = () => { if (!sendet && text.trim()) onSenden(text); };
  const tastatur = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    senden();
  };
  return <form className="ein" onSubmit={event => { event.preventDefault(); senden(); }}>
    <>{kopf}<label htmlFor={id} className="ein-sr">Nachricht an den Orchestrator</label></>
    <textarea id={id} rows={2} placeholder="Schreib, was gebaut werden soll …" value={text}
      onChange={event => onTextAendern(event.target.value)} onKeyDown={tastatur}
      aria-describedby={[beschreibungId, fehler ? `${id}-meldung` : undefined].filter(Boolean).join(" ") || undefined} />
    <div className="ein-leiste">
      {!ohneAnhaengen && <button type="button" className="kn kn-leise kn-symbol" aria-label="Bild oder Datei anhängen"
        title="Bild oder Datei anhängen" disabled={!onAnhaengen || sendet} onClick={onAnhaengen}>
        <Plus size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      </button>}
      {werkzeuge}
      <span id={`${id}-meldung`} className={fehler ? "ein-meldung" : "ein-sr"} aria-live="polite" aria-atomic="true">
        {fehler && <><CircleX size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />{fehler}</>}
      </span>
      <span className="luecke" aria-hidden="true" />
      <button type="submit" className="kn kn-haupt"
        aria-busy={sendet || undefined} aria-disabled={sendet || undefined}>
        <span className="kn-stapel">
          <span aria-hidden={sendet} style={{ visibility: sendet ? "hidden" : undefined }}>
            {fehler ? "Erneut senden" : "Senden"}<ArrowUp size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </span>
          <span className={sendet ? undefined : "aus"} aria-hidden={!sendet}>Sendet …</span>
        </span>
      </button>
    </div>
  </form>;
}
