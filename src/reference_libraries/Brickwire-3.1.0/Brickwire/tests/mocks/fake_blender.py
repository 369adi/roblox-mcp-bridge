"""Fake Blender for tests: a minimal `bpy` stub that runs the real Brickwire Connector add-on against a live bridge.
Usage: python3 fake_blender.py <path to brickwire_blender.py>   (env BRICKWIRE_URL, FAKE_PUSH=1 to push once)"""
import importlib.util, os, struct, sys, time, types, zlib

def png(w=4, h=3):
    raw = b"".join(b"\x00" + bytes([200, 60, 40, 255]) * w for _ in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

CUBE_OBJ = """mtllib {mtl}
o Cube
v -1 -1 -1
v 1 -1 -1
v 1 1 -1
v -1 1 -1
v -1 -1 1
v 1 -1 1
v 1 1 1
v -1 1 1
usemtl Red
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 5 1 4 8
"""

class Obj:
    def __init__(self, name, sel=True):
        self.name, self.type, self._sel, self.parent = name, "MESH", sel, None
        self.location, self.dimensions = (0.0, 0.0, 0.0), (2.0, 2.0, 2.0)
        self.data = types.SimpleNamespace(vertices=[0] * 8, polygons=[types.SimpleNamespace(vertices=[0, 1, 2, 3])] * 6, materials=[types.SimpleNamespace(name="Red")])
    def select_get(self): return self._sel
    def visible_get(self): return True

class Objects(list):
    def __getitem__(self, k):
        if isinstance(k, str):
            for o in self:
                if o.name == k: return o
            raise KeyError(k)
        return list.__getitem__(self, k)
    def __contains__(self, k):
        return any(o.name == k for o in self) if isinstance(k, str) else list.__contains__(self, k)

OBJS = Objects([Obj("Cube"), Obj("Lamp", False)])

class Timers:
    def __init__(self): self.fns = []
    def register(self, fn, first_interval=0, persistent=False): self.fns.append(fn)
    def is_registered(self, fn): return fn in self.fns
    def unregister(self, fn): self.fns.remove(fn)

render = types.SimpleNamespace(engine="BLENDER_EEVEE", resolution_x=1920, resolution_y=1080, resolution_percentage=100, filepath="", image_settings=types.SimpleNamespace(file_format="PNG"))
scene = types.SimpleNamespace(name="Scene", objects=OBJS, frame_current=1, render=render, unit_settings=types.SimpleNamespace(system="METRIC"), camera=None)
bpy = types.ModuleType("bpy")
bpy.app = types.SimpleNamespace(version_string="4.2.0 (fake)", timers=Timers())
bpy.data = types.SimpleNamespace(filepath="/tmp/castle.blend", objects=OBJS)
bpy.context = types.SimpleNamespace(scene=scene, view_layer=types.SimpleNamespace(objects=types.SimpleNamespace(active=OBJS[0])), window_manager=types.SimpleNamespace(windows=[]))
IMPORTED = []

def obj_export(filepath, **kw):
    base = os.path.splitext(filepath)[0]
    open(filepath, "w").write(CUBE_OBJ.format(mtl=os.path.basename(base) + ".mtl"))
    open(base + ".mtl", "w").write("newmtl Red\nKd 0.800000 0.100000 0.100000\n")
def gltf(filepath, **kw): open(filepath, "wb").write(b"glTF" + struct.pack("<II", 2, 20) + b"\x00" * 8)
def fbx(filepath, **kw): open(filepath, "wb").write(b"Kaydara FBX Binary  \x00" + b"\x00" * 16)
def opengl(write_still=True, view_context=True): open(render.filepath, "wb").write(png())
def imp(filepath, **kw):
    IMPORTED.append(filepath)
    name = os.path.splitext(os.path.basename(filepath))[0]
    while name in OBJS: name += ".001"  # Blender keeps names unique
    OBJS.append(Obj(name, False))
NS = types.SimpleNamespace
bpy.ops = NS(wm=NS(obj_import=imp, obj_export=obj_export), export_scene=NS(gltf=gltf, fbx=fbx), import_scene=NS(gltf=imp, fbx=imp), render=NS(opengl=opengl, render=lambda **k: opengl()))
bpy.types = NS(Operator=object, Panel=object)
bpy.utils = NS(register_class=lambda c: None, unregister_class=lambda c: None)
sys.modules["bpy"] = bpy

spec = importlib.util.spec_from_file_location("brickwire_blender", sys.argv[1])
addon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(addon)
addon.register()
pushed = False
end = time.time() + float(os.environ.get("FAKE_SECONDS", "90"))
while time.time() < end:
    for fn in list(bpy.app.timers.fns):
        fn()
    if os.environ.get("FAKE_PUSH") == "1" and not pushed and addon._state["status"] == "online":
        pushed = True
        addon.push_to_chat("model")
    if addon._state["last_push"] and not getattr(addon, "_reported", False):
        addon._reported = True
        print("PUSH:", addon._state["last_push"], flush=True)
    time.sleep(0.05)
addon.unregister()
