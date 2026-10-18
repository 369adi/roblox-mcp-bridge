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
Für Roblox bevorzugt Studio-Renderer oder Studio-Fenster inklusive Eclipse/Plugins. Allgemeine PC-Aufgaben dürfen alle Apps/Monitore erfassen und bedienen, nach lokaler Full-PC-UI-Freigabe.
UI-Eingaben nur nach lokaler Freigabe, mit frischer Aufnahme; Notaus Ctrl+Alt+F12. Allgemeine PC-Steuerung ist nicht auf Roblox oder Blender begrenzt.
Bildstandard: 1280x720, JPEG quality=82; lesbare Details statt 6000-Byte-Minibildern. Kein automatisches Kleinskalieren oder Kamera-Zoom wegen Byte-Limits.
Nach visuellen Änderungen liefert run_builder/execute_luau/Brickwire automatisch ein Studio-Bild; angehängte Bilder ansehen und sichtbare Fehler korrigieren. Abschlussbild nur bei Bedarf zusätzlich.
Kein Vorab-Bild für neue Objekte; keine unveränderten Kontrollschleifen.
FAST: sofort bauen, danach ein kompakter Prüfaufruf und ein Studio-Bild, sofern visuell.
Luau-Ausgaben maximal 4000 Zeichen; Prüfungen nur Zahlen und höchstens 10 Problemfälle.
Animationen mit Eclipse Animator: Plugins → Eclipse Animator → Eclipse Animator; Rig Tools ist separat. Verfügbarkeit prüfen und vor Ersatz fragen.
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
screen_capture(studio_id, width=1280, height=720, quality=82, return_mode="inline"|"file"|"preview").
Regelmäßig lesbare Studio-Bilder; capture_get lädt lokale Details. Byte-Limit nicht durch Kamera-Zoom umgehen.
Visuelle Bau-/Luau-/Brickwire-Aufrufe liefern automatisch ein Bild: ansehen, sichtbare Fehler korrigieren, nicht ohne Bildprüfung fertig melden. Kein doppelter Screenshot derselben Phase.
Kein Vorab-Bild bei neuen Objekten und keine unveränderten Screenshot-Schleifen.
Nie automatisch Roblox-Play/Playtest starten/stoppen. Allgemeine PC-Aufnahmen/-Steuerung sind nach lokaler Freigabe erlaubt, nicht nur Roblox/Blender.
Für Eclipse/Plugin-UI: studio_windows, dann studio_window_capture des verifizierten Studio-Fensters.
Studio-UI-Maus/Tastatur nur nach lokaler Freigabe; frische capture_id, Notaus Ctrl+Alt+F12.
PC-Apps: desktop_windows/desktop_capture, dann desktop_* via tool_call. UI-Aktionen liefern automatisch ein Nachher-Bild; lokale Freigabe nötig, kein UAC-/Login-Bypass. visual=false nur für nichtvisuelle Luau-/Systemarbeit.
Keine unbeabsichtigten koplanaren sichtbaren Flächen; neue Modelle in 2–3 echten Varianten.
Keine Ball-Formen zum Modellieren; kräftige Farben, viel Kontrast; alle Spieltexte Englisch.
Eclipse Animator bevorzugen; Zugriff nicht voraussetzen, vor Ersatz fragen.
Brickwire gezielt nutzen; ultracode(query) bietet optionale Methoden/Referenzen ohne Pflicht-Prompt oder Extension.
Auftragsumfang, vorhandene Systeme und ungespeicherte Änderungen erhalten; Grenzen ehrlich nennen.'''


class RobloxContext:
    def __init__(self, workspace, libraries, design):
        self.workspace, self.libraries, self.design = workspace, libraries, design
        self.chats = {}
        self.lock = threading.Lock()

    def get(self, args):
        chat = self.workspace._text(args.get('chat_id'), 'chat_id', 200)
        mode = args.get('mode', self.chats.get(chat, {}).get('mode', 'NORMAL')).upper()
        if mode not in ('NORMAL', 'FAST'):
            raise ValueError('mode must be NORMAL or FAST')
        with self.lock:
            now = time.monotonic()
            self.chats = {k: v for k, v in self.chats.items() if now - v['time'] < 86400}
            state = self.chats.get(chat, {'time': now, 'loaded': set(), 'mode': mode})
            state['mode'], state['time'] = mode, now
            if args.get('rules_read'):
                state['skip'] = True
            result = {'mode': mode, 'context': {}}
            if mode != 'FAST' and not state.get('skip', False):
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
