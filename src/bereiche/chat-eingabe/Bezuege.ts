export const bezugAmCursor = (text: string, cursor: number) => text.slice(0, cursor).match(/(?:^|\s)@(\S*)$/);
export function bezugEinfuegen(text: string, cursor: number, name: string) {
  const suche = bezugAmCursor(text, cursor);
  const anfang = cursor - (suche?.[1].length ?? 0) - 1, bezug = `@${name} `;
  return { text: text.slice(0, anfang) + bezug + text.slice(cursor).replace(/^\S*/, ""), cursor: anfang + bezug.length };
}
export const bezugMuster = (name: string) => new RegExp(`(^|\\s)@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "g");
export function mitBezuegen(text: string, dateien: string[]) {
  const pfade = dateien.filter(p => bezugMuster(p).test(text));
  return text + (pfade.length ? `\n\nBezüge:\n${pfade.map(p => `- ${p}`).join("\n")}` : "");
}
