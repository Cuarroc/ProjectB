import { useEffect, useRef, useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import "./Anhaenge.css";

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
