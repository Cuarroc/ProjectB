import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import "./bausteine.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  text: string; variante?: "haupt" | "zweit" | "leise" | "gefaehrlich" | "antwort";
  symbol?: LucideIcon; nurSymbol?: boolean; ladeText?: string; laedt?: boolean; grund?: string;
};
export function Knopf({ text, variante = "zweit", symbol: Symbol, nurSymbol, ladeText = "Lädt …", laedt, grund, disabled, className = "", ...rest }: Props) {
  return <button {...rest} type={rest.type ?? "button"} className={`knopf ${className}`} data-variante={variante}
    data-symbol={nurSymbol || undefined} disabled={disabled || laedt} aria-busy={laedt || undefined}
    aria-label={nurSymbol ? (laedt ? ladeText : text) : undefined} title={grund ?? (nurSymbol ? text : undefined)}>
    {nurSymbol ? (Symbol && <Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />) : <>
      <span className="knopf-inhalt" style={{ visibility: laedt ? "hidden" : undefined }}>{text}{Symbol && <Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}</span>
      <span className="knopf-inhalt" style={{ visibility: laedt ? undefined : "hidden" }} aria-hidden={!laedt}>{ladeText}</span>
    </>}
  </button>;
}
