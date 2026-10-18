"""Forward the locally installed official Roblox Studio stdio MCP server."""
import os
import re
import math
import secrets
import base64
import io
import json
import copy
from PIL import Image
from pathlib import Path
from rea_gateway import REAGateway
from pc_mcp_bridge import result_text
from visual_feedback import attach_capture


def tool(name, description, properties=None, required=None, readonly=True):
    schema = {"type": "object", "properties": properties or {}}
    if required:
        schema["required"] = required
    return {"name": name, "description": description, "inputSchema": schema,
            "annotations": {"readOnlyHint": readonly, "destructiveHint": not readonly, "openWorldHint": True}}


ROBLOX_TOOLS = [
    tool("roblox_status", "Start/check the official locally installed Roblox Studio MCP server. Studio must be running with Enable Studio as MCP server turned on."),
    tool("roblox_studios", "List connected Roblox Studio instances. Select the intended studio_id before reading, editing, or testing a place."),
    tool("roblox_state", "Read play/edit state and available datamodel types for one selected Roblox Studio instance.", {"studio_id": {"type": "string"}}, ["studio_id"]),
    tool("roblox_list_tools", "Search the official Studio tool catalog (scripts, Luau execution, tree/instances, console, playtests, screenshots, assets, UI input). Pass name to retrieve its exact input schema before calling roblox_call_tool.",
         {"query": {"type": "string"}, "name": {"type": "string"}, "offset": {"type": "integer"}, "limit": {"type": "integer", "maximum": 100}}),
    tool("roblox_call_tool", "Call an official Roblox Studio MCP tool, preserving images and structured results. Discover arguments with roblox_list_tools(name). Calls may modify the game, run playtests, generate or upload assets. Choose studio_id explicitly, follow the user's requested scope, and keep all game text English.",
         {"name": {"type": "string"}, "arguments": {"type": "object", "additionalProperties": True}, "visual": {"type": "boolean", "description": "execute_luau automatically returns a post-action Studio image by default; false only for read-only diagnostics or nonvisual script/system work."}, "capture_target":{'type':'string','description':'Optional exact instance path to frame in the post-Luau image; otherwise current Studio view.'}}, ["name"], readonly=False),
]


class RobloxGateway(REAGateway):
    def __init__(self, emit):
        super().__init__(emit, label="Roblox Studio")

    @staticmethod
    def binary():
        root = Path(os.environ.get("LOCALAPPDATA", "")) / "Roblox"
        # Use the current Studio-generated launcher as the authoritative version hint.
        launcher = root / "mcp.bat"
        if launcher.is_file():
            text = launcher.read_text(encoding="utf-8-sig", errors="replace")
            match = re.search(r'if exist "([^"]+StudioMCP\.exe)"', text, re.I)
            if match:
                path = Path(match[1]).resolve()
                if path.is_relative_to(root.resolve()) and path.is_file():
                    return path
        candidates = list((root / "Versions").glob("version-*/StudioMCP.exe"))
        if candidates:
            return max(candidates, key=lambda path: path.stat().st_mtime)
        raise FileNotFoundError("Official StudioMCP.exe not found. Install/update Roblox Studio and enable Studio as MCP server in Assistant settings.")

    def start(self):
        self._start_process([str(self.binary())])

    def call(self, args):
        if 'visual' in args and not isinstance(args['visual'],bool):
            raise ValueError('visual must be boolean')
        target=args.get('capture_target')
        if target is not None and (not isinstance(target,str) or not target.strip() or len(target)>1000):
            raise ValueError('capture_target must be an exact instance path, at most 1000 characters')
        if args.get('name') == 'start_stop_play':
            return result_text('Manual playtest preference: this bridge does not start or stop Studio playtests. The user performs these in Studio.', is_error=True)
        if args.get('name') == 'screen_capture':
            return self.capture(args.get('arguments', {}))
        result = super().call(args)
        if args.get('name') == 'execute_luau':
            result = self.compact(result)
            params=args.get('arguments',{})
            if args.get('visual',True) and not result.get('isError') and params.get('studio_id'):
                capture_args={'studio_id':params['studio_id'],'width':1280,'height':720,'quality':82,'return_mode':'inline'}
                if target is not None: capture_args['target']=target
                result=attach_capture(result,lambda:self.capture(capture_args))
        return result

    @staticmethod
    def compact(result):
        # Drop duplicate structured payloads too; otherwise capped text can still balloon.
        result = copy.deepcopy(result)
        if 'structuredContent' in result:
            if not result.get('content'):
                result['content'] = [{'type': 'text', 'text': json.dumps(result['structuredContent'], ensure_ascii=False)}]
            result.pop('structuredContent', None)
        budget, trimmed, content = 4000, False, []
        for block in result.get('content', []):
            if block.get('type') == 'text':
                value = block.get('text', '')
                if len(value) > budget:
                    trimmed = True
                if budget:
                    content.append({'type': 'text', 'text': value[:budget]})
                    budget -= min(len(value), budget)
            else:
                # Luau diagnostic output is text only, not arbitrary resources/images.
                trimmed = True
        if trimmed:
            marker = '\n[Ausgabe gekürzt: maximal 4000 Zeichen; gezielt kleinere Ergebnisse anfordern.]'
            overflow = sum(len(c['text']) for c in content) + len(marker) - 4000
            for c in reversed(content):
                if overflow <= 0:
                    break
                remove = min(overflow, len(c['text']))
                c['text'] = c['text'][:-remove] if remove else c['text']
                overflow -= remove
            content.append({'type': 'text', 'text': marker})
        result['content'] = content
        return result

    def status(self, _):
        self.start()
        return {"running": self.process.poll() is None, "tool_count": len(self.tools),
                "provider": "Official Roblox Studio MCP", "binary": str(self.binary()),
                "next_step": "Call roblox_studios, then use studio_id on targeted operations."}

    def studios(self, _):
        return self.call({"name": "list_roblox_studios", "arguments": {}})

    def state(self, args):
        studio_id = args.get("studio_id")
        if not isinstance(studio_id, str) or not studio_id:
            raise ValueError("studio_id is required; obtain it from roblox_studios")
        return self.call({"name": "get_studio_state", "arguments": {"studio_id": studio_id}})

    def capture(self, args):
        if not hasattr(self, '_captures'):
            from capture_tools import StudioCaptures
            self._captures = StudioCaptures(self)
        return self._captures.capture(args)

    def capture_get(self, args):
        if not hasattr(self, '_captures'):
            raise ValueError('No captures in this bridge session')
        return self._captures.get(args)

    def _capture_provider(self, params):
        self.start()
        try:
            return self.request('tools/call', {'name': 'screen_capture', 'arguments': params}, timeout=20)
        except TimeoutError:
            return result_text('Studio renderer did not respond within 20 seconds; no partial image or desktop fallback. Check Studio connectivity before retrying.', is_error=True)
