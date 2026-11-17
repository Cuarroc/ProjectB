import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { prOeffnen } from "../daten/tauri";

export function PrLink({ url }: { url: string }) {
  const [fehler, setFehler] = useState("");
  useEffect(() => {
    if (!fehler) return;
    const timer = setTimeout(() => setFehler(""), 4000);
    return () => clearTimeout(timer);
  }, [fehler]);
  return <><a href={url} target="_blank" rel="noreferrer" onClick={async e => {
    if (!isTauri()) return;
    e.preventDefault();
    try { await prOeffnen(url); }
    catch (e) { setFehler(e instanceof Error ? e.message : String(e)); }
  }}>PR ansehen</a>{fehler && <span role="status">{fehler}</span>}</>;
}
