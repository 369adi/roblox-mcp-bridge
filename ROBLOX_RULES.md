# Server-Anleitung (26 Zeilen)

```text
Roblox MCP: direkt umsetzen, kurze Ergebnisse statt wiederholter Planung.
Höchstens 1 gebündelter Lese-Aufruf, dann bauen; nötige Ziel-/Fehlerklärung bleibt erlaubt.
Globale Regeln stehen ausschließlich in memory_search(namespace="global", id="roblox-rules").
Memory, passenden Kurz-Skill und Design-Profil nur einmal pro Chat und nur bei Bedarf laden.
Optional roblox_context(chat_id, include_skill, design_namespace) bündelt dies in einem Aufruf.
Bei „Regeln sind gelesen“: alle optionalen Ladeschritte überspringen, Regeln weiter einhalten.
FAST im Nutzerprompt oder roblox_context(mode="FAST") bedeutet sofort bauen, ohne Pflicht-Laden/Vorab-Prüfungen.
Danach in FAST genau ein kompakter Prüfaufruf und ein Studio-Bild bei visueller Arbeit.
Design-Profil nur für echte Gestaltung; nicht für Reparaturen oder Systemaufgaben.
ProBuilder: builtin-roblox/roblox-probuilder/SKILL.md ist die Kurzfassung; Langfassung nur auf Nachfrage.
studio_id im Chat wiederverwenden; bei mehreren Studios das richtige Ziel klären.
run_builder(studio_id, module="Z6", code=...) übernimmt Klon-Loader, Cleanup und ChangeHistory.
Im Builder-Code ist builder das Ergebnis von require; ohne module wird nur code ausgeführt.
model_summary liefert Teilanzahl, Formen, Farben und Bounding-Box; model_check liefert kompakte Hinweise.
execute_luau-Ausgaben sind auf 4000 Zeichen begrenzt; niemals vollständige Teilelisten drucken.
Bei fix/floating/faces-Prüfungen: Zahlen und höchstens 10 Problemfälle, keine automatischen Massenkorrekturen.
screen_capture(studio_id, width=1280, height=720, quality=82, return_mode="inline"|"file"|"preview").
Regelmäßig lesbare Studio-Bilder; capture_get lädt lokale Details. Byte-Limit nicht durch Kamera-Zoom umgehen.
Für visuelle Arbeit: ein Bild nach Bau, nach Korrekturen, am Ende; gleiche Phasen zusammenlegen.
Kein Vorab-Bild bei neuen Objekten und keine unveränderten Screenshot-Schleifen.
Nie automatisch Play/Playtest starten/stoppen; keine Desktop-Aufnahmen oder Screenshot-Workarounds.
Keine unbeabsichtigten koplanaren sichtbaren Flächen; neue Modelle in 2–3 echten Varianten.
Keine Ball-Formen zum Modellieren; kräftige Farben, viel Kontrast; alle Spieltexte Englisch.
Eclipse Animator bevorzugen; Zugriff nicht voraussetzen, vor Ersatz fragen.
Brickwire gezielt nutzen; ultracode(query) bietet optionale Methoden/Referenzen ohne Pflicht-Prompt oder Extension.
Auftragsumfang, vorhandene Systeme und ungespeicherte Änderungen erhalten; Grenzen ehrlich nennen.
```

# Memory: roblox-rules (21 Zeilen)

```text
Roblox-Regeln
Direkt umsetzen: höchstens ein gebündelter Lese-Aufruf, dann bauen; nicht mehrfach planen.
Memory, passenden Kurz-Skill und Design-Profil höchstens einmal pro Chat und nur bei Bedarf laden.
Bei „Regeln sind gelesen“ oder FAST alle optionalen Ladeschritte überspringen.
Design-Profil nur für echte Gestaltung, nicht für Reparaturen/Systemaufgaben; Stil bleibt pro Spiel.
Keine Kugeln (Ball) zum Formen; kräftige Farben und viel Kontrast, passend zur Spielrichtung.
Neue Modellfamilien erhalten 2–3 echte Form-/Proportions-/Detailvarianten, keine bloßen Farbklone.
Enge Reparaturen nicht erweitern; ausdrücklich gewünschte Einzelmodelle respektieren.
Keine unbeabsichtigten koplanaren sichtbaren Flächen, Duplikate oder Z-Fighting; gezielt korrigieren.
Alle Texte im Spiel auf Englisch; bestehende Systeme und ungespeicherte Änderungen erhalten.
Nie automatisch Play/Playtest starten oder stoppen; ungetestetes Verhalten als solches benennen.
Nur Studio-gerenderte Bilder: kein Desktop, Monitor, OS-Fenster oder Screenshot-Workaround.
Wenn Studio-Aufnahme nicht möglich ist: Fehler melden, kein Desktop-Fallback.
Bildstandard: 1280x720, JPEG quality=82; lesbare Details statt 6000-Byte-Minibildern. Kein automatisches Kleinskalieren oder Kamera-Zoom wegen Byte-Limits.
Bei visuellen Änderungen: je ein Bild nach Bau, nach Korrekturen und zum Abschluss; identische Phasen zusammenlegen.
Kein Vorab-Bild für neue Objekte; keine unveränderten Kontrollschleifen.
FAST: sofort bauen, danach ein kompakter Prüfaufruf und ein Studio-Bild, sofern visuell.
Luau-Ausgaben maximal 4000 Zeichen; Prüfungen nur Zahlen und höchstens 10 Problemfälle.
Animationen bevorzugt mit Eclipse Animator; Verfügbarkeit prüfen und vor Ersatz fragen.
Brickwire nur gezielt als Referenz/Runtime nutzen; keine automatische Komplettinstallation.
Nur beauftragte Änderungen; keine Veröffentlichung, Uploads oder Produktionsdaten-Tests ohne Auftrag.
```


