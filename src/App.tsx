import "./App.css";

export default function App() {
  return (
    <div className="app-rahmen">
      <header className="app-kopf"><h1>ProjectB</h1></header>
      <main className="hauptbildschirm" aria-label="Hauptbildschirm">
        <section aria-labelledby="chats"><h2 id="chats">Chats</h2></section>
        <section aria-labelledby="chat"><h2 id="chat">Chat</h2></section>
        <section aria-labelledby="team"><h2 id="team">Team</h2></section>
      </main>
    </div>
  );
}
