import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { auftragSenden, chatNachrichtenHoeren } from "../daten/tauri";
import { antwortPlan } from "../daten/plan";
import { BeispielQuelle } from "../daten/quelle";
import type { Chat, Todo } from "../daten/typen";
import { Eingabefeld } from "../bausteine/Eingabefeld";
import { Modi, Auswahl, Kontext, EffortSymbol, efforts, erklaerungen, modi } from "./chat-eingabe/Auswahlen";
import "./chat-eingabe/ChatEingabe.css";
import { Einstellungen } from "./chat-eingabe/Einstellungen";

export const chatEingabeQuelle = new BeispielQuelle();
const planAktionen = [
  { id: "plan-freigeben", text: "Freigeben und bauen" },
  { id: "plan-kommentieren", text: "Mit Kommentaren zurückgeben" },
];
function antwortTodos(text: string) {
  let liste: Todo[] | undefined, inListe = false;
  let codeZaun = "";
  for (const zeile of text.split(/\r?\n/)) {
    const zaun = zeile.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
    if (codeZaun) {
      if (zaun && zaun[1][0] === codeZaun[0] && zaun[1].length >= codeZaun.length && !zaun[2].trim()) codeZaun = "";
      continue;
    }
    if (zaun) { codeZaun = zaun[1]; continue; }
    const punkt = zeile.match(/^[ \t]*[-*][ \t]+\[([ xX])\][ \t]+(\S.*)$/);
    if (!punkt) { if (zeile.trim() && !/^[ \t]/.test(zeile)) inListe = false; continue; }
    if (!inListe || !liste) liste = [];
    inListe = true;
    if (liste.length < 20) liste.push({ id: crypto.randomUUID(),
      text: punkt[2].trimEnd().replace(/(\*\*|\*|`)(.+?)\1/g, "$2"), fertig: punkt[1] !== " ", von: "Orchestrator" });
  }
  return liste;
}
function interviewAktionen(text: string) {
  const punkte: string[] = [];
  for (const zeile of text.trimEnd().split(/\r?\n/).reverse()) {
    if (!zeile.trim()) continue;
    const punkt = zeile.match(/^[ \t]*(?:[-*]|\d+\.)[ \t]+(\S.*)$/);
    if (!punkt) break;
    punkte.unshift(punkt[1].trimEnd());
  }
  return punkte.length >= 2 && punkte.length <= 4
    ? punkte.map((antwort, i) => {
      const klartext = antwort.replace(/(\*\*|\*|`)(.+?)\1/g, "$2"), zeichen = Array.from(klartext);
      // Ganze Wörter erhalten, damit sichtbarer Text und zugänglicher Name übereinstimmen.
      return { id: `antwort-${i}`, text: zeichen.length > 80 ? zeichen.slice(0, 79).join("").replace(/\s+\S*$/, "") + "…" : klartext, antwort };
    }) : [];
}
function textMitVerlauf(chat: Chat, pfad: string, text: string) {
  const anbieter = chat.modell === "gpt-6.1-sol" ? "codex" : "claude";
  if (!chat.verlauf.length || (chat.sitzung?.anbieter.toLowerCase() === anbieter && chat.sitzung.pfad === pfad)) return text;
  const nachrichten = chat.verlauf.slice(-20).map(n => `${n.von}: ${n.text}`);
  let gekuerzt = chat.verlauf.length > 20;
  const kontext = () => `Bisheriger Verlauf dieses Chats (zur Einordnung):\n\n${gekuerzt ? "[Verlauf gekürzt: Älteste Nachrichten ausgelassen.]\n\n" : ""}${nachrichten.join("\n\n")}`;
  while (kontext().length > 20000) { nachrichten.shift(); gekuerzt = true; }
  return `${kontext()}\n\nNeue Nachricht:\n${text}`;
}
export function nachrichtAblegen(quelle: BeispielQuelle, text: string) {
  const daten = quelle.lesen(), chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  if (!chat) throw new Error("Kein Chat ausgewählt.");
  chat.verlauf.forEach(n => { n.aktionen = []; });
  chat.verlauf.push({ id: crypto.randomUUID(), von: "Du", zeit: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }), text, aktionen: [] });
  quelle.aktualisieren(daten);
}
function orchestratorNachricht(quelle: BeispielQuelle, id: string, text: string, todos?: Todo[]) {
  const daten = quelle.lesen(), chat = daten.chats.find(c => c.id === id);
  if (!chat) return;
  if (todos) {
    const eigene = (chat.todos ?? []).filter(t => t.von === "Du");
    const erledigt = new Set((chat.todos ?? []).filter(t => t.von !== "Du" && t.fertig).map(t => t.text.trim().toLowerCase()));
    todos.forEach(t => { if (erledigt.has(t.text.trim().toLowerCase())) t.fertig = true; });
    chat.todos = [...todos.slice(0, Math.max(0, 20 - eigene.length)), ...eigene];
  }
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
  const eingabe = useChatEingabe(quelle);
  return eingabe ? <ChatEingabeAnsicht {...eingabe} /> : null;
}
export function useChatEingabe(quelle = chatEingabeQuelle) {
  const [daten, setDaten] = useState(() => quelle.lesen()), [text, schreiben] = useState(""), [fehler, setFehler] = useState("");
  const laufende = useRef(new Set<string>()), empfang = useRef<Promise<() => void>>(Promise.resolve(() => {}));
  useEffect(() => { const lesen = () => setDaten(quelle.lesen()); const ab = quelle.abonnieren(lesen); lesen(); return ab; }, [quelle]);
  useEffect(() => {
    let beendet = false, abmelden = () => {};
    empfang.current = chatNachrichtenHoeren((id, text) => { if (!beendet) orchestratorNachricht(quelle, id, text, antwortTodos(text)); });
    empfang.current.then(ab => { if (beendet) ab(); else abmelden = ab; }, e => {
      if (!beendet) setFehler(`Antworten nicht empfangbar: ${e instanceof Error ? e.message : String(e)}`);
    });
    return () => { beendet = true; abmelden(); };
  }, [quelle]);
  const chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  if (!chat) return null;
  const aendern = (werte: Partial<Chat>) => {
    const neu = quelle.lesen(), ziel = neu.chats.find(c => c.id === chat.id)!;
    if (!ziel) return;
    if (werte.kontextfenster && !Object.hasOwn(werte, "kontextProzent")) werte.kontextProzent = ziel.kontextProzent * ziel.kontextfenster / werte.kontextfenster;
    Object.assign(ziel, werte); quelle.aktualisieren(neu);
  };
  const senden = async (inhalt: string, freigabe?: string, anzeige = inhalt) => {
    if (laufende.current.has(chat.id)) { setFehler("Dieser Chat läuft bereits. Bitte warte auf die Antwort."); return; }
    if (isTauri() && !quelle.lesen().kopf.geoeffnet) { setFehler("Bitte zuerst oben ein Projekt öffnen."); return; }
    if (freigabe) {
      const neu = quelle.lesen(), ziel = neu.chats.find(c => c.id === chat.id);
      const nachricht = ziel?.verlauf.find(n => n.id === freigabe);
      if (!ziel || !nachricht?.aktionen.some(a => a.id === "plan-freigeben")) return;
      nachricht.aktionen = []; ziel.modus = "Ausführen"; quelle.aktualisieren(neu);
    }
    let gesendet = inhalt;
    try {
      const vorher = quelle.lesen(), ziel = vorher.chats.find(c => c.id === chat.id);
      if (ziel) gesendet = textMitVerlauf(ziel, vorher.kopf.pfad, inhalt);
      nachrichtAblegen(quelle, anzeige); schreiben(""); setFehler("");
    }
    catch { setFehler("Nicht gesendet. Dein Text bleibt stehen."); return; }
    if (!isTauri()) return;
    laufende.current.add(chat.id);
    aendern({ gestartetUm: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) });
    const aktuell = quelle.lesen(), ziel = aktuell.chats.find(c => c.id === chat.id)!;
    const pfad = aktuell.kopf.pfad, sitzung = ziel.sitzung ?? null;
    const modus = ziel.modus, anfang = ziel.verlauf.length;
    try {
      await empfang.current;
      const antwort = await auftragSenden({ chat: ziel.id, pfad, modell: ziel.modell, effort: ziel.effort, modus: ziel.modus, sitzung, text: gesendet });
      aendern({ sitzung: antwort.sitzung });
      if ((modus === "Planen" || modus === "Interview") && antwort.erfolg) {
        const neu = quelle.lesen(), letzter = neu.chats.find(c => c.id === chat.id)?.verlauf.slice(anfang).reverse().find(n => n.von === "Orchestrator");
        if (letzter) { if (modus === "Planen") letzter.plan = antwortPlan(letzter.text, letzter.id); letzter.aktionen = modus === "Planen" ? planAktionen : interviewAktionen(letzter.text); quelle.aktualisieren(neu); }
      }
    } catch (e) { orchestratorNachricht(quelle, chat.id, `Problem: ${e instanceof Error ? e.message : String(e)}`); }
    finally { laufende.current.delete(chat.id); aendern({ gestartetUm: null }); }
  };
  const onAktion = (nachrichtId: string, aktionId: string, kommentar?: string) => {
    if (laufende.current.has(chat.id) || (isTauri() && !quelle.lesen().kopf.geoeffnet)) return;
    const neu = quelle.lesen(), ziel = neu.chats.find(c => c.id === chat.id);
    const nachricht = ziel?.verlauf.find(n => n.id === nachrichtId);
    const aktion = nachricht?.aktionen.find(a => a.id === aktionId);
    if (!ziel || !nachricht || !aktion) return;
    if (aktionId.startsWith("antwort-") && aktion.antwort !== undefined) {
      ziel.modus = "Interview"; quelle.aktualisieren(neu);
      return senden(aktion.antwort);
    }
    if (aktionId === "plan-freigeben") {
      if (nachricht.plan) { nachricht.plan.freigabe = "Freigegeben"; quelle.aktualisieren(neu); }
      return senden(`Der Plan ist freigegeben. Melde am Ende den Stand als Aufgabenliste (- [x] erledigt, - [ ] offen). Setze genau diesen Plan um:\n\n${nachricht.text}`, nachrichtId, "Plan freigegeben.");
    }
    if (aktionId !== "plan-kommentieren") return;
    nachricht.aktionen = []; ziel.modus = "Planen"; quelle.aktualisieren(neu);
    if (kommentar !== undefined) return senden(kommentar);
    schreiben(text.startsWith("Kommentare zum Plan: ") ? text : `Kommentare zum Plan: ${text}`); document.getElementById("chat-nachricht")?.focus();
  };
  return { chat, modelle: ["Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "gpt-6.1-sol"],
    text, fehler, laeuft: laufende.current.has(chat.id), aendern, schreiben, senden, onAktion };
}
