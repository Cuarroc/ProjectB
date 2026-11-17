import type { Agent, Chat, Plan } from "./typen";

export function teamAuftraege(plan: Plan, chat: Pick<Chat, "modell" | "effort">, plantext: string, hinweise?: string) {
  const namen = new Set<string>();
  const anbieter: Agent["anbieter"] = chat.modell === "gpt-6.1-sol" ? "Codex" : "Claude";
  return plan.schritte.slice(0, 3).map((erster, i) => {
    const basis = erster.titel.toLowerCase().replace(/[äöüß]/g, z => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[z]!)
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/g, "") || `schritt-${i + 1}`;
    let name = basis;
    for (let n = 2; namen.has(name); n++) {
      const suffix = `-${n}`; name = basis.slice(0, 30 - suffix.length).replace(/-+$/g, "") + suffix;
    }
    namen.add(name);
    const schritte = plan.schritte.filter((_, j) => j % 3 === i).map(s =>
      `${s.titel}\n${s.beschreibung}\n${s.fertigWenn.map(k => `Fertig, wenn ${k.text}`).join("\n")}`).join("\n\n");
    return { name, anbieter, modell: chat.modell, effort: chat.effort,
      text: `Freigegebener Plan (ganz):\n${plantext}\n\nDeine Schritte:\n${schritte}${hinweise ? `\n\nBeachte dabei:\n${hinweise}` : ""}\n\nArbeite nur in deiner Arbeitskopie. Committe am Ende mit einer kurzen Nachricht.` };
  });
}
