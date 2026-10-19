"""Resolve the explicitly configured canonical install, without shell command parsing."""
import json
from pathlib import Path


def canonical_executable(current,data_dir):
    config=Path(data_dir)/'startup-install.json'
    if not config.is_file() or config.stat().st_size>8192: return None
    try:
        target=Path(json.loads(config.read_text('utf-8-sig'))['executable'])
        if not target.is_absolute() or target.name.lower()!='pc-mcp-bridge.exe': return None
        target=target.resolve()
        if not target.is_file() or not (target.parent/'_internal').is_dir(): return None
        return target if target!=Path(current).resolve() else None
    except (OSError,ValueError,KeyError,TypeError):
        return None
