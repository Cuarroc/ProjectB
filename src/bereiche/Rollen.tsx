import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { CircleX } from "lucide-react";
import { rollenLaden, rollenSpeichern } from "../daten/rollen";
import type { BeispielQuelle } from "../daten/quelle";
import type { Datenstand, Rolle } from "../daten/typen";

export default function Rollen({ daten, quelle, children }: { daten: Datenstand; quelle: BeispielQuelle; children: (inhalt: React.ReactNode) => React.ReactNode }) {
  const [fehler, setFehler] = useState(""), [speichert, setSpeichert] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const stand = useRef({ aktiv: true, speichert: false }), pfad = daten.kopf.pfad;
  useEffect(() => {
    const aktuell = { aktiv: true, speichert: false }; stand.current = aktuell; setFehler(""); setSpeichert(false); setGeladen(false);
    void rollenLaden(quelle, pfad, () => aktuell.aktiv).then(() => { if (aktuell.aktiv) setGeladen(true); })
      .catch(e => { if (aktuell.aktiv) setFehler(`Rollen nicht geladen: ${String(e)}`); });
    return () => { aktuell.aktiv = false; };
  }, [quelle, pfad]);
  const bereit = !isTauri() || (geladen && daten.rollenPfad === pfad);
  const aendern = async (id: "orchestrator" | "claude" | "codex", feld: keyof Rolle, wert: string) => {
    const aktuell = stand.current;
    if (!bereit || aktuell.speichert) return;
    aktuell.speichert = true; setSpeichert(true); setFehler("");
    const rollen = quelle.lesen().rollen, rolle = id === "orchestrator" ? rollen.orchestrator : rollen.reviewer[id];
    Object.assign(rolle, { [feld]: wert });
    try { await rollenSpeichern(quelle, pfad, rollen, () => aktuell.aktiv); }
    catch (e) { if (aktuell.aktiv) setFehler(`Nicht gespeichert: ${String(e)}. Der alte Wert gilt weiter.`); }
    finally { aktuell.speichert = false; if (aktuell.aktiv) setSpeichert(false); }
  };
  return children(<>
    <h2>Rollen</h2>
    <form className="rollen-formular" aria-busy={!bereit || speichert} aria-describedby="rollen-hinweis rollen-fehler" onSubmit={e => e.preventDefault()}>
      {(["orchestrator", "claude", "codex"] as const).map(id => {
        const name = id === "orchestrator" ? "Orchestrator" : `Reviewer ${id === "claude" ? "Claude" : "Codex"}`;
        const rolle = id === "orchestrator" ? daten.rollen.orchestrator : daten.rollen.reviewer[id];
        const modelle = id === "codex" ? ["gpt-6.1-sol"] : ["Opus 5.5", "Sonnet 5.5", "Haiku 5.5", ...(id === "orchestrator" ? ["gpt-6.1-sol"] : [])];
        return <div className="rollen-zeile" key={id}><strong>{name}</strong>
          {(["modell", "effort"] as const).map(feld => <label key={feld}>{feld === "modell" ? "Modell" : "Effort"}
            <select aria-label={`${name} ${feld === "modell" ? "Modell" : "Effort"}`} aria-describedby="rollen-fehler" disabled={!bereit} aria-disabled={speichert}
              value={rolle[feld]} onChange={e => { void aendern(id, feld, e.target.value); }}>
              {(feld === "modell" ? modelle : ["Niedrig", "Mittel", "Hoch", "Sehr hoch"]).map(wert => <option key={wert}>{wert}</option>)}
            </select></label>)}
        </div>;
      })}
      <p id="rollen-hinweis">Das Modell eines Arbeiters steht je Agent im Plan.<br />Die Rollen gelten ab dem nächsten Chat oder Team-Start in diesem Projekt.</p>
      <p id="rollen-fehler" role="status">{fehler ? <><CircleX strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /><span>{fehler}</span></> : !bereit ? "Rollen werden geladen …" : speichert ? "Wird gespeichert …" : ""}</p>
    </form>
  </>);
}
