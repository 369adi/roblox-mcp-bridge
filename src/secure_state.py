"""User-bound Windows DPAPI storage for the stable bridge identity and grants."""
import ctypes
import json
import os
import tempfile
import threading
from ctypes import wintypes


class Blob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]


def protect(data, decrypt=False):
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = Blob()
    crypt = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [wintypes.HLOCAL]
    kernel.LocalFree.restype = wintypes.HLOCAL
    function = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                         ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    function.restype = wintypes.BOOL
    # CRYPTPROTECT_UI_FORBIDDEN; no machine-wide flag: current user only.
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(output.data, output.size)
    finally:
        kernel.LocalFree(ctypes.cast(output.data, wintypes.HLOCAL))


class SecureState:
    def __init__(self, directory):
        self.path = directory / 'identity.dpapi'
        self.lock = threading.RLock()
        self.data = {}
        if self.path.exists():
            if self.path.stat().st_size > 8 * 1024**2:
                raise ValueError('Bridge identity file is too large')
            self.data = json.loads(protect(self.path.read_bytes(), decrypt=True))
            if not isinstance(self.data, dict):
                raise ValueError('Invalid bridge identity')

    def get(self, name, default=None):
        with self.lock:
            return self.data.get(name, default)

    def set(self, name, value):
        with self.lock:
            # OAuth writes must not restore a stale cached master key after a
            # key repair/rotation in another state instance. Merge only the
            # requested field into the current encrypted on-disk document.
            latest = self.data
            if self.path.exists():
                if self.path.stat().st_size > 8 * 1024**2:
                    raise ValueError('Bridge identity file is too large')
                latest = json.loads(protect(self.path.read_bytes(), decrypt=True))
                if not isinstance(latest, dict):
                    raise ValueError('Invalid bridge identity')
            updated = {**latest, name: value}
            encrypted = protect(json.dumps(updated).encode('utf-8'))
            self.path.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(prefix='identity-', suffix='.tmp', dir=self.path.parent)
            try:
                with os.fdopen(descriptor, 'wb') as stream:
                    stream.write(encrypted)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, self.path)
                self.data = updated
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
