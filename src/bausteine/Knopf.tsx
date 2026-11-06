import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import "./bausteine.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  text: string; variante?: "haupt" | "zweit" | "leise" | "gefaehrlich" | "antwort";
  symbol?: LucideIcon; vorsatz?: ReactNode; nurSymbol?: boolean; ladeText?: string; laedt?: boolean; grund?: string;
};
export function Knopf({ text, variante = "zweit", symbol: Symbol, vorsatz, nurSymbol, ladeText = "Lädt …", laedt, grund, disabled, className = "", ...rest }: Props) {
  return <button {...rest} type={rest.type ?? "button"} className={`knopf kn kn-${variante === "gefaehrlich" ? "gefahr" : variante} ${nurSymbol ? "kn-symbol" : ""} ${className}`} data-variante={variante}
    data-symbol={nurSymbol || undefined} disabled={disabled || laedt} aria-disabled={disabled || laedt || undefined} aria-busy={laedt || undefined}
    aria-label={nurSymbol ? (laedt ? ladeText : text) : undefined} title={grund ?? (nurSymbol ? text : undefined)}>
    {nurSymbol ? (Symbol && <Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />) : <span className="kn-stapel">
      <span className="knopf-inhalt" style={{ visibility: laedt ? "hidden" : undefined }} aria-hidden={laedt || undefined}>{vorsatz}{text}{Symbol && <Symbol size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}</span>
      <span className="knopf-inhalt" style={{ visibility: laedt ? undefined : "hidden" }} aria-hidden={!laedt}>{ladeText}</span>
    </span>}
  </button>;
}
