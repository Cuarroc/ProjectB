import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Eingabefeld } from "./Eingabefeld";

const aufbau = (props = {}) => {
  const onSenden = vi.fn(), onTextAendern = vi.fn();
  const form = Eingabefeld({ id: "nachricht", text: "Bau einen CSV-Export", onSenden, onTextAendern, ...props });
  return { form, feld: form.props.children[1], onSenden, onTextAendern };
};
const taste = (werte = {}) => ({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), ...werte });

describe("Eingabefeld", () => {
  it("sendet Enter und verhindert die neue Zeile", () => {
    const { feld, onSenden } = aufbau(), event = taste();
    feld.props.onKeyDown(event);
    expect(onSenden).toHaveBeenCalledExactlyOnceWith("Bau einen CSV-Export");
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
  it.each([{ shiftKey: true }, { nativeEvent: { isComposing: true } }, { keyCode: 229 }, { key: "a" }])("sendet nicht bei %j", werte => {
    const { feld, onSenden } = aufbau(), event = taste(werte);
    feld.props.onKeyDown(event);
    expect(onSenden).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
  it.each([{ sendet: true }, { text: " \n " }])("sperrt Enter und Formular während %j", props => {
    const { form, feld, onSenden } = aufbau(props);
    feld.props.onKeyDown(taste()); form.props.onSubmit(taste());
    expect(onSenden).not.toHaveBeenCalled();
  });
  it("übernimmt Textänderungen und sendet auch über das Formular", () => {
    const { form, feld, onSenden, onTextAendern } = aufbau();
    feld.props.onChange({ target: { value: "Neue Nachricht" } });
    expect(onTextAendern).toHaveBeenCalledExactlyOnceWith("Neue Nachricht");
    form.props.onSubmit(taste());
    expect(onSenden).toHaveBeenCalledExactlyOnceWith("Bau einen CSV-Export");
  });
  it("hält die höfliche Live-Region bereit und verknüpft Fehler mit dem Textfeld", () => {
    const normal = renderToStaticMarkup(aufbau().form);
    const fehler = renderToStaticMarkup(aufbau({ fehler: "Nicht gesendet. Dein Text bleibt stehen." }).form);
    expect(normal).toContain('aria-live="polite"');
    expect(fehler).toContain('aria-describedby="nachricht-meldung"');
    expect(fehler).toMatch(/id="nachricht-meldung"[^>]*aria-live="polite"[\s\S]*Nicht gesendet/);
    expect(fehler).toContain("Erneut senden");
    expect(fehler).toContain("Bau einen CSV-Export");
  });
});
