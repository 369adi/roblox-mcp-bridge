"""In-memory OAuth authorization-code/PKCE provider for one bridge session."""
import base64
import hashlib
import hmac
import html
import json
import re
import secrets
import threading
import time
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit, unquote


SCOPE = "pc:full"


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class OAuthError(ValueError):
    def __init__(self, code, message, status=400):
        self.code, self.message, self.status = code, message, status


class OAuthProvider:
    def __init__(self, bridge):
        self.bridge = bridge
        self.lock = threading.RLock()
        self.clients, self.pending, self.codes, self.access, self.refresh = {}, {}, {}, {}, {}
        if bridge.store:
            saved = bridge.store.get('oauth', {})
            for name in ('clients', 'access', 'refresh'):
                setattr(self, name, saved.get(name, {}))
            self._clean()

    def persist(self):
        if self.bridge.store:
            self.bridge.store.set('oauth', {name: getattr(self, name) for name in ('clients', 'access', 'refresh')})

    @property
    def resource(self):
        return self.bridge.public_url or self.bridge.local_url

    @property
    def issuer(self):
        return self.resource.removesuffix("/mcp")

    def metadata(self):
        return {"issuer": self.issuer, "authorization_endpoint": self.issuer + "/authorize",
                "token_endpoint": self.issuer + "/token", "registration_endpoint": self.issuer + "/register",
                "revocation_endpoint": self.issuer + "/revoke", "response_types_supported": ["code"],
                "grant_types_supported": ["authorization_code", "refresh_token"],
                "token_endpoint_auth_methods_supported": ["none", "client_secret_post", "client_secret_basic"],
                "code_challenge_methods_supported": ["S256"], "scopes_supported": [SCOPE],
                "authorization_response_iss_parameter_supported": True}

    def _clean(self):
        now = time.time()
        for collection in (self.pending, self.codes, self.access, self.refresh):
            for key, item in list(collection.items()):
                if item["expires"] <= now:
                    del collection[key]

    def revoke_all(self):
        with self.lock:
            for collection in (self.pending, self.codes, self.access, self.refresh):
                collection.clear()
            self.persist()

    def valid_token(self, token):
        with self.lock:
            self._clean()
            item = self.access.get(digest(token))
            return bool(item and item["resource"] == self.resource and item["scope"] == SCOPE)

    @staticmethod
    def _redirect_valid(uri):
        if not isinstance(uri, str) or len(uri) > 2048 or any(ord(c) < 33 for c in uri):
            return False
        try:
            parsed = urlsplit(uri)
            return bool(not parsed.fragment and not parsed.username and not parsed.password and parsed.hostname and (
                parsed.scheme == "https" or (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"})))
        except ValueError:
            return False

    def register(self, data):
        redirects = data.get("redirect_uris")
        if not isinstance(redirects, list) or not 1 <= len(redirects) <= 10 or not all(map(self._redirect_valid, redirects)):
            raise OAuthError("invalid_redirect_uri", "Register exact HTTPS callback URLs.")
        method = data.get("token_endpoint_auth_method", "client_secret_basic")
        if method not in self.metadata()["token_endpoint_auth_methods_supported"]:
            raise OAuthError("invalid_client_metadata", "Unsupported token endpoint authentication method.")
        if any(grant not in {"authorization_code", "refresh_token"} for grant in data.get("grant_types", ["authorization_code"])):
            raise OAuthError("invalid_client_metadata", "Unsupported grant type.")
        if data.get("response_types", ["code"]) != ["code"]:
            raise OAuthError("invalid_client_metadata", "Only authorization-code responses are supported.")
        with self.lock:
            if len(self.clients) >= 256:
                raise OAuthError("temporarily_unavailable", "Client registration limit reached.", 429)
            client_id = "pcbridge_" + secrets.token_urlsafe(24)
            secret = secrets.token_urlsafe(32) if method != "none" else None
            record = {"client_id": client_id, "redirect_uris": redirects,
                      "client_name": str(data.get("client_name", "MCP client"))[:120],
                      "token_endpoint_auth_method": method, "grant_types": ["authorization_code", "refresh_token"],
                      "response_types": ["code"], "client_id_issued_at": int(time.time())}
            self.clients[client_id] = {**record, "secret_hash": digest(secret) if secret else None}
            if secret:
                record.update(client_secret=secret, client_secret_expires_at=0)
            self.persist()
            return record

    def authorize(self, args):
        with self.lock:
            self._clean()
            client_id = args.get("client_id", "")
            client = self.clients.get(client_id)
            redirect = args.get("redirect_uri", "")
            if not client or redirect not in client["redirect_uris"]:
                raise OAuthError("invalid_request", "Unknown client or unregistered callback URL.")
            if args.get("response_type") != "code":
                raise OAuthError("unsupported_response_type", "Only response_type=code is supported.")
            challenge = args.get("code_challenge", "")
            if args.get("code_challenge_method") != "S256" or not re.fullmatch(r"[A-Za-z0-9_-]{43}", challenge):
                raise OAuthError("invalid_request", "PKCE with a valid S256 challenge is required.")
            resource = args.get("resource", self.resource)
            if resource != self.resource:
                raise OAuthError("invalid_target", "Resource must match the MCP URL exactly.")
            if args.get("scope", SCOPE) != SCOPE:
                raise OAuthError("invalid_scope", "Only pc:full is supported.")
            if len(self.pending) >= 256:
                raise OAuthError("temporarily_unavailable", "Too many pending authorizations.", 429)
            ticket = secrets.token_urlsafe(32)
            self.pending[digest(ticket)] = {"client_id": client_id, "redirect_uri": redirect,
                "challenge": challenge, "resource": resource, "scope": SCOPE,
                "state": str(args.get("state", ""))[:4096], "expires": time.time() + 300, "attempts": 0}
            self.bridge.emit("log", "OAuth authorization requested. Enter the connection key on the approval page.")
            return self.consent_page(ticket, self.pending[digest(ticket)])

    def consent_page(self, ticket, request, error=""):
        escape = html.escape
        client = self.clients[request["client_id"]]
        return f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>PC MCP Bridge - Connect</title>
<style>body{{font:16px system-ui;background:#15181f;color:#eef1f7;margin:0;padding:32px 16px}}
main{{max-width:540px;margin:4vh auto;padding:28px;background:#242a35;border-radius:18px}}
h1{{font-size:26px}}p{{line-height:1.5}}code{{overflow-wrap:anywhere}}input,button{{box-sizing:border-box;width:100%;padding:13px;margin:8px 0;border-radius:8px;border:1px solid #718096;font:inherit}}
button{{background:#6ba8ff;color:#101623;font-weight:700;cursor:pointer}}.deny{{background:#353e4c;color:white}}.error{{color:#ffb4a9}}</style></head>
<body><main><h1>Connect to PC MCP Bridge</h1><p>Client: <strong>{escape(client['client_name'])}</strong></p>
<p>Callback: <code>{escape(request['redirect_uri'])}</code></p>
<p>This connection can read and change files, run programs and commands, capture your screen, and control your mouse and keyboard.</p>
<p>In the PC MCP Bridge window, select <strong>Copy key</strong> and paste it below to approve this connection.</p>
<p class="error">{escape(error)}</p><form method="post" action="{escape(urlsplit(self.issuer).path + '/approve')}">
<input type="hidden" name="ticket" value="{escape(ticket)}">
<label for="key">Connection key</label><input id="key" name="key" type="password" autocomplete="off" required autofocus>
<button name="decision" value="allow">Approve PC access</button>
<button class="deny" name="decision" value="deny" formnovalidate>Cancel</button></form>
<p>The key is checked by this bridge. It is not sent to the client.</p></main></body></html>'''

    def approve(self, args):
        with self.lock:
            self._clean()
            ticket = args.get("ticket", "")
            record = self.pending.get(digest(ticket))
            if not record:
                raise OAuthError("invalid_request", "Approval expired. Restart the connection from ChatGPT.")
            if args.get("decision") == "deny":
                del self.pending[digest(ticket)]
                return "redirect", self._callback(record, error="access_denied")
            if record["attempts"] >= 5:
                raise OAuthError("access_denied", "Too many attempts. Restart the connection.", 429)
            if not hmac.compare_digest(args.get("key", "").encode(), self.bridge.token.encode()):
                record["attempts"] += 1
                return "html", (self.consent_page(ticket, record, "Incorrect connection key. Copy it from the bridge window."), record["redirect_uri"])
            del self.pending[digest(ticket)]
            code = secrets.token_urlsafe(32)
            self.codes[digest(code)] = {**record, "expires": time.time() + 120}
            self.bridge.emit("log", "OAuth PC access approved; awaiting token exchange.")
            return "redirect", self._callback(record, code=code)

    def _callback(self, record, **parameters):
        uri = urlsplit(record["redirect_uri"])
        extra = {"iss": self.issuer, **parameters}
        if record["state"]:
            extra["state"] = record["state"]
        query = uri.query + ("&" if uri.query else "") + urlencode(extra)
        return urlunsplit(uri._replace(query=query))

    def _client(self, args, authorization):
        client_id, secret = args.get("client_id", ""), args.get("client_secret", "")
        supplied_method = "client_secret_post" if secret else "none"
        if authorization.startswith("Basic "):
            try:
                ident, password = base64.b64decode(authorization[6:], validate=True).decode().split(":", 1)
                basic_id, secret = unquote(ident), unquote(password)
                if client_id and client_id != basic_id:
                    raise ValueError("Conflicting client identifiers")
                client_id, supplied_method = basic_id, "client_secret_basic"
            except (ValueError, UnicodeError):
                raise OAuthError("invalid_client", "Invalid client authentication.", 401) from None
        client = self.clients.get(client_id)
        if not client or supplied_method != client["token_endpoint_auth_method"]:
            raise OAuthError("invalid_client", "Unknown client or incorrect authentication method.", 401)
        if client["secret_hash"] and not hmac.compare_digest(digest(secret), client["secret_hash"]):
            raise OAuthError("invalid_client", "Incorrect client secret.", 401)
        return client_id

    def exchange(self, args, authorization=""):
        with self.lock:
            self._clean()
            client_id = self._client(args, authorization)
            grant = args.get("grant_type")
            if grant == "authorization_code":
                key = digest(args.get("code", ""))
                record = self.codes.get(key)
                if not record or record["client_id"] != client_id or args.get("redirect_uri") != record["redirect_uri"]:
                    raise OAuthError("invalid_grant", "Invalid, expired, or already used authorization code.")
                verifier = args.get("code_verifier", "")
                if not re.fullmatch(r"[A-Za-z0-9._~-]{43,128}", verifier):
                    raise OAuthError("invalid_grant", "Invalid PKCE verifier.")
                challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
                if not hmac.compare_digest(challenge, record["challenge"]):
                    raise OAuthError("invalid_grant", "PKCE verification failed.")
                source = self.codes
            elif grant == "refresh_token":
                key = digest(args.get("refresh_token", ""))
                record = self.refresh.get(key)
                if not record or record["client_id"] != client_id:
                    raise OAuthError("invalid_grant", "Invalid or expired refresh token.")
                source = self.refresh
            else:
                raise OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.")
            if args.get("resource", record["resource"]) != record["resource"] or record["resource"] != self.resource:
                raise OAuthError("invalid_target", "Resource does not match the authorized MCP URL.")
            if args.get("scope", record["scope"]) != record["scope"]:
                raise OAuthError("invalid_scope", "Scope cannot be changed.")
            if len(self.access) >= 1024:
                raise OAuthError("temporarily_unavailable", "Token limit reached.", 429)
            del source[key]
            access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            grant_record = {"client_id": client_id, "resource": record["resource"], "scope": SCOPE}
            self.access[digest(access)] = {**grant_record, "expires": time.time() + 1800}
            self.refresh[digest(refresh)] = {**grant_record, "expires": time.time() + 8 * 3600}
            self.persist()
            self.bridge.emit("log", "OAuth access token issued (30 minutes); refresh token rotated.")
            return {"access_token": access, "token_type": "Bearer", "expires_in": 1800,
                    "refresh_token": refresh, "scope": SCOPE}

    def route(self, handler):
        """Serve public discovery and OAuth routes; return False for MCP requests."""
        path = urlsplit(handler.path).path.rstrip("/")
        routes = {"/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource",
                  "/.well-known/oauth-protected-resource/mcp", "/register", "/authorize", "/approve", "/token", "/revoke"}
        if path not in routes:
            return False
        try:
            if self.bridge.stopped.is_set():
                raise OAuthError("temporarily_unavailable", "Bridge stopped.", 503)
            if handler.command == "GET" and path.startswith("/.well-known/"):
                if not self.issuer:
                    raise OAuthError("temporarily_unavailable", "Tunnel not ready.", 503)
                payload = self.metadata() if path.endswith("oauth-authorization-server") else {
                    "resource": self.resource, "authorization_servers": [self.issuer],
                    "scopes_supported": [SCOPE], "bearer_methods_supported": ["header"], "resource_name": "PC MCP Bridge"}
                handler.respond(200, payload, Access_Control_Allow_Origin="*")
            elif handler.command == "GET" and path == "/authorize":
                args = self._single(parse_qs(urlsplit(handler.path).query, keep_blank_values=True))
                handler.send_html(self.authorize(args), callback=args["redirect_uri"])
            elif handler.command == "POST" and path in {"/register", "/approve", "/token", "/revoke"}:
                length = int(handler.headers.get("Content-Length", "0"))
                if length <= 0 or length > 65536:
                    raise OAuthError("invalid_request", "Invalid request size.")
                raw = handler.rfile.read(length).decode("utf-8")
                if path == "/register":
                    if handler.headers.get_content_type() != "application/json":
                        raise OAuthError("invalid_request", "Use application/json.")
                    data = json.loads(raw)
                    if not isinstance(data, dict):
                        raise OAuthError("invalid_request", "Expected an object.")
                    handler.respond(201, self.register(data), Access_Control_Allow_Origin="*")
                else:
                    if handler.headers.get_content_type() != "application/x-www-form-urlencoded":
                        raise OAuthError("invalid_request", "Use form encoding.")
                    data = self._single(parse_qs(raw, keep_blank_values=True))
                    if path == "/approve":
                        origin = handler.headers.get("Origin")
                        parsed_issuer = urlsplit(self.issuer)
                        if origin and origin != parsed_issuer.scheme + '://' + parsed_issuer.netloc:
                            raise OAuthError("access_denied", "Invalid approval origin.", 403)
                        kind, output = self.approve(data)
                        if kind == "html":
                            handler.send_html(*output)
                        else:
                            handler.respond(303, None, Location=output)
                    elif path == "/token":
                        handler.respond(200, self.exchange(data, handler.headers.get("Authorization", "")), Access_Control_Allow_Origin="*")
                    else:
                        with self.lock:
                            client_id = self._client(data, handler.headers.get("Authorization", ""))
                            key = digest(data.get("token", ""))
                            for collection in (self.access, self.refresh):
                                record = collection.get(key)
                                if record and record["client_id"] == client_id:
                                    del collection[key]
                            self.persist()
                        handler.respond(200, {})
            else:
                handler.respond(405, {"error": "method_not_allowed"})
        except OAuthError as exc:
            handler.respond(exc.status, {"error": exc.code, "error_description": exc.message}, Access_Control_Allow_Origin="*")
        except (ValueError, TypeError, UnicodeError):
            handler.respond(400, {"error": "invalid_request"})
        return True

    @staticmethod
    def _single(values):
        if any(len(items) != 1 for items in values.values()):
            raise OAuthError("invalid_request", "Duplicate parameters are not allowed.")
        return {key: items[0] for key, items in values.items()}
