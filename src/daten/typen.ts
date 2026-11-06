export type Zustand = "Arbeitet" | "Wartet auf dich" | "Fertig" | "Problem";
export type Anbieter = "Claude" | "Codex";
export type Effort = "Niedrig" | "Mittel" | "Hoch" | "Sehr hoch";
export type Aktion = { id: string; text: string };
export type Agent = {
  id: string; name: string; anbieter: Anbieter; modell: string; effort: Effort;
  zustand: Zustand; fortschritt: number; arbeitskopie: string;
  liveZeile: string; tokens: number; laufzeitSekunden: number;
  phasen: { name: string; start: string; ende: string | null }[];
  dateien: { pfad: string; hinzugefuegt: number; entfernt: number }[];
  letzteZeilen: string[];
  tests: { gruenSeit: string | null; gruen: number; gesamt: number;
    verlauf: { zeit: string; rot: number }[] } | null;
  schaetzung: { fertigUm: string; restMinuten: number } | null;
};
export type Nachricht = {
  id: string; von: "Du" | "Orchestrator"; zeit: string; text: string;
  aktionen: Aktion[]; planId?: string; frageId?: string;
};
export type Markierung = "Kommentar" | "Ausarbeiten" | "Simpler" | "Ausführlicher" | "Innovativer";
export type Planschritt = {
  id: string; titel: string; agentId: string | null; zustand: Zustand | "Offen";
  dauerMinuten: number; fertigWenn: { text: string; erfuellt: boolean }[];
  beschreibung: string;
  kommentar: string; markierungen: Markierung[];
};
export type Plan = {
  id: string; titel: string; schritte: Planschritt[]; freigabe: "Wartet auf dich" | "Freigegeben";
};
export type Frage = {
  id: string; agentId: string | null; text: string; antwortknoepfe: Aktion[];
};
export type Todo = { id: string; text: string; fertig: boolean };
export type Ausgabe = { id: string; sitzungId: string; name: string; pfad: string };
export type Beleg = { id: string; agentId: string; titel: string; prLink: string };
export type Kontingent = { claude: number; codex: number; soll: number };
export type Chat = {
  id: string; titel: string; verlauf: Nachricht[]; gestartetUm: string | null;
  modus: "Ausführen" | "Planen" | "Interview";
  modell: string; effort: Effort; kontextfenster: number; kontextProzent: number;
};
export type Kopf = {
  projekt: string; pfad: string; zweig: string; projekte: string[];
  kontingent: Kontingent; postfach: number;
};
export type Berechtigungsstufe = "Vorsichtig" | "Nur bei Wichtigem" | "Autonom";
export type Berechtigungen = {
  aktuell: Berechtigungsstufe;
  stufen: { name: Berechtigungsstufe; beschreibung: string }[];
  regeln: { text: string; stufen: Record<Berechtigungsstufe, "Allein" | "Fragt dich" | "Legt es dir hin" | "Nie"> }[];
  giltImmer: string[];
};
export type Datenstand = {
  chats: Chat[]; aktiverChatId: string | null;
  agenten: Agent[]; plan: Plan; fragen: Frage[]; todos: Todo[];
  ausgaben: Ausgabe[]; belege: Beleg[]; kopf: Kopf; berechtigungen: Berechtigungen;
};
