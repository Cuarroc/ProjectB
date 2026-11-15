use projectb_kern::{chats::*, einstellungen};
use serde_json::json;
use std::{
    fs,
    io::ErrorKind,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

struct Temp(PathBuf);
impl Temp {
    fn neu() -> Self {
        static NR: AtomicUsize = AtomicUsize::new(0);
        let pfad = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/chats-tests").join(format!(
            "{}-{}",
            std::process::id(),
            NR.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&pfad);
        fs::create_dir_all(&pfad).unwrap();
        Self(pfad)
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
fn speichern_laden_rundreise_und_ersetzen() {
    let temp = Temp::neu();
    let pfad = temp.0.join("projekt.json");
    for daten in [
        json!({"chats": [{"id": "eins", "verlauf": [{"text": "Hallo ä"}], "titel": "Test"}],
               "aktiverChatId": "eins", "weiteres": 42}),
        json!({"chats": [], "aktiverChatId": null}),
    ] {
        speichern(&pfad, &daten).unwrap();
        assert_eq!(laden(&pfad).unwrap(), daten);
        assert_eq!(fs::read_dir(&temp.0).unwrap().count(), 1);
    }
}

#[test]
fn fehlende_datei_ergibt_leere_liste() {
    let temp = Temp::neu();
    assert_eq!(laden(temp.0.join("fehlt.json")).unwrap(), json!({"chats": [], "aktiverChatId": null}));
}

#[test]
fn kaputtes_json_und_lesefehler_bleiben_fehler() {
    let temp = Temp::neu();
    let pfad = temp.0.join("kaputt.json");
    fs::write(&pfad, "{").unwrap();
    assert!(laden(&pfad).is_err());
    assert_eq!(fs::read_to_string(&pfad).unwrap(), "{");
    assert!(laden(&temp.0).is_err());
}

#[test]
fn falsche_form_schreibt_nichts() {
    let temp = Temp::neu();
    let pfad = temp.0.join("projekt.json");
    let basis = json!({"chats": [{"id": "eins", "verlauf": []}], "aktiverChatId": null});
    speichern(&pfad, &basis).unwrap();
    let vorher = fs::read(&pfad).unwrap();
    let mut kaputt = vec![];
    for wert in [json!(null), json!(false), json!(42), json!("text"), json!([]), json!({})] {
        kaputt.push(wert.clone());
        for (zeiger, erlaubt) in [
            ("/chats", wert.is_array()),
            ("/chats/0", false),
            ("/chats/0/id", wert.is_string()),
            ("/chats/0/verlauf", wert.is_array()),
            ("/aktiverChatId", wert.is_string() || wert.is_null()),
        ] {
            if !erlaubt {
                let mut daten = basis.clone();
                *daten.pointer_mut(zeiger).unwrap() = wert.clone();
                kaputt.push(daten);
            }
        }
    }
    for feld in ["chats", "aktiverChatId", "id", "verlauf"] {
        let mut daten = basis.clone();
        let objekt = if matches!(feld, "id" | "verlauf") { &mut daten["chats"][0] } else { &mut daten };
        objekt.as_object_mut().unwrap().remove(feld);
        kaputt.push(daten);
    }
    for daten in kaputt {
        assert_eq!(speichern(&pfad, &daten).unwrap_err().kind(), ErrorKind::InvalidInput, "{daten}");
        assert_eq!(fs::read(&pfad).unwrap(), vorher);
        let fehlt = temp.0.join("fehlt.json");
        assert_eq!(speichern(&fehlt, &daten).unwrap_err().kind(), ErrorKind::InvalidInput);
        assert!(!fehlt.exists());
    }
}

#[test]
fn groessengrenze_bewahrt_vorhandene_datei() {
    let temp = Temp::neu();
    let pfad = temp.0.join("projekt.json");
    let mut daten = json!({"chats": [], "aktiverChatId": null, "text": ""});
    let grenze = 20 * 1024 * 1024;
    let rest = serde_json::to_vec(&daten).unwrap().len();
    daten["text"] = json!("x".repeat(grenze - rest));
    speichern(&pfad, &daten).unwrap();
    let vorher = fs::read(&pfad).unwrap();
    daten["text"] = json!(format!("{}x", daten["text"].as_str().unwrap()));
    assert_eq!(speichern(&pfad, &daten).unwrap_err().kind(), ErrorKind::InvalidInput);
    assert_eq!(fs::read(&pfad).unwrap(), vorher);
}

#[test]
fn projektdateien_sind_getrennt_und_normalisiert() {
    let temp = Temp::neu();
    let erster = datei_fuer(&temp.0, r"C:\Repo\X");
    let zweiter = datei_fuer(&temp.0, "c:/repo/y");
    assert_eq!(erster, temp.0.join("chats/51b03d1b19c77b1a.json"));
    assert_eq!(erster.file_name(), einstellungen::datei_fuer(&temp.0, "c:/repo/x").file_name());
    assert_eq!(erster, datei_fuer(&temp.0, "c:/repo/x"));
    assert_eq!(datei_fuer(&temp.0, r"\\Server\Repo\X"), datei_fuer(&temp.0, "//server/repo/x"));
    assert_ne!(erster, zweiter);
    fs::create_dir_all(erster.parent().unwrap()).unwrap();
    for (pfad, id) in [(&erster, "eins"), (&zweiter, "zwei")] {
        let daten = json!({"chats": [{"id": id, "verlauf": []}], "aktiverChatId": id});
        speichern(pfad, &daten).unwrap();
        assert_eq!(laden(pfad).unwrap(), daten);
    }
    assert_ne!(laden(&erster).unwrap(), laden(&zweiter).unwrap());
}
