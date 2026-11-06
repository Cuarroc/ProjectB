import "./App.css";
import { useEffect, useState } from "react";
import { beobachteFragen } from "./bereiche/fragenHinweise";
import { PanelRightOpen } from "lucide-react";
import Vorschau from "./bausteine/Vorschau";
import Vorschau3 from "./bausteine/Vorschau3";
import Kopf from "./bereiche/Kopf";
import ChatListe from "./bereiche/ChatListe";
import ChatVerlauf from "./bereiche/ChatVerlauf";
import ChatEingabe, { chatEingabeQuelle } from "./bereiche/ChatEingabe";
import Team from "./bereiche/Team";

export default function App() {
  const [linksOffen, setLinksOffen] = useState(false);
  useEffect(() => beobachteFragen(chatEingabeQuelle), []);
  if (new URLSearchParams(window.location.search).get("vorschau") === "eingabe") return <Vorschau3 />;
  if (new URLSearchParams(window.location.search).get("vorschau") === "bausteine") return <Vorschau />;
  return (
    <div className="app-rahmen">
      <Kopf />
      <main className="hauptbildschirm" aria-label="Hauptbildschirm">
        <ChatListe quelle={chatEingabeQuelle} offen={linksOffen} umschalten={() => setLinksOffen(!linksOffen)} />
        <section className="chat-spalte" aria-labelledby="chat">
          <ChatVerlauf quelle={chatEingabeQuelle} />
          <ChatEingabe />
        </section>
        <Team />
        <nav className="team-rand" aria-label="Team, eingeklappt"><button type="button" className="team-rand-schalter" aria-label="Team öffnen" aria-expanded="false" onClick={() => setLinksOffen(false)}><PanelRightOpen size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" /></button></nav>
      </main>
    </div>
  );
}
