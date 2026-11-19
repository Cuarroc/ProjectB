import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { anhangSpeichern, auftragSenden, chatNachrichtenHoeren, teamStarten } from "../daten/tauri";
import { Anhaenge, AnhangAblage, useAnhaenge } from "./chat-eingabe/Anhaenge";
import { teamAuftraege } from "../daten/team-plan";
import { antwortPlan, aufgabenListe, markdownKlartext } from "../daten/plan";
import { BeispielQuelle } from "../daten/quelle";
import type { Chat, Todo } from "../daten/typen";
import { Eingabefeld } from "../bausteine/Eingabefeld";
import { Modi, Auswahl, Kontext, EffortSymbol, efforts, erklaerungen, modi } from "./chat-eingabe/Auswahlen";
import "./chat-eingabe/ChatEingabe.css";
import { Einstellungen } from "./chat-eingabe/Einstellungen";
import { Befehle, kompaktSperrgrund } from "./chat-eingabe/Befehle";
import { chatAnlegen, neuerChatGesperrt } from "../daten/chats";
import { allesAnhalten } from "./anhalten";

export const chatEingabeQuelle = new BeispielQuelle();
const planAktionen = [
  { id: "plan-freigeben", text: "Freigeben und bauen" },
  { id: "plan-kommentieren", text: "Mit Kommentaren zurückgeben" },
];
function antwortTodos(text: string) {
  const liste: Todo[] = aufgabenListe(text).flatMap(({ punkt }) => punkt ? [{ id: crypto.randomUUID(),
    text: markdownKlartext(punkt[2].trimEnd()), fertig: punkt[1] !== " ", von: "Orchestrator" as const }] : []).slice(0, 20);
  return liste.length ? liste : undefined;
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
      const klartext = markdownKlartext(antwort), zeichen = Array.from(klartext);
      // Ganze Wörter erhalten, damit sichtbarer Text und zugänglicher Name übereinstimmen.
      return { id: `antwort-${i}`, text: zeichen.length > 80 ? zeichen.slice(0, 79).join("").replace(/\s+\S*$/, "") + "…" : klartext, antwort };
    }) : [];
}
function textMitVerlauf(chat: Chat, pfad: string, text: string) {
  const anbieter = chat.modell === "gpt-6.1-sol" ? "codex" : "claude";
  if (!chat.verlauf.length || (chat.sitzung?.anbieter.toLowerCase() === anbieter && chat.sitzung.pfad === pfad)) return text;
  const anfang = chat.verlauf.findIndex(n => n.id === chat.zusammenfassung);
  const nachrichten = chat.verlauf.slice(anfang < 0 ? -20 : anfang).map(n => `${n.von}: ${n.text}${n.anhaenge?.length ? `\n\nAnhänge:\n${n.anhaenge.join("\n")}` : ""}`);
  let gekuerzt = anfang < 0 && chat.verlauf.length > 20;
  const kontext = () => `Bisheriger Verlauf dieses Chats (zur Einordnung):\n\n${gekuerzt ? "[Verlauf gekürzt: Älteste Nachrichten ausgelassen.]\n\n" : ""}${nachrichten.join("\n\n")}`;
  while (kontext().length > 20000 && nachrichten.length > (anfang < 0 ? 0 : 1)) { nachrichten.splice(anfang < 0 ? 0 : 1, 1); gekuerzt = true; }
  return `${kontext()}\n\nNeue Nachricht:\n${text}`;
}
export function nachrichtAblegen(quelle: BeispielQuelle, text: string, aktionenBehalten = false, anhaenge?: string[]) {
  const daten = quelle.lesen(), chat = daten.chats.find(c => c.id === daten.aktiverChatId);
  if (!chat) throw new Error("Kein Chat ausgewählt.");
  if (!aktionenBehalten) chat.verlauf.forEach(n => { n.aktionen = []; });
  chat.verlauf.push({ id: crypto.randomUUID(), von: "Du", zeit: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }), text, aktionen: [], ...(anhaenge?.length ? { anhaenge } : {}) });
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
export function ChatEingabeAnsicht({ chat, modelle, text, fehler, laeuft = false, aendern, schreiben, senden, befehl = () => {}, anzahl = 0, neuGesperrt = false, projektOffen = true, anhaenge }: {
  chat: Chat; modelle: string[]; text: string; fehler: string;
  laeuft?: boolean;
  anhaenge?: ReturnType<typeof useAnhaenge>;
  befehl?: (name: string) => void; anzahl?: number; neuGesperrt?: boolean; projektOffen?: boolean;
  aendern: (werte: Partial<Chat>) => void; schreiben: (text: string) => void; senden: (text: string) => void;
}) {
  return <AnhangAblage anhaenge={anhaenge} gesperrt={laeuft}>
    {laeuft && <p className="ein-arbeitet" id="chat-arbeitet" role="status">Orchestrator arbeitet … Bitte warte vor dem nächsten Senden.</p>}
    <span className="ein-sr" id="modus-hilfe">{erklaerungen[modi.indexOf(chat.modus)]}</span>
    <Befehle key={chat.id} text={text} anzahl={anzahl} neuGesperrt={neuGesperrt} kompaktGrund={kompaktSperrgrund(chat, laeuft, projektOffen)} kontextProzent={chat.kontextProzent} ausfuehren={name => { befehl(name); schreiben(""); }}>{(feld, abfangen, befehlFehler) =>
    <Eingabefeld feld={feld} id="chat-nachricht" text={text} onTextAendern={schreiben}
      onSenden={inhalt => { if (!abfangen(inhalt)) senden(inhalt); }} fehler={befehlFehler || fehler}
      onAnhaengen={() => anhaenge?.eingabe.current?.click()} hatAnhaenge={!!anhaenge?.dateien.length} sendet={laeuft} beschreibungId={laeuft ? "modus-hilfe chat-arbeitet" : "modus-hilfe"}
      kopf={<><div className="ein-moduszeile"><Modi wert={chat.modus} aendern={modus => aendern({ modus: modus as Chat["modus"] })} /><Einstellungen modus={chat.modus} /></div>{anhaenge && <Anhaenge {...anhaenge} gesperrt={laeuft} />}</>}
      werkzeuge={<>
        <Auswahl name="Modell" wert={chat.modell} werte={modelle} aendern={modell => aendern({ modell, kontextfenster: modell === "Opus 5.5" ? chat.kontextfenster : 256000 })}>
          <span className="modell-punkt" /><span className="lang">{chat.modell}</span><span className="kurz">{chat.modell.split(/[ .-]/)[0]}</span>
        </Auswahl>
        <Auswahl name="Effort" wert={chat.effort} werte={efforts} aendern={effort => aendern({ effort: effort as Chat["effort"] })}>
          <EffortSymbol wert={chat.effort} /><span className="wort">Effort</span>{" "}{chat.effort}
        </Auswahl>
        <Kontext chat={chat} aendern={aendern} />
      </>} />}</Befehle>
  </AnhangAblage>;
}
export default function ChatEingabe({ quelle = chatEingabeQuelle }: { quelle?: BeispielQuelle }) {
  const eingabe = useChatEingabe(quelle);
  return eingabe ? <ChatEingabeAnsicht {...eingabe} /> : null;
}
export function useChatEingabe(quelle = chatEingabeQuelle) {
  const [daten, setDaten] = useState(() => quelle.lesen()), [text, schreiben] = useState(""), [fehler, setFehler] = useState("");
  const anhaenge = useAnhaenge(setFehler), [speichert, setSpeichert] = useState(false);
  const kompaktAntworten = useRef(new Map<string, string[]>());
  const laufende = useRef(new Set<string>()), empfang = useRef<Promise<() => void>>(Promise.resolve(() => {}));
  useEffect(() => { const lesen = () => setDaten(quelle.lesen()); const ab = quelle.abonnieren(lesen); lesen(); return ab; }, [quelle]);
  useEffect(() => {
    let beendet = false, abmelden = () => {};
    empfang.current = chatNachrichtenHoeren((id, text) => { if (beendet) return;
      const puffer = kompaktAntworten.current.get(id);
      if (puffer) puffer.push(text); else orchestratorNachricht(quelle, id, text, antwortTodos(text)); });
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
  const senden = async (inhalt: string, freigabe?: string, anzeige = inhalt, kompakt = false, mitAnhaengen = false) => {
    if (laufende.current.has(chat.id)) { setFehler("Dieser Chat läuft bereits. Bitte warte auf die Antwort."); return; }
    if (isTauri() && !quelle.lesen().kopf.geoeffnet) { setFehler("Bitte zuerst oben ein Projekt öffnen."); return; }
    if (freigabe) {
      const neu = quelle.lesen(), ziel = neu.chats.find(c => c.id === chat.id);
      const nachricht = ziel?.verlauf.find(n => n.id === freigabe);
      if (!ziel || !nachricht?.aktionen.some(a => a.id === "plan-freigeben")) return;
      nachricht.aktionen = []; ziel.modus = "Ausführen"; quelle.aktualisieren(neu);
    }
    const alterVerlauf = quelle.lesen().chats.find(c => c.id === chat.id)?.verlauf ?? [];
    let gesendet = inhalt; const pfade: string[] = [];
    laufende.current.add(chat.id);
    try {
      if (mitAnhaengen && anhaenge.dateien.length) {
        setSpeichert(true); const projekt = quelle.lesen().kopf.pfad;
        for (const { datei } of anhaenge.dateien) pfade.push(await anhangSpeichern(projekt, datei));
        if (quelle.lesen().aktiverChatId !== chat.id || quelle.lesen().kopf.pfad !== projekt) throw new Error("Chat oder Projekt gewechselt.");
        inhalt += `\n\nAnhänge:\n${pfade.join("\n")}`;
      }
      const vorher = quelle.lesen(), ziel = vorher.chats.find(c => c.id === chat.id);
      if (ziel) gesendet = textMitVerlauf(ziel, vorher.kopf.pfad, inhalt);
      nachrichtAblegen(quelle, anzeige, kompakt, pfade); if (mitAnhaengen) { schreiben(aktuell => aktuell === anzeige ? "" : aktuell); anhaenge.leeren(); } setFehler("");
    }
    catch (e) { laufende.current.delete(chat.id); setFehler(`Nicht gesendet: ${e instanceof Error ? e.message : String(e)}`); return; }
    finally { setSpeichert(false); }
    if (!isTauri()) { laufende.current.delete(chat.id); return; }
    if (kompakt) kompaktAntworten.current.set(chat.id, []);
    aendern({ gestartetUm: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) });
    const aktuell = quelle.lesen(), ziel = aktuell.chats.find(c => c.id === chat.id)!;
    const pfad = aktuell.kopf.pfad, sitzung = ziel.sitzung ?? null;
    const modus = ziel.modus, anfang = ziel.verlauf.length;
    try {
      await empfang.current;
      const antwort = await auftragSenden({ chat: ziel.id, pfad, modell: ziel.modell, effort: ziel.effort, modus: ziel.modus, sitzung, text: gesendet });
      if (kompakt) {
        const text = kompaktAntworten.current.get(chat.id)!.join("\n\n").trim();
        if (!antwort.erfolg || !text) throw new Error(text || "Keine Zusammenfassung empfangen.");
        orchestratorNachricht(quelle, chat.id, text);
        const ziel = quelle.lesen().chats.find(c => c.id === chat.id);
        if (ziel) aendern({ sitzung: null, kontextProzent: 0, zusammenfassung: ziel.verlauf.at(-1)!.id });
      } else aendern({ sitzung: antwort.sitzung });
      if (!kompakt && (modus === "Planen" || modus === "Interview") && antwort.erfolg) {
        const neu = quelle.lesen(), letzter = neu.chats.find(c => c.id === chat.id)?.verlauf.slice(anfang).reverse().find(n => n.von === "Orchestrator");
        if (letzter) { if (modus === "Planen") letzter.plan = antwortPlan(letzter.text, letzter.id); letzter.aktionen = modus === "Planen" ? planAktionen : interviewAktionen(letzter.text); quelle.aktualisieren(neu); }
      }
    } catch (e) {
      const problem = `Problem: ${e instanceof Error ? e.message : String(e)}`;
      if (kompakt) { aendern({ verlauf: alterVerlauf }); setFehler(problem); }
      else orchestratorNachricht(quelle, chat.id, problem);
    }
    finally { kompaktAntworten.current.delete(chat.id); laufende.current.delete(chat.id); aendern({ gestartetUm: null }); }
  };
  const onAktion = async (nachrichtId: string, aktionId: string, kommentar?: string) => {
    if (laufende.current.has(chat.id)) return;
    if (isTauri() && !quelle.lesen().kopf.geoeffnet) { setFehler("Bitte zuerst oben ein Projekt öffnen."); return; }
    const neu = quelle.lesen(), ziel = neu.chats.find(c => c.id === chat.id);
    const nachricht = ziel?.verlauf.find(n => n.id === nachrichtId);
    const aktion = nachricht?.aktionen.find(a => a.id === aktionId);
    if (!ziel || !nachricht || !aktion) return;
    if (aktionId.startsWith("antwort-") && aktion.antwort !== undefined) {
      ziel.modus = "Interview"; quelle.aktualisieren(neu);
      return senden(aktion.antwort);
    }
    if (aktionId === "plan-freigeben") {
      const hinweise = kommentar?.split("\n").slice(1).join("\n");
      if (isTauri() && nachricht.plan?.schritte.length) {
        laufende.current.add(chat.id); setFehler("");
        aendern({ gestartetUm: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) });
        try {
          const auftraege = teamAuftraege(nachricht.plan, ziel, nachricht.text, hinweise);
          await teamStarten(neu.kopf.pfad, auftraege);
          const aktuell = quelle.lesen(), zielChat = aktuell.chats.find(c => c.id === chat.id);
          const plan = zielChat?.verlauf.find(n => n.id === nachrichtId)?.plan;
          if (zielChat && plan) {
            plan.freigabe = "Freigegeben"; zielChat.modus = "Ausführen";
            zielChat.verlauf.forEach(n => { if (n.id === nachrichtId) n.aktionen = []; }); quelle.aktualisieren(aktuell);
            orchestratorNachricht(quelle, chat.id, `Plan freigegeben. Team mit ${auftraege.length} Agenten gestartet.`);
          }
        } catch (e) { setFehler(e instanceof Error ? e.message : String(e)); }
        finally { laufende.current.delete(chat.id); aendern({ gestartetUm: null }); }
        return;
      }
      if (nachricht.plan) { nachricht.plan.freigabe = "Freigegeben"; quelle.aktualisieren(neu); }
      return senden(`Der Plan ist freigegeben. Melde am Ende den Stand als Aufgabenliste (- [x] erledigt, - [ ] offen). Setze genau diesen Plan um:\n\n${nachricht.text}${hinweise ? `\n\nBeachte dabei:\n${hinweise}` : ""}`, nachrichtId, "Plan freigegeben.");
    }
    if (aktionId !== "plan-kommentieren") return;
    nachricht.aktionen = []; ziel.modus = "Planen"; quelle.aktualisieren(neu);
    if (kommentar !== undefined) return senden(kommentar);
    schreiben(text.startsWith("Kommentare zum Plan: ") ? text : `Kommentare zum Plan: ${text}`); document.getElementById("chat-nachricht")?.focus();
  };
  return { chat, projektOffen: !isTauri() || !!daten.kopf.geoeffnet, neuGesperrt: neuerChatGesperrt(daten), modelle: ["Opus 5.5", "Sonnet 5.5", "Haiku 5.5", "gpt-6.1-sol"],
    anzahl: daten.agenten.filter(a => a.zustand === "Arbeitet").length,
    befehl: (name: string) => {
      if (name === "kompakt") {
        const aktuell = quelle.lesen(), ziel = aktuell.chats.find(c => c.id === chat.id);
        if (!ziel) return;
        const grund = kompaktSperrgrund(ziel, laufende.current.has(chat.id), !isTauri() || !!aktuell.kopf.geoeffnet);
        if (grund) { setFehler(grund); return; }
        return senden("Fasse den bisherigen Verlauf knapp zusammen: Ziel, Entscheidungen, offene Punkte und wichtige Dateien. Höchstens etwa 300 Wörter. Ändere nichts.", undefined, "Verlauf wird zusammengefasst …", true);
      }
      if (name === "neu") chatAnlegen(quelle);
      else if (name === "anhalten") allesAnhalten.setzen(true);
      else if (name === "planen" || name === "interview") aendern({ modus: name === "planen" ? "Planen" : "Interview" }); },
    text, fehler, anhaenge, laeuft: speichert || laufende.current.has(chat.id), aendern, schreiben, senden: (inhalt: string) => senden(inhalt, undefined, inhalt, false, true), onAktion };
}
