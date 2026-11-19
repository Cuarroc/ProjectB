import { Clock, Gauge, Zap } from "lucide-react";
import type { Planschritt } from "../daten/typen";

const risikowort = ["–", "Niedrig", "Mittel", "Hoch"];
const kurz = (zahl: number) => zahl >= 1000000 ? `${zahl / 1000000}M` : zahl >= 1000 ? `${Math.round(zahl / 1000)}k` : String(zahl);
const minuten = (zahl: number | null) => `${zahl == null ? "–" : `~${zahl}`} min`;
const summe = (werte: (number | null)[]) => werte.some(w => w != null) ? werte.reduce<number>((a, b) => a + (b ?? 0), 0) : null;
function Risiko({ wert }: { wert: Planschritt["risiko"] }) {
  return <span className="pl-risiko" aria-hidden="true">{[1, 2, 3].map(stufe => <i key={stufe} data-voll={stufe <= (wert ?? 0)} />)}</span>;
}
export default function PlanAufwand({ schritte, vorher, vorherName, kontext, onZeigen }: {
  vorher?: Planschritt[]; vorherName?: string;
  schritte: Planschritt[]; kontext?: number; onZeigen: (id: string | null, quelle: "hover" | "fokus") => void;
}) {
  const dauern = schritte.flatMap(s => s.dauerMinuten == null ? [] : [s.dauerMinuten]);
  const tokens = schritte.flatMap(s => s.tokens == null ? [] : [s.tokens]);
  const dauer = dauern.length ? dauern.reduce((a, b) => a + b, 0) : null;
  const tokenSumme = tokens.length ? tokens.reduce((a, b) => a + b, 0) : null;
  const maximum = dauern.length ? Math.max(...dauern) : null;
  const risiko = schritte.reduce<Planschritt["risiko"]>((wert, s) => s.risiko != null && (wert == null || s.risiko > wert) ? s.risiko : wert, null);
  const anteil = tokenSumme != null && kontext != null && kontext > 0 ? tokenSumme / kontext * 100 : null;
  const unterschied = (wert: number | null, feld: "dauerMinuten" | "tokens") => {
    if (!vorher) return null;
    const alt = summe(vorher.map(s => s[feld])), delta = wert == null || alt == null ? null : wert - alt;
    return <p>{delta == null ? "–" : `${delta < 0 ? "−" : delta > 0 ? "+" : ""}${feld === "tokens" ? kurz(Math.abs(delta)) : `${Math.abs(delta)} min`}`} zu {vorherName}</p>;
  };
  return <>
    <div className="pl-kacheln">
      <section className="pl-karte pl-kachel" aria-label="Aufwand">
        <h3><Clock size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />Aufwand</h3>
        <strong>{dauer == null ? "–" : minuten(dauer)}</strong>
        {unterschied(dauer, "dauerMinuten")}
        <div className="pl-anteil"><span className="pl-messbalken"><i style={{ width: "0%" }} /></span><span>– %</span></div>
        <p>Kein Zeitlimit gesetzt</p>
      </section>
      <section className="pl-karte pl-kachel" aria-label="Tokens">
        <h3><Zap size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />Tokens</h3>
        <strong>{tokenSumme == null ? "–" : `~${kurz(tokenSumme)}`}</strong>
        {unterschied(tokenSumme, "tokens")}
        <div className="pl-anteil"><span className="pl-messbalken"><i style={{ width: `${Math.min(100, anteil ?? 0)}%` }} /></span><span>{anteil == null ? "–" : Math.round(anteil)} %</span></div>
        <p>{kontext != null && kontext > 0 ? `Von ${kurz(kontext)} Kontext` : "Kein Kontextfenster bekannt"}</p>
      </section>
      <section className="pl-karte pl-kachel" aria-label="Risiko">
        <h3><Gauge size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />Risiko</h3>
        <strong>{risikowort[risiko ?? 0]}</strong>
        <div className="pl-anteil"><Risiko wert={risiko} /><span>{risiko ?? "–"} / 3</span></div>
        <p>{risiko == null ? "Kein Risiko bekannt" : `Am höchsten bei Schritt ${schritte.findIndex(s => s.risiko === risiko) + 1}`}</p>
      </section>
    </div>
    <section className="pl-karte" aria-labelledby="pl-aufwand-titel">
      <div className="pl-karte-kopf"><h3 id="pl-aufwand-titel">Aufwand je Schritt</h3><span className="pl-einheit">in min</span></div>
      <table className="pl-diagramm" aria-label="Aufwand je Schritt in min">
        <colgroup><col className="pl-spalte-nr" /><col /><col className="pl-spalte-dauer" /><col className="pl-spalte-risiko" /></colgroup>
        <thead><tr>{["Nr.", "Schritt", "Dauer", "Risiko"].map(t => <th scope="col" key={t}>{t}</th>)}</tr></thead>
        <tbody>{schritte.map((s, i) => <tr key={s.id} tabIndex={0} aria-label={`Schritt ${i + 1}, ${s.titel}, ${minuten(s.dauerMinuten)}, Risiko ${risikowort[s.risiko ?? 0]}`}
          onMouseEnter={() => onZeigen(s.id, "hover")} onMouseLeave={() => onZeigen(null, "hover")}
          onFocus={() => onZeigen(s.id, "fokus")} onBlur={() => onZeigen(null, "fokus")}>
          <td>{i + 1}</td><td><span>{s.titel}</span>{s.dauerMinuten != null && <span className="pl-balken" style={{ width: `${maximum ? s.dauerMinuten / maximum * 100 : 0}%` }} />}</td>
          <td>{minuten(s.dauerMinuten)}</td><td><Risiko wert={s.risiko} /></td>
        </tr>)}</tbody>
        <tfoot><tr><td /><td><div className="pl-achse"><span>0</span><span>{maximum == null ? "–" : maximum / 2}</span><span>{maximum ?? "–"} min</span></div></td><td /><td /></tr></tfoot>
      </table>
      <p className="pl-hinweis">{dauer == null ? "Keine Dauer bekannt." : `Summe ${minuten(dauer)} in ${dauern.length}${dauern.length < schritte.length ? ` von ${schritte.length}` : ""} ${schritte.length === 1 ? "Schritt" : "Schritten"}.`} Fahr über einen Balken, um den Schritt links zu sehen.</p>
    </section>
  </>;
}
