import type { Datenstand } from "./typen";

export function postfach(daten: Datenstand) {
  const eintraege = daten.kopf.geoeffnet ? daten.chats.flatMap(chat => chat.verlauf
    .filter((n, index) => n.von === "Orchestrator" && !n.text.startsWith("Problem:") &&
      (n.aktionen.length > 0 || (chat.modus === "Interview" && !chat.gestartetUm && index === chat.verlauf.length - 1)))
    .map(n => ({ chatId: chat.id, nachrichtId: n.id, titel: chat.titel,
      text: n.aktionen.some(a => a.id === "plan-freigeben" || a.id === "plan-kommentieren")
        ? "Plan wartet auf Freigabe" : "Frage wartet auf Antwort" }))) : [];
  return { eintraege, zahl: daten.kopf.geoeffnet ? eintraege.length : daten.kopf.postfach };
}
