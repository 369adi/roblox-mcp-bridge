"""Fixture-based checks of memory, source access and on-demand screen capture."""
import base64
import io
import json
import tempfile
from pathlib import Path
from PIL import Image
from workspace_tools import WorkspaceTools


def run_workspace_checks(bridge, request):
    def call(name, args, expect_error=False):
        status, response = request(bridge.local_url, {"jsonrpc": "2.0", "id": 70, "method": "tools/call", "params": {"name": name, "arguments": args}}, bridge.token)
        assert status == 200 and "result" in response, response
        result = response["result"]
        assert bool(result.get("isError")) == expect_error, result
        if expect_error:
            return result
        return json.loads(result["content"][0]["text"])

    status = call("workspace_status", {})
    assert status["persistent"] and status["game_text_language"] == "English"
    with tempfile.TemporaryDirectory(prefix="bridge-codebase-fixture-") as directory:
        root = Path(directory) / "Game"
        root.mkdir()
        (root / "Server").mkdir()
        (root / "Server" / "Rewards.server.luau").write_text('-- Rewards\nlocal function awardCoins(player)\n return "Reward earned"\nend\n', encoding="utf-8")
        (root / "Shared.luau").write_text('return {awardCoins = true}\n', encoding="utf-8")
        (root / ".env").write_text("awardCoins=DO_NOT_LEAK_FIXTURE", encoding="utf-8")
        (root / "node_modules").mkdir()
        (root / "node_modules" / "ignored.luau").write_text("awardCoins", encoding="utf-8")
        (root / "image.bin").write_bytes(b"\x00awardCoins")
        (Path(directory) / "Outside.luau").write_text("outside", encoding="utf-8")
        opened = call("project_open", {"path": str(root), "name": "Fixture Roblox game"})
        project = opened["project"]
        listed = call("codebase_files", {"project": project, "glob": "*.luau", "limit": 1})
        assert len(listed["files"]) == 1 and listed["next_offset"] == 1
        listing = call("codebase_files", {"project": project, "glob": "**/*.luau"})
        assert {row["path"] for row in listing["files"]} == {"Shared.luau", "Server/Rewards.server.luau"}, listing
        search = call("codebase_search", {"project": project, "query": "AWARDCOINS"})
        assert len(search["matches"]) == 2 and all("DO_NOT_LEAK" not in row["text"] for row in search["matches"])
        bounded = call("codebase_search", {"project": project, "query": "awardCoins", "limit": 1})
        assert bounded["truncated"] and len(bounded["matches"]) == 1
        snippet = call("codebase_read", {"project": project, "path": "Server/Rewards.server.luau", "start_line": 2, "end_line": 2})
        assert len(snippet["lines"]) == 1 and snippet["lines"][0]["line"] == 2
        call("codebase_read", {"project": project, "path": "../Outside.luau"}, expect_error=True)
        call("codebase_read", {"project": project, "path": str(Path(directory) / "Outside.luau")}, expect_error=True)
        call("project_open", {"path": str(root / "Missing")}, expect_error=True)

        note = {"namespace": project, "id": "rewards-plan", "title": "Rewards design", "content": "Keep the rewards logic server-authoritative. All game text is English.", "tags": ["roblox", "architecture"]}
        assert call("memory_put", note)["saved"]
        reopened = WorkspaceTools(bridge.workspace.data_dir)
        assert reopened.recall({"namespace": project, "id": "rewards-plan"})["notes"][0]["content"] == note["content"]
        assert reopened.projects({})["projects"][0]["project"] == project
        note["content"] = "Updated server-authoritative rewards plan."
        call("memory_put", note)
        assert len(call("memory_search", {"namespace": project, "id": note["id"]})["notes"]) == 1
        other = {**note, "namespace": "another-project", "content": "Separate project note"}
        call("memory_put", other)
        assert call("memory_search", {"namespace": project, "query": "Updated server-authoritative"})["notes"][0]["content"] == note["content"]
        assert call("memory_delete", {"namespace": project, "id": note["id"]})["deleted"]
        assert not call("memory_search", {"namespace": project})["notes"]
        assert call("memory_search", {"namespace": "another-project"})["notes"]
        call("memory_delete", {"namespace": "another-project", "id": note["id"]})
        assert call("memory_search", {"namespace": "global", "id": "roblox-rules"})["notes"]
    passed = ["project registration, bounded Luau listing/search/read, ignored dependencies/secrets/binaries and traversal rejection",
              "SQLite memory persists across fresh store instances, isolates namespaces, updates/searches/deletes exact notes and retains English preference"]

    from PIL import ImageGrab
    original_grab, original_call, original_capture = ImageGrab.grab, bridge.roblox.call, bridge.roblox._capture_provider
    calls = []

    def forbidden(*args, **kwargs):
        raise AssertionError('Desktop capture must never be attempted')

    fixture = io.BytesIO()
    Image.new('RGB', (16, 12), '#335577').save(fixture, format='PNG')
    encoded = base64.b64encode(fixture.getvalue()).decode()

    def provider(args):
        calls.append(args)
        if args['name'] == 'list_roblox_studios':
            return {'content': [{'type': 'text', 'text': '{"studios":[]}'}]}
        assert args['name'] == 'screen_capture'
        return {'content': [{'type': 'image', 'mimeType': 'image/png', 'data': encoded}]}

    try:
        ImageGrab.grab = forbidden
        bridge.roblox.call = provider
        bridge.roblox._capture_provider = lambda params: provider({'name': 'screen_capture', 'arguments': params})
        call('screen_capture', {}, expect_error=True)
        call('screen_capture', {'region': {'x': 0, 'y': 0, 'width': 100, 'height': 100}}, expect_error=True)
        call('screen_capture', {'studio_id': 'fixture', 'window_id': 123}, expect_error=True)
        assert not calls
        status, response = request(bridge.local_url, {'jsonrpc': '2.0', 'id': 80, 'method': 'tools/call', 'params': {'name': 'screen_capture', 'arguments': {'studio_id': 'fixture', 'capture_id': 'Roblox_test'}}}, bridge.token)
        assert status == 200 and not response['result'].get('isError')
        image = Image.open(io.BytesIO(base64.b64decode(response['result']['content'][0]['data'])))
        assert image.size == (480, 270) and image.format == 'JPEG'
        assert calls[-1]['arguments'] == {'studio_id': 'fixture', 'capture_id': 'Roblox_test'}
        assert 'studios' in call('screen_windows', {})

        def unavailable(args):
            raise RuntimeError('Studio unavailable; no desktop fallback')
        bridge.roblox.call = unavailable
        bridge.roblox._capture_provider = unavailable
        call('screen_capture', {'studio_id': 'fixture'}, expect_error=True)
    finally:
        ImageGrab.grab, bridge.roblox.call, bridge.roblox._capture_provider = original_grab, original_call, original_capture
    passed.append('Studio-only screenshot routing: missing/legacy desktop arguments rejected, MCP image forwarded, provider failure has no desktop fallback')
    return passed
