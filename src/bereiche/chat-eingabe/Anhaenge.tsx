import { useEffect, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { FileText, FileUp, Trash2 } from "lucide-react";
import "./Anhaenge.css";

export function AnhangAblage({ anhaenge, gesperrt = false, children }: { anhaenge?: ReturnType<typeof useAnhaenge>; gesperrt?: boolean; children: ReactNode }) {
  const tiefe = useRef(0), [anzahl, setzen] = useState<number | null>(null);
  const schliessen = () => { tiefe.current = 0; setzen(null); };
  useEffect(() => { if (gesperrt) schliessen(); }, [gesperrt]);
  useEffect(() => {
    const abfangen = (event: globalThis.DragEvent) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
      event.preventDefault();
      // Vor der Eingabe abfangen, damit deren Handler anschließend copy setzen kann.
      if (event.type === "dragover" && event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", abfangen, { capture: true });
    window.addEventListener("drop", abfangen, { capture: true });
    return () => {
      window.removeEventListener("dragover", abfangen, { capture: true });
      window.removeEventListener("drop", abfangen, { capture: true });
    };
  }, []);
  useEffect(() => {
    if (anzahl === null) return;
    const taste = (event: KeyboardEvent) => { if (event.key === "Escape") schliessen(); };
    window.addEventListener("keydown", taste, true); return () => window.removeEventListener("keydown", taste, true);
  }, [anzahl]);
  const dateien = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  const ziehen = (event: DragEvent, betreten = false) => {
    if (!dateien(event)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = gesperrt ? "none" : "copy";
    if (gesperrt || !anhaenge) return;
    if (betreten) tiefe.current++;
    setzen(event.dataTransfer.items.length);
  };
  return <footer className="chat-eingabe" onDragEnter={event => ziehen(event, true)} onDragOver={event => ziehen(event)}
    onDragLeave={() => { tiefe.current = Math.max(0, tiefe.current - 1); if (!tiefe.current) setzen(null); }}
    onDrop={event => { if (!dateien(event)) return; event.preventDefault(); schliessen(); if (!gesperrt) void anhaenge?.hinzufuegen(Array.from(event.dataTransfer.files)); }}>
    {children}
    {!gesperrt && anzahl !== null && <div className="ein-ablage" role="status">
      {!!anzahl && <span className="ein-ablage-zahl">{anzahl} {anzahl === 1 ? "Datei" : "Dateien"}</span>}
      <span className="ein-an-stempel"><FileUp size={24} aria-hidden="true" /></span>
      <span><strong>Loslassen zum Anhängen</strong><small>Bilder und Dateien, auch mehrere</small></span>
    </div>}
  </footer>;
}

type Anhang = { datei: File; zeilen?: number };
export function useAnhaenge(fehler: (text: string) => void) {
  const [dateien, setzen] = useState<Anhang[]>([]), aktuell = useRef(dateien), eingabe = useRef<HTMLInputElement>(null);
  const speichern = (neu: Anhang[]) => { aktuell.current = neu; setzen(neu); };
  return { dateien, eingabe, leeren: () => speichern([]), entfernen: (i: number) => speichern(aktuell.current.filter((_, n) => n !== i)),
    hinzufuegen: async (auswahl: File[]) => {
      fehler("");
      const lesen: Anhang[] = [];
      for (const datei of auswahl) {
        if (datei.size > 10 * 1024 * 1024) { fehler(`${datei.name}: höchstens 10 MB je Datei.`); continue; }
        if (aktuell.current.length >= 10) { fehler("Höchstens 10 Dateien anhängen."); break; }
        const anhang = { datei }; lesen.push(anhang); speichern([...aktuell.current, anhang]);
      }
      await Promise.all(lesen.map(async anhang => { const { datei } = anhang;
        try { if (!datei.type.startsWith("image/") && (/^(text\/|application\/(json|xml))/.test(datei.type) || /\.(csv|txt|md|json|xml|log)$/i.test(datei.name))) {
          const text = await datei.text(), zeilen = text ? text.replace(/\r?\n$/, "").split(/\r?\n/).length : 0;
          speichern(aktuell.current.map(a => a === anhang ? { ...a, zeilen } : a));
        } } catch { fehler(`${datei.name} konnte nicht gelesen werden.`); }
      }));
    } };
}
function Vorschau({ datei }: { datei: File }) {
  const [url, setzen] = useState("");
  useEffect(() => { setzen(""); if (!datei.type.startsWith("image/")) return; const url = URL.createObjectURL(datei); setzen(url); return () => URL.revokeObjectURL(url); }, [datei]);
  return url ? <img src={url} alt="" /> : <FileText size={20} aria-hidden="true" />;
}
export function Anhaenge({ dateien, entfernen, eingabe, hinzufuegen, gesperrt }: ReturnType<typeof useAnhaenge> & { gesperrt?: boolean }) {
  return <><input ref={eingabe} type="file" multiple hidden aria-label="Dateien anhängen" disabled={gesperrt}
    onChange={event => { void hinzufuegen(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    {!!dateien.length && <ul className="ein-anhaenge">{dateien.map(({ datei, zeilen }, i) => <li key={i}>
      <span className="ein-an-stempel"><Vorschau datei={datei} /></span><span className="ein-an-name"><strong title={datei.name}>{datei.name}</strong>
        <small>{datei.type.startsWith("image/") ? "Bild" : datei.name.includes(".") ? datei.name.split(".").at(-1)!.toUpperCase() : "Datei"} · {Math.ceil(datei.size / 1024)} KB{zeilen === undefined ? "" : ` · ${zeilen} Zeilen`}</small></span>
      <button type="button" className="kn kn-leise kn-symbol" aria-label={`${datei.name} entfernen`} disabled={gesperrt} onClick={() => entfernen(i)}><Trash2 size={16} aria-hidden="true" /></button>
    </li>)}</ul>}</>;
}
