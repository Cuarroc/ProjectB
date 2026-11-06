import { Check, Circle, CircleDashed, CircleX } from "lucide-react";
import "./bausteine.css";

export const zustaende = {
  offen: { wort: "Offen", Symbol: Circle },
  arbeitet: { wort: "Arbeitet", Symbol: CircleDashed },
  wartet: { wort: "Wartet auf dich", Symbol: Circle },
  fertig: { wort: "Fertig", Symbol: Check },
  problem: { wort: "Problem", Symbol: CircleX },
} as const;
export type Zustand = keyof typeof zustaende;

export function Statusmarke({ zustand }: { zustand: Zustand }) {
  const { wort, Symbol } = zustaende[zustand];
  return <span className="statusmarke" data-zustand={zustand} aria-live="polite" aria-atomic="true">
    <span key={zustand} className={zustand === "wartet" ? "hinweis" : undefined}>
      <Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" fill={zustand === "wartet" ? "currentColor" : "none"} />{wort}
    </span>
  </span>;
}
