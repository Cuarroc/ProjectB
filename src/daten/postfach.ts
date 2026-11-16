import type { Datenstand } from "./typen";

export function postfach(daten: Datenstand) {
  const eintraege = daten.kopf.geoeffnet ? daten.chats.flatMap(chat => chat.verlauf
    .filter(n => n.von === "Orchestrator" && n.aktionen.length > 0)
    .map(n => ({ chatId: chat.id, nachrichtId: n.id, titel: chat.titel,
      text: n.aktionen.some(a => a.id === "plan-freigeben" || a.id === "plan-kommentieren")
        ? "Plan wartet auf Freigabe" : "Frage wartet auf Antwort" }))) : [];
  return { eintraege, zahl: daten.kopf.geoeffnet ? eintraege.length : daten.kopf.postfach };
}
