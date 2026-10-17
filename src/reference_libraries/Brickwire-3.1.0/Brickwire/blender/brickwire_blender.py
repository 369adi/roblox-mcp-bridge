# Brickwire Connector for Blender
# Connects a running Blender to the local Brickwire bridge (http://127.0.0.1:<port>), so the Brickwire app and
# AI agent can read the scene, import/export models, render previews and run (confirmed) Python - and so you can
# send the selected objects straight into the Brickwire chat (View3D > Sidebar (N) > Brickwire).
# No extra packages, no MCP, no uv: only the Python that ships with Blender.  Local connection only.
bl_info = {
    "name": "Brickwire Connector",
    "author": "Brickwire",
    "version": (1, 0, 0),
    "blender": (2, 93, 0),
    "location": "View3D > Sidebar > Brickwire",
    "description": "Connects Blender to the Brickwire app: send models and renders to the chat, let the AI import/export",
    "category": "Import-Export",
}

import base64
import contextlib
import io
import json
import os
import queue
import tempfile
import threading
import time
import traceback
import urllib.request
import uuid

import bpy

ADDON_VERSION = "1.0.0"
DEFAULT_PORT = 47821  # replaced with the configured bridge port when Brickwire installs the add-on
PORT = int(os.environ.get("BRICKWIRE_PORT") or DEFAULT_PORT)
BASE = os.environ.get("BRICKWIRE_URL") or ("http://127.0.0.1:%d" % PORT)
MAX_PUSH_BYTES = 28 * 1024 * 1024

_state = {
    "thread": None, "stop": False, "status": "offline", "error": "", "client": uuid.uuid4().hex[:12],
    "jobs": queue.Queue(), "file": "", "version": "", "busy": "", "last_push": "", "registered": False,
}


def _post(path, payload, timeout=30):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def _info():
    return {"id": _state["client"], "blender": _state["version"], "file": _state["file"], "addon": ADDON_VERSION}


def _poll_loop():
    while not _state["stop"]:
        try:
            r = _post("/api/blender/poll", {"client": _info(), "wait": 15000}, timeout=30)
            _state["status"] = "online"
            _state["error"] = ""
            job = r.get("job")
            if job:
                _state["jobs"].put(job)
        except Exception as e:  # bridge not running yet / restarting
            _state["status"] = "offline"
            _state["error"] = str(e)[:200]
            for _ in range(30):
                if _state["stop"]:
                    return
                time.sleep(0.1)


def _send_result(job_id, ok, data=None, error=None):
    def run():
        try:
            _post("/api/blender/result", {"client": _state["client"], "jobId": job_id, "ok": ok, "data": data, "error": error}, timeout=120)
        except Exception as e:
            _state["error"] = "result upload failed: %s" % e
    threading.Thread(target=run, daemon=True).start()


# ------------------------------------------------------------------ helpers (main thread only)
def _override():
    """Context override for operators that need a 3D viewport (Blender 3.2+ temp_override, older dict override)."""
    wm = bpy.context.window_manager
    for win in getattr(wm, "windows", []):
        for area in win.screen.areas:
            if area.type == "VIEW_3D":
                region = next((r for r in area.regions if r.type == "WINDOW"), None)
                return {"window": win, "screen": win.screen, "area": area, "region": region, "scene": bpy.context.scene}
    return None


def _call_op(op, **kw):
    try:
        return op(**kw)
    except RuntimeError as e:
        ov = _override()
        if not ov:
            raise
        if hasattr(bpy.context, "temp_override"):
            with bpy.context.temp_override(**ov):
                return op(**kw)
        return op(ov, **kw)


def _tmpdir():
    return tempfile.mkdtemp(prefix="brickwire_")


def _b64file(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def _selected(selection):
    objs = [o for o in bpy.context.scene.objects if (o.select_get() if selection else True) and o.type in ("MESH", "CURVE", "SURFACE", "META", "FONT", "EMPTY", "ARMATURE")]
    return objs


def _tri_count(objs):
    n = 0
    for o in objs:
        if o.type == "MESH" and o.data:
            for p in o.data.polygons:
                n += max(1, len(p.vertices) - 2)
    return n


def op_ping(args):
    return {"pong": True, "blender": _state["version"], "file": _state["file"], "addon": ADDON_VERSION}


def op_scene(args):
    sc = bpy.context.scene
    out = []
    for o in list(sc.objects)[: int(args.get("limit") or 200)]:
        item = {"name": o.name, "type": o.type, "location": [round(v, 4) for v in o.location],
                "dimensions": [round(v, 4) for v in o.dimensions], "selected": bool(o.select_get()), "visible": bool(o.visible_get())}
        if o.type == "MESH" and o.data:
            item["vertices"] = len(o.data.vertices)
            item["faces"] = len(o.data.polygons)
            item["materials"] = [m.name for m in o.data.materials if m]
        if o.parent:
            item["parent"] = o.parent.name
        out.append(item)
    return {"file": _state["file"], "scene": sc.name, "frame": sc.frame_current, "engine": sc.render.engine,
            "unit": sc.unit_settings.system, "objects": out, "total": len(sc.objects),
            "selected": [o.name for o in sc.objects if o.select_get()],
            "active": bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None}


def op_python(args):
    code = str(args.get("code") or "")
    buf = io.StringIO()
    ns = {"bpy": bpy, "__name__": "__brickwire__", "result": None}
    with contextlib.redirect_stdout(buf):
        exec(compile(code, "<brickwire>", "exec"), ns)
    res = ns.get("result")
    try:
        json.dumps(res)
    except Exception:
        res = repr(res)
    return {"stdout": buf.getvalue()[-20000:], "result": res}


def op_import(args):
    files = args.get("files") or []
    if not files:
        raise ValueError("no files to import")
    d = _tmpdir()
    main = None
    for f in files:
        name = os.path.basename(str(f.get("name") or "model.bin"))
        p = os.path.join(d, name)
        with open(p, "wb") as fh:
            fh.write(base64.b64decode(f.get("data") or ""))
        if main is None and name.lower().rsplit(".", 1)[-1] in ("obj", "fbx", "glb", "gltf", "stl", "ply", "dae", "abc", "usd", "usdz", "usda", "usdc"):
            main = p
    if not main:
        raise ValueError("no importable model among the files (obj, fbx, glb, gltf, stl, ply)")
    ext = main.lower().rsplit(".", 1)[-1]
    before = set(o.name for o in bpy.data.objects)
    if ext == "obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            _call_op(bpy.ops.wm.obj_import, filepath=main)
        else:
            _call_op(bpy.ops.import_scene.obj, filepath=main)
    elif ext == "fbx":
        _call_op(bpy.ops.import_scene.fbx, filepath=main)
    elif ext in ("glb", "gltf"):
        _call_op(bpy.ops.import_scene.gltf, filepath=main)
    elif ext == "stl":
        if hasattr(bpy.ops.wm, "stl_import"):
            _call_op(bpy.ops.wm.stl_import, filepath=main)
        else:
            _call_op(bpy.ops.import_mesh.stl, filepath=main)
    elif ext == "ply":
        if hasattr(bpy.ops.wm, "ply_import"):
            _call_op(bpy.ops.wm.ply_import, filepath=main)
        else:
            _call_op(bpy.ops.import_mesh.ply, filepath=main)
    elif ext == "dae":
        _call_op(bpy.ops.wm.collada_import, filepath=main)
    elif ext in ("usd", "usdz", "usda", "usdc"):
        _call_op(bpy.ops.wm.usd_import, filepath=main)
    else:
        _call_op(bpy.ops.wm.alembic_import, filepath=main)
    new = [o.name for o in bpy.data.objects if o.name not in before]
    if args.get("name") and len(new) == 1:
        ob = bpy.data.objects[new[0]]
        ob.name = str(args["name"])[:60]
        new = [ob.name]
    return {"imported": len(new), "objects": new[:100], "format": ext}


def op_export(args):
    selection = args.get("selection", True) is not False
    formats = [str(f).lower() for f in (args.get("formats") or ["glb", "obj"])]
    objs = _selected(selection)
    if selection and not objs:
        raise ValueError("Nothing is selected in Blender - select the objects to send (or pass selection=false for the whole scene)")
    if not objs:
        raise ValueError("The scene has no exportable objects")
    base = "".join(c if c.isalnum() or c in "-_" else "_" for c in str(args.get("name") or (objs[0].name if len(objs) == 1 else (_state["file"] or "scene"))))[:50] or "model"
    d = _tmpdir()
    out = []
    for fmt in formats:
        if fmt == "glb":
            p = os.path.join(d, base + ".glb")
            _call_op(bpy.ops.export_scene.gltf, filepath=p, export_format="GLB", use_selection=selection)
            out.append(p)
        elif fmt == "fbx":
            p = os.path.join(d, base + ".fbx")
            _call_op(bpy.ops.export_scene.fbx, filepath=p, use_selection=selection)
            out.append(p)
        elif fmt == "obj":
            p = os.path.join(d, base + ".obj")
            if hasattr(bpy.ops.wm, "obj_export"):
                _call_op(bpy.ops.wm.obj_export, filepath=p, export_selected_objects=selection, export_triangulated_mesh=True, export_materials=True)
            else:
                _call_op(bpy.ops.export_scene.obj, filepath=p, use_selection=selection, use_triangles=True, use_materials=True)
            out.append(p)
            if os.path.exists(os.path.join(d, base + ".mtl")):
                out.append(os.path.join(d, base + ".mtl"))
        elif fmt == "stl":
            p = os.path.join(d, base + ".stl")
            if hasattr(bpy.ops.wm, "stl_export"):
                _call_op(bpy.ops.wm.stl_export, filepath=p, export_selected_objects=selection)
            else:
                _call_op(bpy.ops.export_mesh.stl, filepath=p, use_selection=selection)
            out.append(p)
        else:
            raise ValueError("unsupported export format: %s (glb, fbx, obj, stl)" % fmt)
    files, total, skipped = [], 0, []
    for p in out:
        if not os.path.exists(p):
            continue
        size = os.path.getsize(p)
        if total + size > MAX_PUSH_BYTES:
            skipped.append(os.path.basename(p))
            continue
        total += size
        files.append({"name": os.path.basename(p), "data": _b64file(p), "bytes": size})
    return {"name": base, "objects": [o.name for o in objs][:100], "count": len(objs), "triangles": _tri_count(objs), "files": files, "skipped": skipped}


def op_render(args):
    sc = bpy.context.scene
    r = sc.render
    keep = (r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, r.image_settings.file_format)
    p = os.path.join(_tmpdir(), "render.png")
    try:
        r.resolution_x = int(args.get("width") or 1024)
        r.resolution_y = int(args.get("height") or 768)
        r.resolution_percentage = 100
        r.image_settings.file_format = "PNG"
        r.filepath = p
        if args.get("camera") and sc.camera:
            bpy.ops.render.render(write_still=True)
        else:
            _call_op(bpy.ops.render.opengl, write_still=True, view_context=True)
    finally:
        r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, r.image_settings.file_format = keep
    if not os.path.exists(p):
        raise RuntimeError("Blender did not write the render")
    return {"name": "blender_render.png", "data": _b64file(p), "bytes": os.path.getsize(p)}


OPS = {"ping": op_ping, "scene": op_scene, "python": op_python, "import": op_import, "export": op_export, "render": op_render}


def _tick():
    if _state["stop"]:
        return None
    try:
        _state["file"] = os.path.basename(bpy.data.filepath) if bpy.data.filepath else "untitled.blend"
    except Exception:
        pass
    for _ in range(4):
        try:
            job = _state["jobs"].get_nowait()
        except queue.Empty:
            break
        fn = OPS.get(job.get("op"))
        _state["busy"] = job.get("op") or ""
        try:
            if not fn:
                raise ValueError("unknown operation %s - update the Brickwire Connector add-on" % job.get("op"))
            _send_result(job.get("id"), True, fn(job.get("args") or {}))
        except Exception as e:
            _send_result(job.get("id"), False, None, "%s: %s\n%s" % (type(e).__name__, e, traceback.format_exc()[-1500:]))
        finally:
            _state["busy"] = ""
    return 0.25


def push_to_chat(kind, with_render=True):
    """Send the selection (model files + viewport picture) or only a picture to the Brickwire chat."""
    payload = {"client": _state["client"], "kind": kind, "file": _state["file"], "blender": _state["version"]}
    if kind == "model":
        exp = op_export({"selection": True, "formats": ["glb", "obj"]})
        payload.update({"name": exp["name"], "objects": exp["objects"], "triangles": exp["triangles"], "files": exp["files"], "skipped": exp["skipped"]})
    if with_render or kind == "image":
        try:
            payload["render"] = op_render({"width": 1024, "height": 768})
        except Exception as e:
            payload["renderError"] = str(e)[:300]

    def run():
        try:
            r = _post("/api/blender/push", payload, timeout=120)
            _state["last_push"] = r.get("message") or "sent"
        except Exception as e:
            _state["last_push"] = "failed: %s" % e
    threading.Thread(target=run, daemon=True).start()


# ------------------------------------------------------------------ UI
class BRICKWIRE_OT_send_selection(bpy.types.Operator):
    bl_idname = "brickwire.send_selection"
    bl_label = "Send selection to Brickwire chat"
    bl_description = "Export the selected objects (GLB + OBJ) with a viewport picture into the Brickwire app chat"

    def execute(self, context):
        try:
            push_to_chat("model")
            self.report({"INFO"}, "Brickwire: sending selection...")
        except Exception as e:
            self.report({"ERROR"}, "Brickwire: %s" % e)
            return {"CANCELLED"}
        return {"FINISHED"}


class BRICKWIRE_OT_send_view(bpy.types.Operator):
    bl_idname = "brickwire.send_view"
    bl_label = "Send viewport picture"
    bl_description = "Send a picture of the 3D viewport to the Brickwire app chat"

    def execute(self, context):
        try:
            push_to_chat("image")
            self.report({"INFO"}, "Brickwire: sending picture...")
        except Exception as e:
            self.report({"ERROR"}, "Brickwire: %s" % e)
            return {"CANCELLED"}
        return {"FINISHED"}


class BRICKWIRE_OT_reconnect(bpy.types.Operator):
    bl_idname = "brickwire.reconnect"
    bl_label = "Reconnect"

    def execute(self, context):
        stop()
        start()
        return {"FINISHED"}


class BRICKWIRE_PT_panel(bpy.types.Panel):
    bl_label = "Brickwire"
    bl_idname = "BRICKWIRE_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Brickwire"

    def draw(self, context):
        col = self.layout.column()
        online = _state["status"] == "online"
        col.label(text=("Connected to Brickwire" if online else "Brickwire app not found"), icon=("CHECKMARK" if online else "ERROR"))
        if not online:
            col.label(text="Start Brickwire (port %d)" % PORT)
        col.operator("brickwire.send_selection", icon="EXPORT")
        col.operator("brickwire.send_view", icon="RENDER_STILL")
        if _state["last_push"]:
            col.label(text=_state["last_push"][:60])
        col.operator("brickwire.reconnect", icon="FILE_REFRESH")


CLASSES = (BRICKWIRE_OT_send_selection, BRICKWIRE_OT_send_view, BRICKWIRE_OT_reconnect, BRICKWIRE_PT_panel)


def start():
    _state["stop"] = False
    if _state["thread"] is None or not _state["thread"].is_alive():
        t = threading.Thread(target=_poll_loop, name="brickwire-poll", daemon=True)
        _state["thread"] = t
        t.start()
    if not bpy.app.timers.is_registered(_tick):
        bpy.app.timers.register(_tick, first_interval=0.5, persistent=True)


def stop():
    _state["stop"] = True
    try:
        if bpy.app.timers.is_registered(_tick):
            bpy.app.timers.unregister(_tick)
    except Exception:
        pass
    _state["thread"] = None


def register():
    if _state["registered"]:
        return
    _state["version"] = bpy.app.version_string
    try:
        _state["file"] = os.path.basename(bpy.data.filepath) if bpy.data.filepath else "untitled.blend"
    except Exception:
        pass
    for c in CLASSES:
        try:
            bpy.utils.register_class(c)
        except Exception:
            pass
    _state["registered"] = True
    start()


def unregister():
    stop()
    for c in reversed(CLASSES):
        try:
            bpy.utils.unregister_class(c)
        except Exception:
            pass
    _state["registered"] = False


if __name__ == "__main__":  # blender --python brickwire_blender.py
    register()
