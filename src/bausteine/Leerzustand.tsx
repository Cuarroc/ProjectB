import { useEffect, useState } from "react";
import { CircleX, Mail, MessageSquareDashed, Users } from "lucide-react";
import { Knopf } from "./Knopf";
import { tokenMs } from "./Tooltip";
import "./meldungen.css";

export function Leerzustand({ bereich, zustand = "leer", erneut }: { bereich: "postfach" | "team" | "chat"; zustand?: "leer" | "fehler" | "laden"; erneut?: () => void }) {
  const [platzhalter, setPlatzhalter] = useState(false);
  useEffect(() => { setPlatzhalter(false); if (zustand !== "laden") return; const timer = setTimeout(() => setPlatzhalter(true), tokenMs("verzoegerung-laden")); return () => clearTimeout(timer); }, [zustand]);
  const fehler = zustand === "fehler", chat = bereich === "chat", postfach = bereich === "postfach", Symbol = fehler ? CircleX : chat ? MessageSquareDashed : postfach ? Mail : Users;
  return <div className={zustand === "laden" ? "lz-laden" : `lz-${bereich} ${fehler ? "lz-fehler" : ""}`} role="region" aria-label={bereich === "team" ? "Team" : chat ? "Chat" : "Postfach"} aria-busy={zustand === "laden" || undefined}>
    {zustand === "laden" ? platzhalter && <>{[0, 1].map(i => <div className="lz-platz" key={i} aria-hidden="true"><i /><span><i /><i /></span></div>)}<p className="lz-notiz">Lädt das Team …</p></> : <>{postfach && <div className="lz-kopf">Postfach</div>}<div className="lz-feld"><span className="lz-sym"><Symbol size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></span><p className={chat ? "lz-abschnitt" : "lz-titel"}>{fehler ? "Team nicht geladen." : chat ? "Was soll gebaut werden?" : postfach ? "Nichts wartet auf dich." : "Noch keine Agenten."}</p><p className={chat ? "lz-text" : "lz-zeile"}>{fehler ? "Der Orchestrator antwortet nicht." : chat ? "Schreib dem Orchestrator in eigenen Worten. Er plant, startet Agenten und fragt nach, wenn etwas fehlt." : postfach ? "Fragen und Freigaben der Agenten landen hier." : "Sie erscheinen, sobald der Orchestrator sie startet."}</p>{fehler && <Knopf text="Erneut versuchen" onClick={erneut} />}{chat && <p className="lz-zeile">Ab 0.2: <span className="taste">/</span> zeigt Befehle, <span className="taste">@</span> holt Dateien und Agenten dazu.</p>}</div></>}
  </div>;
}
