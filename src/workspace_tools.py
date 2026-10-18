"""Persistent project notes and bounded, project-scoped source inspection."""
from __future__ import annotations
import fnmatch
import json
import os
import re
import sqlite3
import threading
import time
import uuid
from pathlib import Path


def spec(name, description, properties=None, required=None, readonly=True):
    schema = {"type": "object", "properties": properties or {}}
    if required:
        schema["required"] = required
    return {"name": name, "description": description, "inputSchema": schema,
            "annotations": {"readOnlyHint": readonly, "destructiveHint": name == "memory_delete", "openWorldHint": False}}


PROJECT = {"type": "string", "description": "Project id returned by project_open"}
WORKSPACE_TOOLS = [
    spec("workspace_status", "Show persistent memory location, project/note counts, and Roblox defaults."),
    spec("project_open", "Register a local codebase folder for bounded source inspection and project memory. Read-only toward project files. For Roblox use the local Rojo/Luau project directory; live Studio scripts are accessed with roblox_* tools.",
         {"path": {"type": "string"}, "name": {"type": "string"}}, ["path"], readonly=False),
    spec("project_list", "List registered local projects and ids. Registration and notes survive app restarts."),
    spec("codebase_files", "List codebase files, excluding VCS, dependencies, build outputs, symlinks outside the root and secret files. Results are bounded and paginated.",
         {"project": PROJECT, "glob": {"type": "string"}, "offset": {"type": "integer"}, "limit": {"type": "integer", "maximum": 500}}, ["project"]),
    spec("codebase_search", "Search literal text in local codebase files, with file/line citations. Defaults to case-insensitive, skips binaries and large files, limits results/time. glob may be *.luau or *.lua. No embeddings, cloud uploads or automatic full-source dumps.",
         {"project": PROJECT, "query": {"type": "string"}, "glob": {"type": "string"}, "case_sensitive": {"type": "boolean"}, "limit": {"type": "integer", "maximum": 200}}, ["project", "query"]),
    spec("codebase_read", "Read a bounded range of a UTF-8 source file relative to a registered project, with line numbers. Does not access live Studio buffers.",
         {"project": PROJECT, "path": {"type": "string"}, "start_line": {"type": "integer"}, "end_line": {"type": "integer"}}, ["project", "path"]),
    spec("memory_put", "Persist an explicit project note, architecture decision, task state, bug finding, or user preference locally. Use a stable id to update a note. Notes survive app restart; do not store secrets or entire codebases. namespace defaults to global; use project id for project notes.",
         {"namespace": {"type": "string"}, "id": {"type": "string"}, "title": {"type": "string"}, "content": {"type": "string"}, "tags": {"type": "array", "items": {"type": "string"}}}, ["title", "content"], readonly=False),
    spec("memory_search", "Search saved persistent notes by literal text, optional namespace/id and pagination. An empty query lists recent notes. Memory is explicit local notes, not automatic access to previous chats.",
         {"query": {"type": "string"}, "namespace": {"type": "string"}, "id": {"type": "string"}, "offset": {"type": "integer"}, "limit": {"type": "integer", "maximum": 50}}),
    spec("memory_delete", "Permanently delete one saved memory note by exact namespace and id. Does not modify source files.",
         {"namespace": {"type": "string"}, "id": {"type": "string"}}, ["namespace", "id"], readonly=False),
]

IGNORED_DIRS = {".git", ".svn", ".hg", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "target", ".next", ".cache"}
SECRET_NAMES = {".env", ".env.local", ".env.production", ".env.development", "id_rsa", "id_ed25519", "credentials.json"}


class WorkspaceTools:
    def __init__(self, data_dir=None):
        default = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "PC-MCP-Bridge"
        self.data_dir = Path(data_dir or os.environ.get("PC_MCP_BRIDGE_DATA_DIR") or default).resolve()
        self.db_path = self.data_dir / "workspace.sqlite3"
        self.lock = threading.RLock()

    def _db(self):
        self.data_dir.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.db_path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.executescript('''CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, root TEXT NOT NULL UNIQUE, opened REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS notes (
            namespace TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
            tags TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL,
            PRIMARY KEY(namespace,id));
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS libraries (id TEXT PRIMARY KEY,name TEXT NOT NULL,root TEXT NOT NULL UNIQUE,added REAL NOT NULL);''')
        from roblox_rules import RULES, LEGACY_RULE_IDS
        if not connection.execute("SELECT 1 FROM settings WHERE key='roblox-rules-v2'").fetchone():
            with connection:
                old_notes = [dict(row) for row in connection.execute(
                    "SELECT * FROM notes WHERE namespace='global'").fetchall() if row['id'] in LEGACY_RULE_IDS]
                connection.execute("INSERT OR IGNORE INTO settings VALUES(?,?)",
                                   ('roblox-rules-v2-backup', json.dumps(old_notes)))
                now = time.time()
                connection.execute('INSERT INTO notes VALUES(?,?,?,?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET title=excluded.title,content=excluded.content,tags=excluded.tags,updated=excluded.updated',
                    ('global', 'roblox-rules', 'roblox-rules', RULES, '["roblox","preference"]', now, now))
                for ident in LEGACY_RULE_IDS:
                    connection.execute("DELETE FROM notes WHERE namespace='global' AND id=?", (ident,))
                connection.execute("INSERT INTO settings VALUES('roblox-rules-v2','1')")
        if not connection.execute("SELECT 1 FROM settings WHERE key='roblox-capture-quality-v3'").fetchone():
            with connection:
                row=connection.execute("SELECT content FROM notes WHERE namespace='global' AND id='roblox-rules'").fetchone()
                if row:
                    old=row['content']
                    new=old.replace('Bildstandard: 640x360, JPEG, quality=60, kleine Vorschau; max_bytes=6000; Datei-Ausgabe optional, Pfad ist PC-lokal.',
                                    'Bildstandard: 1280x720, JPEG quality=82; lesbare Details statt 6000-Byte-Minibildern. Kein automatisches Kleinskalieren oder Kamera-Zoom wegen Byte-Limits.')
                    connection.execute("UPDATE notes SET content=?,updated=? WHERE namespace='global' AND id='roblox-rules'",(new,time.time()))
                connection.execute("INSERT INTO settings VALUES('roblox-capture-quality-v3','1')")
        if not connection.execute("SELECT 1 FROM settings WHERE key='roblox-studio-window-ui-v1'").fetchone():
            with connection:
                row=connection.execute("SELECT content FROM notes WHERE namespace='global' AND id='roblox-rules'").fetchone()
                if row:
                    new=row['content'].replace('Nur Studio-gerenderte Bilder: kein Desktop, Monitor, OS-Fenster oder Screenshot-Workaround.',
                        'Aufnahmen: Studio-Renderer oder verifiziertes Studio-Fenster inklusive Eclipse/Plugins; niemals ganzer Desktop oder andere Apps.')
                    new=new.replace('Animationen bevorzugt mit Eclipse Animator; Verfügbarkeit prüfen und vor Ersatz fragen.',
                        'Animationen mit Eclipse Animator: Plugins → Eclipse Animator → Eclipse Animator; Rig Tools ist separat. Verfügbarkeit prüfen und vor Ersatz fragen.')
                    new=new.replace('Wenn Studio-Aufnahme nicht möglich ist: Fehler melden, kein Desktop-Fallback.',
                        'Studio-UI-Eingaben nur nach lokaler Freigabe, mit frischer Fensteraufnahme; Notaus Ctrl+Alt+F12. Kein fremder Desktop-Fallback.')
                    connection.execute("UPDATE notes SET content=?,updated=? WHERE namespace='global' AND id='roblox-rules'",(new,time.time()))
                connection.execute("INSERT INTO settings VALUES('roblox-studio-window-ui-v1','1')")
        connection.commit()
        return connection

    @staticmethod
    def _text(value, label, maximum=65536):
        if not isinstance(value, str) or not value.strip() or len(value) > maximum or "\x00" in value:
            raise ValueError(f"{label} must be non-empty text, at most {maximum} characters")
        return value

    def status(self, _):
        with self.lock:
            db = self._db()
            try:
                return {"memory_database": str(self.db_path), "persistent": True,
                      "projects": db.execute("SELECT COUNT(*) FROM projects").fetchone()[0],
                      "notes": db.execute("SELECT COUNT(*) FROM notes").fetchone()[0],
                      "game_text_language": "English", "memory_mode": "Explicit notes saved with memory_put"}
            finally:
                db.close()

    def project_open(self, args):
        root = Path(self._text(args.get("path"), "path", 32768)).expanduser().resolve()
        if not root.is_dir():
            raise ValueError("path must name an existing local project folder")
        ident = str(uuid.uuid5(uuid.NAMESPACE_URL, os.path.normcase(str(root))))
        name = self._text(args.get("name") or root.name or str(root), "name", 200)
        with self.lock:
            db = self._db()
            try:
                with db:
                    db.execute("INSERT INTO projects VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,opened=excluded.opened", (ident, name, str(root), time.time()))
            finally:
                db.close()
        return {"project": ident, "name": name, "root": str(root), "memory_namespace": ident,
                "next_steps": ["codebase_files", "codebase_search", "memory_search"], "game_text_language": "English"}

    def projects(self, _):
        with self.lock:
            db = self._db()
            try:
                return {"projects": [dict(row) for row in db.execute("SELECT id AS project,name,root,opened FROM projects ORDER BY opened DESC")]}
            finally:
                db.close()

    def _root(self, args):
        ident = self._text(args.get("project"), "project", 200)
        with self.lock:
            db = self._db()
            try:
                row = db.execute("SELECT root FROM projects WHERE id=?", (ident,)).fetchone()
            finally:
                db.close()
        if not row:
            raise ValueError("Unknown project; use project_open first")
        root = Path(row[0]).resolve()
        if not root.is_dir():
            raise ValueError("Project folder no longer exists")
        return root

    @staticmethod
    def _files(root, pattern="*", budget=None):
        count = 0
        for directory, directories, files in os.walk(root, followlinks=False):
            directories[:] = sorted(name for name in directories if name not in IGNORED_DIRS and not Path(directory, name).is_symlink() and not Path(directory, name).is_junction())
            for name in sorted(files):
                if budget and time.monotonic() > budget:
                    return
                path = Path(directory, name)
                if name.lower() in SECRET_NAMES or path.suffix.lower() in {".pem", ".key", ".pfx"}:
                    continue
                try:
                    if path.is_symlink() or not path.resolve().is_relative_to(root):
                        continue
                    relative = path.relative_to(root).as_posix()
                    if fnmatch.fnmatch(relative, pattern) or (pattern.startswith("**/") and fnmatch.fnmatch(relative, pattern[3:])):
                        yield path, relative
                    count += 1
                    if count >= 20000:
                        return
                except OSError:
                    continue

    def files(self, args, root=None):
        root = root or self._root(args)
        offset = max(0, min(20000, int(args.get("offset", 0))))
        limit = max(1, min(500, int(args.get("limit", 100))))
        deadline = time.monotonic() + 5
        rows = []
        for index, (path, relative) in enumerate(self._files(root, str(args.get("glob", "*")), deadline)):
            if index < offset:
                continue
            if len(rows) >= limit:
                return {"files": rows, "next_offset": offset + limit, "truncated": True}
            try:
                rows.append({"path": relative, "bytes": path.stat().st_size})
            except OSError:
                continue
        return {"files": rows, "next_offset": None, "truncated": time.monotonic() > deadline, "scan_file_limit": 20000}

    def search(self, args, root=None):
        root = root or self._root(args)
        query = self._text(args.get("query"), "query", 2000)
        sensitive = bool(args.get("case_sensitive", False))
        needle = query if sensitive else query.casefold()
        limit = max(1, min(200, int(args.get("limit", 50))))
        rows, scanned, skipped = [], 0, 0
        deadline = time.monotonic() + 5
        for path, relative in self._files(root, str(args.get("glob", "*")), deadline):
            try:
                if path.stat().st_size > 2 * 1024 * 1024:
                    skipped += 1
                    continue
                with path.open("rb") as handle:
                    raw = handle.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024 or b"\x00" in raw[:8192]:
                    skipped += 1
                    continue
                scanned += 1
                for line_number, line in enumerate(raw.decode("utf-8", errors="replace").splitlines(), 1):
                    if needle in (line if sensitive else line.casefold()):
                        rows.append({"path": relative, "line": line_number, "text": line[:600]})
                        if len(rows) >= limit:
                            return {"matches": rows, "files_scanned": scanned, "skipped_files": skipped, "truncated": True}
            except OSError:
                skipped += 1
        return {"matches": rows, "files_scanned": scanned, "skipped_files": skipped,
                "truncated": time.monotonic() > deadline, "scan_file_limit": 20000}

    def read(self, args, root=None):
        root = root or self._root(args)
        relative = Path(self._text(args.get("path"), "path", 32768))
        path = (root / relative).resolve()
        if relative.is_absolute() or not path.is_relative_to(root) or not path.is_file():
            raise ValueError("path must be a project-relative file inside the registered root")
        if path.stat().st_size > 2 * 1024 * 1024:
            raise ValueError("File exceeds the 2 MiB codebase read limit; use filesystem_read explicitly")
        raw = path.read_bytes()
        if b"\x00" in raw[:8192]:
            raise ValueError("Not a text source file")
        start = max(1, int(args.get("start_line", 1)))
        end = min(int(args.get("end_line", start + 199)), start + 399)
        if end < start:
            raise ValueError("end_line must be at least start_line")
        lines = raw.decode("utf-8", errors="replace").splitlines()
        output = [{"line": index + 1, "text": lines[index][:2000]} for index in range(start - 1, min(end, len(lines)))]
        return {"path": path.relative_to(root).as_posix(), "total_lines": len(lines), "lines": output,
                "truncated": end < len(lines) or any(len(line) > 2000 for line in lines[start - 1:end])}

    def put(self, args):
        namespace = self._text(args.get("namespace", "global"), "namespace", 200)
        ident = self._text(args.get("id") or str(uuid.uuid4()), "id", 200)
        title = self._text(args.get("title"), "title", 300)
        content = self._text(args.get("content"), "content")
        tags = args.get("tags", [])
        if not isinstance(tags, list) or len(tags) > 32 or not all(isinstance(tag, str) and len(tag) <= 80 for tag in tags):
            raise ValueError("tags must be an array of at most 32 short strings")
        with self.lock:
            db = self._db()
            try:
                now = time.time()
                with db:
                    db.execute("INSERT INTO notes VALUES(?,?,?,?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET title=excluded.title,content=excluded.content,tags=excluded.tags,updated=excluded.updated",
                               (namespace, ident, title, content, json.dumps(tags), now, now))
            finally:
                db.close()
        return {"namespace": namespace, "id": ident, "saved": True, "persistent": True}

    def recall(self, args):
        clauses, parameters = [], []
        for field in ("namespace", "id"):
            if field in args:
                clauses.append(field + "=?")
                parameters.append(self._text(args[field], field, 200))
        query = str(args.get("query", "")).strip()
        for token in query.split()[:20]:
            clauses.append("instr(lower(title || ' ' || content || ' ' || tags), lower(?)) > 0")
            parameters.append(token)
        limit = max(1, min(50, int(args.get("limit", 10))))
        offset = max(0, int(args.get("offset", 0)))
        sql = "SELECT * FROM notes" + (" WHERE " + " AND ".join(clauses) if clauses else "") + " ORDER BY updated DESC LIMIT ? OFFSET ?"
        with self.lock:
            db = self._db()
            try:
                rows = [dict(row) for row in db.execute(sql, parameters + [limit + 1, offset])]
            finally:
                db.close()
        more = len(rows) > limit
        rows = rows[:limit]
        for row in rows:
            row["tags"] = json.loads(row["tags"])
        return {"notes": rows, "next_offset": offset + limit if more else None, "persistent": True}

    def delete(self, args):
        namespace = self._text(args.get("namespace"), "namespace", 200)
        ident = self._text(args.get("id"), "id", 200)
        with self.lock:
            db = self._db()
            try:
                with db:
                    count = db.execute("DELETE FROM notes WHERE namespace=? AND id=?", (namespace, ident)).rowcount
            finally:
                db.close()
        return {"namespace": namespace, "id": ident, "deleted": bool(count)}

    def handlers(self):
        return {"workspace_status": self.status, "project_open": self.project_open, "project_list": self.projects,
                "codebase_files": self.files, "codebase_search": self.search, "codebase_read": self.read,
                "memory_put": self.put, "memory_search": self.recall, "memory_delete": self.delete}
