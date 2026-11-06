import { beispiel } from "./beispiel";
import type { Datenstand, Plan } from "./typen";
export { orchestratorBeispiel, teamTestverlauf } from "./beispiel";

// Beispielmessungen je 30 Sekunden, in Tausend Tokens; fehlende Zukunft bleibt leer.
export const teamTokenverlauf = [
  [0, 10], [0, 10], [0, 10], [3, 11], [12, 9], [19, 8], [21, 6], [23, 8],
  [21, 7], [25, 7], [23, 9], [21, 9], [19, 8], [17, 7], [15, 6], [13, 7],
];

export interface Datenquelle {
  // Lesende Aufrufe liefern unabhängige Kopien. Änderungen werden danach gemeldet.
  lesen(): Datenstand;
  lesePlan(): Plan & { fertig: number; gesamt: number };
  // Die Rückgabe beendet nur dieses Abo, auch bei mehrfacher Anmeldung derselben Funktion.
  abonnieren(beiAenderung: () => void): () => void;
}

export class BeispielQuelle implements Datenquelle {
  private daten: Datenstand;
  private readonly abos = new Set<() => void>();

  constructor(daten: Datenstand = beispiel) {
    this.daten = structuredClone(daten);
  }

  lesen(): Datenstand {
    return structuredClone(this.daten);
  }

  lesePlan(): Plan & { fertig: number; gesamt: number } {
    const plan = structuredClone(this.daten.plan);
    return { ...plan, fertig: plan.schritte.filter(s => s.zustand === "Fertig").length,
      gesamt: plan.schritte.length };
  }

  abonnieren(beiAenderung: () => void): () => void {
    const abo = () => beiAenderung();
    this.abos.add(abo);
    return () => { this.abos.delete(abo); };
  }

  // Nur die Beispielumsetzung: ermöglicht simulierte Änderungen ohne UI oder Backend.
  aktualisieren(daten: Datenstand): void {
    this.daten = structuredClone(daten);
    for (const abo of [...this.abos]) abo();
  }
}
