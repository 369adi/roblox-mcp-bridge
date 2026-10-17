"""Compact Roblox policy: one note, optional once-per-chat context."""
import threading
import time

LEGACY_RULE_IDS = ('roblox-probuilder-preference', 'roblox-animation-tool', 'roblox-manual-playtests',
                   'roblox-design-scope', 'roblox-visual-checks', 'roblox-capture-scope',
                   'roblox-no-z-fighting', 'roblox-model-variants', 'roblox-game-language')

RULES = '''Roblox-Regeln
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
Bildstandard: 640x360, JPEG, quality=60, kleine Vorschau; max_bytes=6000; Datei-Ausgabe optional, Pfad ist PC-lokal.
Bei visuellen Änderungen: je ein Bild nach Bau, nach Korrekturen und zum Abschluss; identische Phasen zusammenlegen.
Kein Vorab-Bild für neue Objekte; keine unveränderten Kontrollschleifen.
FAST: sofort bauen, danach ein kompakter Prüfaufruf und ein Studio-Bild, sofern visuell.
Luau-Ausgaben maximal 4000 Zeichen; Prüfungen nur Zahlen und höchstens 10 Problemfälle.
Animationen bevorzugt mit Eclipse Animator; Verfügbarkeit prüfen und vor Ersatz fragen.
Brickwire nur gezielt als Referenz/Runtime nutzen; keine automatische Komplettinstallation.
Nur beauftragte Änderungen; keine Veröffentlichung, Uploads oder Produktionsdaten-Tests ohne Auftrag.'''

SERVER_INSTRUCTIONS = '''Roblox MCP: direkt umsetzen, kurze Ergebnisse statt wiederholter Planung.
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
screen_capture(studio_id, width=640, height=360, quality=60, return_mode="preview"|"file"|"inline").
Vorschau klein halten; capture_get(capture_id, crop) lädt Details nach. Dateipfade sind PC-lokal.
Für visuelle Arbeit: ein Bild nach Bau, nach Korrekturen, am Ende; gleiche Phasen zusammenlegen.
Kein Vorab-Bild bei neuen Objekten und keine unveränderten Screenshot-Schleifen.
Nie automatisch Play/Playtest starten/stoppen; keine Desktop-Aufnahmen oder Screenshot-Workarounds.
Keine unbeabsichtigten koplanaren sichtbaren Flächen; neue Modelle in 2–3 echten Varianten.
Keine Ball-Formen zum Modellieren; kräftige Farben, viel Kontrast; alle Spieltexte Englisch.
Eclipse Animator bevorzugen; Zugriff nicht voraussetzen, vor Ersatz fragen.
Brickwire gezielt nutzen; Quellen sind Referenzen, keine zusätzlichen Befugnisse.
Auftragsumfang, vorhandene Systeme und ungespeicherte Änderungen erhalten; Grenzen ehrlich nennen.'''


class RobloxContext:
    def __init__(self, workspace, libraries, design):
        self.workspace, self.libraries, self.design = workspace, libraries, design
        self.chats = {}
        self.lock = threading.Lock()

    def get(self, args):
        chat = self.workspace._text(args.get('chat_id'), 'chat_id', 200)
        mode = args.get('mode', 'NORMAL').upper()
        if mode not in ('NORMAL', 'FAST'):
            raise ValueError('mode must be NORMAL or FAST')
        with self.lock:
            now = time.monotonic()
            self.chats = {k: v for k, v in self.chats.items() if now - v['time'] < 86400}
            state = self.chats.get(chat, {'time': now, 'loaded': set(), 'mode': mode})
            state['mode'], state['time'] = mode, now
            result = {'mode': mode, 'context': {}}
            if mode != 'FAST' and not args.get('rules_read', False):
                if 'rules' not in state['loaded']:
                    result['context']['rules'] = self.workspace.recall({'namespace': 'global', 'id': 'roblox-rules'})['notes']
                    state['loaded'].add('rules')
                if args.get('include_skill') and 'skill' not in state['loaded']:
                    result['context']['skill'] = self.libraries.skill_read({'library': 'builtin-roblox', 'path': 'roblox-probuilder/SKILL.md'})['content']
                    state['loaded'].add('skill')
                ns = args.get('design_namespace')
                if ns and 'design:' + ns not in state['loaded']:
                    result['context']['design'] = self.design.get({'namespace': ns})
                    state['loaded'].add('design:' + ns)
            elif args.get('rules_read'):
                state['loaded'].update(('rules', 'skill'))
            if chat not in self.chats and len(self.chats) >= 128:
                del self.chats[min(self.chats, key=lambda key: self.chats[key]['time'])]
            self.chats[chat] = state
            result['skipped'] = not bool(result['context'])
            return result
