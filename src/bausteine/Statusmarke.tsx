import { Check, Circle, CircleDashed, CircleX } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import "./bausteine.css";

export const zustaende = {
  offen: { wort: "Offen", Symbol: Circle },
  arbeitet: { wort: "Arbeitet", Symbol: CircleDashed },
  wartet: { wort: "Wartet auf dich", Symbol: Circle },
  fertig: { wort: "Fertig", Symbol: Check },
  problem: { wort: "Problem", Symbol: CircleX },
} as const;
export type Zustand = keyof typeof zustaende;

export function Statusmarke({ zustand, toastMeldet = false }: { zustand: Zustand; toastMeldet?: boolean }) {
  const vorher = useRef(zustand);
  const [hinweis, setHinweis] = useState(false);
  useLayoutEffect(() => {
    setHinweis(vorher.current !== zustand && zustand === "wartet" && !toastMeldet);
    vorher.current = zustand;
  }, [zustand, toastMeldet]);
  const { wort, Symbol } = zustaende[zustand];
  return <span className={`statusmarke mk mk-${zustand}${hinweis ? " hinweis" : ""}`} data-zustand={zustand} aria-live="polite" aria-atomic="true">
    <span key={zustand} className="mk-sym"><Symbol size={zustand === "wartet" ? 10 : 12} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" fill={zustand === "wartet" ? "currentColor" : "none"} /></span>{wort}
  </span>;
}
