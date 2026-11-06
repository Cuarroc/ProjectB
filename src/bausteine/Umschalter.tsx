import { useLayoutEffect, useRef } from "react";
import "./bausteine.css";

type Props = { moeglichkeiten: readonly string[]; wert: string; beschriftung: string; onChange: (wert: string) => void; className?: string };
export function Umschalter({ moeglichkeiten, wert, beschriftung, onChange, className = "" }: Props) {
  const gruppe = useRef<HTMLDivElement>(null);
  const index = Math.max(0, moeglichkeiten.indexOf(wert));
  useLayoutEffect(() => {
    const element = gruppe.current!;
    const messen = () => {
      const teil = element.querySelectorAll("button")[index];
      element.style.setProperty("--links", `${teil.offsetLeft}px`);
      element.style.setProperty("--rechts", `${element.clientWidth - teil.offsetLeft - teil.offsetWidth}px`);
    };
    messen(); const beobachter = new ResizeObserver(messen); beobachter.observe(element);
    return () => beobachter.disconnect();
  }, [index, moeglichkeiten]);
  return <div ref={gruppe} role="radiogroup" aria-label={beschriftung} className={`umschalter ${className}`}
    >
    <span className="umschalter-pille" aria-hidden="true" />
    {moeglichkeiten.map((text, i) => <button type="button" role="radio" aria-checked={i === index} tabIndex={i === index ? 0 : -1}
      key={text} onClick={() => onChange(text)} onKeyDown={event => {
        const schritte: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        const ziel = event.key === "Home" ? 0 : event.key === "End" ? moeglichkeiten.length - 1
          : event.key in schritte ? (i + schritte[event.key] + moeglichkeiten.length) % moeglichkeiten.length : null;
        if (ziel === null) return;
        event.preventDefault(); onChange(moeglichkeiten[ziel]);
        gruppe.current?.querySelectorAll<HTMLButtonElement>("button")[ziel].focus();
      }}><span>{text}</span><b aria-hidden="true">{text}</b></button>)}
  </div>;
}
