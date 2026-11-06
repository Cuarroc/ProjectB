import { useEffect, useState } from "react";
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
export function ChatEingabeAnsicht({ chat, modelle, text, fehler, aendern, schreiben, senden }: {
  chat: Chat; modelle: string[]; text: string; fehler: string;
  aendern: (werte: Partial<Chat>) => void; schreiben: (text: string) => void; senden: (text: string) => void;
}) {
  return <footer className="chat-eingabe">
    <span className="ein-sr" id="modus-hilfe">{erklaerungen[modi.indexOf(chat.modus)]}</span>
    <Eingabefeld id="chat-nachricht" text={text} onTextAendern={schreiben} onSenden={senden} fehler={fehler}
      ohneAnhaengen beschreibungId="modus-hilfe"
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
  useEffect(() => { const lesen = () => setDaten(quelle.lesen()); const ab = quelle.abonnieren(lesen); lesen(); return ab; }, [quelle]);
  const chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  if (!chat) return null;
  const aendern = (werte: Partial<Chat>) => {
    const neu = quelle.lesen(), ziel = neu.chats.find(c => c.id === chat.id)!;
    if (werte.kontextfenster && !Object.hasOwn(werte, "kontextProzent")) werte.kontextProzent = ziel.kontextProzent * ziel.kontextfenster / werte.kontextfenster;
    Object.assign(ziel, werte); quelle.aktualisieren(neu);
  };
  return <ChatEingabeAnsicht chat={chat} modelle={[...new Set([...daten.chats, ...daten.agenten].map(a => a.modell))]}
    text={text} fehler={fehler} aendern={aendern} schreiben={schreiben} senden={inhalt => {
      try { nachrichtAblegen(quelle, inhalt); schreiben(""); setFehler(""); }
      catch { setFehler("Nicht gesendet. Dein Text bleibt stehen."); }
    }} />;
}
