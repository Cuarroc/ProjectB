import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { zustaende, type Zustand } from "./Statusmarke";

type Props = { wert: number; zustand?: Zustand | "ziel" | "kontext"; groesse?: 20 | 40 | 44 | 52; text?: string };
export function Fortschrittsring({ wert, zustand = "arbeitet", groesse = 44, text }: Props) {
  const anteil = Math.min(100, Math.max(0, wert));
  const fertig = anteil === 100;
  const wort = zustand === "ziel" ? "Ziel" : zustand === "kontext" ? "Kontext" : zustaende[zustand].wort;
  const farbe = fertig ? "status-fertig" : zustand === "ziel" ? "akzent" : zustand === "kontext" ? "neutral-2" : `status-${zustand}`;
  return <span role="img" aria-label={`${text ?? `${anteil} %`} · ${fertig ? "Fertig" : wort}`} className="ring" data-klein={groesse < 40 || undefined} data-fertig={fertig || undefined}
    style={{ "--ring-groesse": `var(--ring-${groesse})`, "--ring-farbe": `var(--${farbe})` } as CSSProperties}>
    <svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r={groesse < 40 ? 22 : 23} />
      <circle className="ring-bogen" cx="26" cy="26" r={groesse < 40 ? 22 : 23} pathLength="100" strokeDasharray="100" strokeDashoffset={100 - anteil} visibility={anteil === 0 ? "hidden" : undefined} />
    </svg>
    {groesse >= 40 && <><span className="ring-mitte ring-zahl">{text ?? `${anteil} %`}</span><span className="ring-mitte ring-haken"><Check size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span></>}
  </span>;
}
