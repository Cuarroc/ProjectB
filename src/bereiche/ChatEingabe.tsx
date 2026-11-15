import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { auftragSenden, chatNachrichtenHoeren } from "../daten/tauri";
import { BeispielQuelle } from "../daten/quelle";
import type { Chat } from "../daten/typen";
import { Eingabefeld } from "../bausteine/Eingabefeld";
import { Modi, Auswahl, Kontext, EffortSymbol, efforts, erklaerungen, modi } from "./chat-eingabe/Auswahlen";
import "./chat-eingabe/ChatEingabe.css";
import { Einstellungen } from "./chat-eingabe/Einstellungen";

export const chatEingabeQuelle = new BeispielQuelle();
export function nachrichtAblegen(quelle: BeispielQuelle, text: string) {
  const daten = quelle.lesen(), chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  if (!chat) throw new Error("Kein Chat ausgewählt.");
  chat.verlauf.push({ id: crypto.randomUUID(), von: "Du", zeit: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }), text, aktionen: [] });
  quelle.aktualisieren(daten);
}
function orchestratorNachricht(quelle: BeispielQuelle, id: string, text: string) {
  const daten = quelle.lesen(), chat = daten.chats.find(c => c.id === id);
  if (!chat) return;
  chat.verlauf.push({ id: crypto.randomUUID(), von: "Orchestrator", zeit: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }), text, aktionen: [] });
  quelle.aktualisieren(daten);
}
export function ChatEingabeAnsicht({ chat, modelle, text, fehler, laeuft = false, aendern, schreiben, senden }: {
  chat: Chat; modelle: string[]; text: string; fehler: string;
  laeuft?: boolean;
  aendern: (werte: Partial<Chat>) => void; schreiben: (text: string) => void; senden: (text: string) => void;
}) {
  return <footer className="chat-eingabe">
    {laeuft && <p className="ein-arbeitet" id="chat-arbeitet" role="status">Orchestrator arbeitet … Bitte warte vor dem nächsten Senden.</p>}
    <span className="ein-sr" id="modus-hilfe">{erklaerungen[modi.indexOf(chat.modus)]}</span>
    <Eingabefeld id="chat-nachricht" text={text} onTextAendern={schreiben} onSenden={senden} fehler={fehler}
      ohneAnhaengen sendet={laeuft} beschreibungId={laeuft ? "modus-hilfe chat-arbeitet" : "modus-hilfe"}
      kopf={<div className="ein-moduszeile"><Modi wert={chat.modus} aendern={modus => aendern({ modus: modus as Chat["modus"] })} /><Einstellungen modus={chat.modus} /></div>}
      werkzeuge={<>
        <Auswahl name="Modell" wert={chat.modell} werte={modelle} aendern={modell => aendern({ modell, kontextfenster: modell === "Opus 5.5" ? chat.kontextfenster : 256000 })}>
          <span className="modell-punkt" /><span className="lang">{chat.modell}</span><span className="kurz">{chat.modell.split(/[ .-]/)[0]}</span>
        </Auswahl>
        <Auswahl name="Effort" wert={chat.effort} werte={efforts} aendern={effort => aendern({ effort: effort as Chat["effort"] })}>
          <EffortSymbol wert={chat.effort} /><span className="wort">Effort</span>{" "}{chat.effort}
        </Auswahl>
        <Kontext chat={chat} aendern={aendern} />
      </>} />
  </footer>;
}
export default function ChatEingabe({ quelle = chatEingabeQuelle }: { quelle?: BeispielQuelle }) {
  const [daten, setDaten] = useState(() => quelle.lesen()), [text, schreiben] = useState(""), [fehler, setFehler] = useState("");
  const laufende = useRef(new Set<string>()), empfang = useRef<Promise<() => void>>(Promise.resolve(() => {}));
  useEffect(() => { const lesen = () => setDaten(quelle.lesen()); const ab = quelle.abonnieren(lesen); lesen(); return ab; }, [quelle]);
  useEffect(() => {
    let beendet = false, abmelden = () => {};
    empfang.current = chatNachrichtenHoeren((id, text) => { if (!beendet) orchestratorNachricht(quelle, id, text); });
    empfang.current.then(ab => { if (beendet) ab(); else abmelden = ab; }, e => {
      if (!beendet) setFehler(`Antworten nicht empfangbar: ${e instanceof Error ? e.message : String(e)}`);
    });
    return () => { beendet = true; abmelden(); };
  }, [quelle]);
  const chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  if (!chat) return null;
  const aendern = (werte: Partial<Chat>) => {
    const neu = quelle.lesen(), ziel = neu.chats.find(c => c.id === chat.id)!;
    if (werte.kontextfenster && !Object.hasOwn(werte, "kontextProzent")) werte.kontextProzent = ziel.kontextProzent * ziel.kontextfenster / werte.kontextfenster;
    Object.assign(ziel, werte); quelle.aktualisieren(neu);
  };
  return <ChatEingabeAnsicht chat={chat} modelle={["Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "gpt-6.1-sol"]}
    text={text} fehler={fehler} laeuft={laufende.current.has(chat.id)} aendern={aendern} schreiben={schreiben} senden={async inhalt => {
      if (laufende.current.has(chat.id)) { setFehler("Dieser Chat läuft bereits. Bitte warte auf die Antwort."); return; }
      if (isTauri() && !quelle.lesen().kopf.geoeffnet) { setFehler("Bitte zuerst oben ein Projekt öffnen."); return; }
      try { nachrichtAblegen(quelle, inhalt); schreiben(""); setFehler(""); }
      catch { setFehler("Nicht gesendet. Dein Text bleibt stehen."); return; }
      if (!isTauri()) return;
      laufende.current.add(chat.id);
      aendern({ gestartetUm: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) });
      const aktuell = quelle.lesen(), ziel = aktuell.chats.find(c => c.id === chat.id)!;
      const pfad = aktuell.kopf.pfad, sitzung = ziel.sitzung ?? null;
      try {
        await empfang.current;
        const antwort = await auftragSenden({ chat: ziel.id, pfad, modell: ziel.modell, effort: ziel.effort, sitzung, text: inhalt });
        aendern({ sitzung: antwort.sitzung });
      } catch (e) { orchestratorNachricht(quelle, chat.id, `Problem: ${e instanceof Error ? e.message : String(e)}`); }
      finally { laufende.current.delete(chat.id); aendern({ gestartetUm: null }); }
    }} />;
}
