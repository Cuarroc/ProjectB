use projectb_kern::einstellungen::{
    AgentenGleichzeitig, Ausfuehren, Plan, Planen, Pruefrunden, PruefungDurch, Schalter,
};
use projectb_kern::regeln::{
    darf_starten, naechste_runde, plan_vorgaben, pruefer_fuer, Familie, PlanVorgaben, Schritt,
};

#[test]
fn startplaetze_beachten_alle_grenzen() {
    for (wahl, grenze) in
        [(AgentenGleichzeitig::Einer, 1), (AgentenGleichzeitig::BisZu3, 3), (AgentenGleichzeitig::BisZu5, 5)]
    {
        let e = Ausfuehren { agenten_gleichzeitig: wahl, ..Ausfuehren::default() };
        for laufend in [0, grenze - 1, grenze, grenze + 1, usize::MAX] {
            assert_eq!(darf_starten(laufend, &e), laufend < grenze, "{wahl:?}, {laufend}");
        }
    }
}

#[test]
fn prueferwahl_fuer_beide_familien_und_beide_einstellungen() {
    for (autor, andere) in [(Familie::Claude, Familie::Codex), (Familie::Codex, Familie::Claude)] {
        for (wahl, erwartet) in [(PruefungDurch::AndereModellfamilie, andere), (PruefungDurch::GleicheFamilie, autor)] {
            let e = Ausfuehren { pruefung_durch: wahl, ..Ausfuehren::default() };
            assert_eq!(pruefer_fuer(autor, &e), erwartet);
        }
    }
}

#[test]
fn jede_rundengrenze_stoppt_mit_funden_und_beendet_ohne_funde() {
    for (wahl, grenze) in [(Pruefrunden::Eins, 1), (Pruefrunden::Zwei, 2), (Pruefrunden::Drei, 3)] {
        let e = Ausfuehren { pruefrunden_hoechstens: wahl, ..Ausfuehren::default() };
        for runde in 0..=u8::MAX {
            let erwartet = if runde < grenze { Schritt::WeiterPruefen } else { Schritt::Stopp };
            assert_eq!(naechste_runde(runde, true, &e), erwartet, "{wahl:?}, {runde}");
            assert_eq!(naechste_runde(runde, false, &e), Schritt::Fertig, "{wahl:?}, {runde}");
        }
    }
}

#[test]
fn planvorgaben_bilden_alle_kombinationen_ab() {
    for tiefe in [Plan::Kurz, Plan::Normal, Plan::Ausfuehrlich] {
        for (schaetzen, soll_schaetzen) in [(Schalter::An, true), (Schalter::Aus, false)] {
            for (nachfragen, soll_nachfragen) in [(Schalter::An, true), (Schalter::Aus, false)] {
                let e =
                    Planen { plan: tiefe, dauer_und_tokens_schaetzen: schaetzen, bei_unklarem_nachfragen: nachfragen };
                assert_eq!(
                    plan_vorgaben(&e),
                    PlanVorgaben { tiefe, schaetzen: soll_schaetzen, nachfragen: soll_nachfragen }
                );
            }
        }
    }
}

#[test]
fn empfehlungen_folgen_regel_4() {
    let e = Ausfuehren::default();
    assert!(darf_starten(2, &e));
    assert!(!darf_starten(3, &e));
    assert_eq!(pruefer_fuer(Familie::Claude, &e), Familie::Codex);
    assert_eq!(pruefer_fuer(Familie::Codex, &e), Familie::Claude);
    assert_eq!(naechste_runde(1, true, &e), Schritt::WeiterPruefen);
    assert_eq!(naechste_runde(2, true, &e), Schritt::WeiterPruefen);
    assert_eq!(naechste_runde(3, true, &e), Schritt::Stopp);
    assert_eq!(naechste_runde(3, false, &e), Schritt::Fertig);
    assert_eq!(
        plan_vorgaben(&Planen::default()),
        PlanVorgaben { tiefe: Plan::Normal, schaetzen: true, nachfragen: true }
    );
}
