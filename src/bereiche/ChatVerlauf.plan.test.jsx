import { expect, it, vi } from "vitest";
import ChatVerlauf from "./ChatVerlauf";
import Planfenster from "./Planfenster";
import { BeispielQuelle } from "../daten/quelle";
import { antwortPlan } from "../daten/plan";
const h = vi.hoisted(() => ({ werte: [], i: 0 }));
vi.mock("react", async original => ({ ...await original(), useEffect: () => {}, useRef: () => ({ current: null }),
  useSyncExternalStore: (_abo, lesen) => lesen(), useState: initial => {
    const i = h.i++; if (!(i in h.werte)) h.werte[i] = typeof initial === "function" ? initial() : initial;
    return [h.werte[i], wert => { h.werte[i] = wert; }];
  } }));
const knoten = n => Array.isArray(n) ? n.flatMap(knoten) : n?.props ? [n, ...knoten(n.props.children)] : [];
it("leitet Fenster-Freigabe und Chat-Freigabe an dieselbe Nachrichtenaktion weiter", () => {
  h.werte = []; const quelle = new BeispielQuelle(), daten = quelle.lesen(), onAktion = vi.fn();
  const plan = antwortPlan("- [ ] Export", "echt");
  daten.chats[0].verlauf = [{ id: plan.id, von: "Orchestrator", text: "- [ ] Export", zeit: "12:00", plan, aktionen: [{ id: "plan-freigeben", text: "Freigeben und bauen" }] }];
  quelle.aktualisieren(daten);
  const ansicht = () => { h.i = 0; return knoten(ChatVerlauf({ quelle, onAktion })); };
  ansicht().find(n => n.props.text === "Freigeben und bauen").props.onClick();
  ansicht().find(n => n.props.text === "Plan öffnen").props.onClick();
  const fenster = ansicht().find(n => n.type === Planfenster);
  expect(fenster.props.plan).toEqual(plan);
  knoten(Planfenster(fenster.props)).find(n => n.props.text === "Freigeben und bauen").props.onClick();
  expect(onAktion.mock.calls.map(([id, aktion]) => [id, aktion])).toEqual([[plan.id, "plan-freigeben"], [plan.id, "plan-freigeben"]]);
});
it("schickt auch einen reinen Stilwunsch aus dem echten Fenster zurück", () => {
  h.werte = []; h.i = 0; const onEntscheiden = vi.fn(), plan = antwortPlan("- [ ] Export", "n");
  const baum = knoten(Planfenster({ daten: { agenten: [] }, plan, gespeicherteMarken: {}, onSchliessen: vi.fn(), onEntscheiden }));
  expect(baum.filter(n => ["pl-warum", "pl-chips"].includes(n.props.className))).toEqual([]);
  baum.find(n => n.props.text === "Neu schreiben lassen").props.onClick();
  expect(onEntscheiden).toHaveBeenCalledWith(plan, {}, "Ausführlicher");
});
it("reicht die Textmarken des echten Fensters an die Kommentar-Nachricht weiter", () => {
  h.werte = []; const quelle = new BeispielQuelle(), daten = quelle.lesen(), onAktion = vi.fn(), plan = antwortPlan("- [ ] Export", "echt");
  daten.chats[0].verlauf = [{ id: plan.id, von: "Orchestrator", text: "- [ ] Export", zeit: "12:00", plan, aktionen: [{ id: "plan-kommentieren", text: "Mit Kommentaren zurückgeben" }] }]; quelle.aktualisieren(daten);
  const ansicht = () => { h.i = 0; return knoten(ChatVerlauf({ quelle, onAktion })); };
  ansicht().find(n => n.props.text === "Plan öffnen").props.onClick();
  ansicht().find(n => n.type === Planfenster).props.onEntscheiden(plan, { [`${plan.schritte[0].id}:titel`]: { name: "Simpler", start: 0, ende: 3 } }, "Simpler");
  expect(onAktion).toHaveBeenCalledWith(plan.id, "plan-kommentieren", expect.stringContaining("  - „Exp“ (Titel): Simpler"));
});
