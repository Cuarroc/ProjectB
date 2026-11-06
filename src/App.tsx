import "./App.css";
import Vorschau from "./bausteine/Vorschau";
import Vorschau3 from "./bausteine/Vorschau3";
import Kopf from "./bereiche/Kopf";
import ChatListe from "./bereiche/ChatListe";
import ChatVerlauf from "./bereiche/ChatVerlauf";
import ChatEingabe from "./bereiche/ChatEingabe";
import Team from "./bereiche/Team";

export default function App() {
  if (new URLSearchParams(window.location.search).get("vorschau") === "eingabe") return <Vorschau3 />;
  if (new URLSearchParams(window.location.search).get("vorschau") === "bausteine") return <Vorschau />;
  return (
    <div className="app-rahmen">
      <Kopf />
      <main className="hauptbildschirm" aria-label="Hauptbildschirm">
        <ChatListe />
        <section className="chat-spalte" aria-labelledby="chat">
          <ChatVerlauf />
          <ChatEingabe />
        </section>
        <Team />
      </main>
    </div>
  );
}
