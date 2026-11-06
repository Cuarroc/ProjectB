import { useState } from "react";
import { Eingabefeld } from "./Eingabefeld";

export default function Vorschau3() {
  const [text, setText] = useState("");
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string>();
  return <main className="eingabe-vorschau" aria-label="Vorschau Eingabefeld">
    <Eingabefeld id="nachricht" text={text} onTextAendern={setText} sendet={sendet} fehler={fehler}
      onSenden={() => {
        if (sendet) return;
        setSendet(true); setFehler(undefined);
        window.setTimeout(() => { setSendet(false); setFehler("Nicht gesendet. Dein Text bleibt stehen."); }, 600);
      }} />
  </main>;
}
