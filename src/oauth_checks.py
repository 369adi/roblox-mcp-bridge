"""HTTP integration checks for the bridge's OAuth flow (no ChatGPT account writes)."""
import base64
import hashlib
import json
import re
import secrets
import time
import urllib.error
import urllib.request
from urllib.parse import urlencode, urlsplit, parse_qs

from bridge_oauth import digest


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None


def run_oauth_checks(bridge):
    base = bridge.oauth.issuer
    resource = bridge.oauth.resource
    opener = urllib.request.build_opener(NoRedirect)

    def http(path, data=None, form=False, headers=None):
        headers = dict(headers or {})
        body = None
        if data is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
            body = (urlencode(data) if form else json.dumps(data)).encode()
        req = urllib.request.Request(base + path, body, headers)
        try:
            response = opener.open(req, timeout=20)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            raw = response.read().decode("utf-8")
            return response.status, response.headers, json.loads(raw) if raw and response.headers.get_content_type() == "application/json" else raw

    status, _, meta = http("/.well-known/oauth-authorization-server")
    assert status == 200 and meta["issuer"] == base and meta["code_challenge_methods_supported"] == ["S256"]
    assert meta["registration_endpoint"] == base + "/register"
    status, _, protected = http("/.well-known/oauth-protected-resource/mcp")
    assert status == 200 and protected["resource"] == resource and protected["authorization_servers"] == [base]
    status, headers, _ = http("/mcp", {"jsonrpc": "2.0", "id": 1, "method": "ping"})
    assert status == 401 and base + "/.well-known/oauth-protected-resource/mcp" in headers["WWW-Authenticate"]
    passed = ["OAuth discovery, resource audience and MCP authentication challenge"]

    def register(method):
        status, _, client = http("/register", {"redirect_uris": ["https://chatgpt.com/connector_platform_oauth_redirect"],
            "client_name": "ChatGPT integration test", "token_endpoint_auth_method": method})
        assert status == 201, client
        return client

    def authorize(client):
        verifier = secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        params = {"client_id": client["client_id"], "redirect_uri": client["redirect_uris"][0],
                  "response_type": "code", "code_challenge_method": "S256", "code_challenge": challenge,
                  "scope": "pc:full", "resource": resource, "state": "test-state-" + secrets.token_hex(8)}
        assert http("/authorize?" + urlencode({**params, "redirect_uri": "https://wrong.invalid/callback"}))[0] == 400
        assert http("/authorize?" + urlencode({**params, "code_challenge_method": "plain"}))[0] == 400
        assert http("/authorize?" + urlencode({**params, "resource": "https://wrong.invalid/mcp"}))[0] == 400
        status, page_headers, page = http("/authorize?" + urlencode(params))
        assert status == 200 and bridge.token not in page
        assert page_headers["Referrer-Policy"] == "same-origin"
        assert "form-action 'self' https://chatgpt.com;" in page_headers["Content-Security-Policy"]
        assert http("/approve", {"ticket": "invalid", "key": bridge.token, "decision": "allow"}, form=True, headers={"Origin": "null"})[0] == 403
        ticket = re.search(r'name="ticket" value="([A-Za-z0-9_-]+)"', page).group(1)
        status, _, rejected = http("/approve", {"ticket": ticket, "key": "wrong", "decision": "allow"}, form=True)
        assert status == 200 and "Incorrect connection key" in rejected
        assert http("/approve", {"ticket": ticket, "key": bridge.token, "decision": "allow"}, form=True, headers={"Origin": "https://wrong.invalid"})[0] == 403
        parsed_base = urlsplit(base)
        status, headers, _ = http("/approve", {"ticket": ticket, "key": bridge.token, "decision": "allow"}, form=True, headers={"Origin": parsed_base.scheme + '://' + parsed_base.netloc})
        assert status == 303, status
        callback = urlsplit(headers["Location"])
        args = parse_qs(callback.query)
        assert args["state"] == [params["state"]] and args["iss"] == [base]
        assert callback.hostname == "chatgpt.com"
        assert http("/approve", {"ticket": ticket, "key": bridge.token, "decision": "allow"}, form=True)[0] == 400
        return {"grant_type": "authorization_code", "client_id": client["client_id"], "redirect_uri": params["redirect_uri"],
                "code": args["code"][0], "code_verifier": verifier, "resource": resource}

    public = register("none")
    args = authorize(public)
    assert http("/token", {**args, "code_verifier": "a" * 64}, form=True)[0] == 400
    assert http("/token", {**args, "resource": "https://wrong.invalid/mcp"}, form=True)[0] == 400
    status, _, token = http("/token", args, form=True)
    assert status == 200 and token["expires_in"] == 1800 and token["scope"] == "pc:full", token
    assert http("/token", args, form=True)[0] == 400
    assert http("/mcp", {"jsonrpc": "2.0", "id": 1, "method": "ping"}, headers={"Authorization": "Bearer " + token["access_token"]})[0] == 200
    passed.append("DCR public client: consent key, CSRF/redirect checks, PKCE, issuer/state echo, one-use code and authenticated MCP")

    refresh_args = {"grant_type": "refresh_token", "client_id": public["client_id"], "refresh_token": token["refresh_token"], "resource": resource}
    status, _, renewed = http("/token", refresh_args, form=True)
    assert status == 200 and renewed["refresh_token"] != token["refresh_token"]
    assert http("/token", refresh_args, form=True)[0] == 400
    with bridge.oauth.lock:
        bridge.oauth.access[digest(token["access_token"])]["expires"] = time.time() - 1
    assert http("/mcp", {"jsonrpc": "2.0", "id": 1, "method": "ping"}, headers={"Authorization": "Bearer " + token["access_token"]})[0] == 401
    assert http("/revoke", {"client_id": public["client_id"], "token": renewed["access_token"]}, form=True)[0] == 200
    assert http("/mcp", {"jsonrpc": "2.0", "id": 1, "method": "ping"}, headers={"Authorization": "Bearer " + renewed["access_token"]})[0] == 401
    passed.append("OAuth access-token expiry, refresh rotation/replay rejection and token revocation")

    for method in ("client_secret_post", "client_secret_basic"):
        client = register(method)
        args = authorize(client)
        assert http("/token", args, form=True)[0] == 401
        headers = {}
        if method == "client_secret_post":
            args["client_secret"] = client["client_secret"]
        else:
            headers["Authorization"] = "Basic " + base64.b64encode((client["client_id"] + ":" + client["client_secret"]).encode()).decode()
        status, _, result = http("/token", args, form=True, headers=headers)
        assert status == 200 and "access_token" in result, result
    bridge.oauth.revoke_all()
    assert not bridge.oauth.valid_token(result["access_token"])
    passed.append("DCR confidential clients: client_secret_post/basic and bridge-wide OAuth revocation")
    return passed
