"""Verify DPAPI identity/grant continuity without touching production identity."""
import base64
import hashlib
import re
import secrets
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from bridge_oauth import OAuthError
from tailscale_gateway import plan
from secure_state import SecureState


def run_persistence_checks(bridge_class):
    with tempfile.TemporaryDirectory(prefix='bridge-stale-state-test-') as directory:
        root = Path(directory)
        current = SecureState(root)
        current.set('token', 'initial-test-key')
        stale = SecureState(root)
        current.set('token', 'repaired-test-key')
        stale.set('oauth', {'clients': {}, 'access': {}, 'refresh': {}})
        assert SecureState(root).get('token') == 'repaired-test-key'
    with tempfile.TemporaryDirectory(prefix='bridge-identity-test-') as directory:
        first = bridge_class(data_dir=directory, persistent=True, listen_port=0)
        first.public_url = 'https://bridge-test.invalid/pc-mcp-bridge/mcp'
        client = first.oauth.register({'redirect_uris': ['https://client.invalid/callback'], 'token_endpoint_auth_method': 'none'})
        verifier = secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        page = first.oauth.authorize({'client_id': client['client_id'], 'redirect_uri': client['redirect_uris'][0],
             'response_type': 'code', 'code_challenge_method': 'S256', 'code_challenge': challenge})
        assert 'action="/pc-mcp-bridge/approve"' in page
        ticket = re.search(r'name="ticket" value="([A-Za-z0-9_-]+)"', page).group(1)
        _, redirect = first.oauth.approve({'ticket': ticket, 'key': first.token, 'decision': 'allow'})
        tokens = first.oauth.exchange({'client_id': client['client_id'], 'grant_type': 'authorization_code',
            'redirect_uri': client['redirect_uris'][0], 'code': parse_qs(urlsplit(redirect).query)['code'][0], 'code_verifier': verifier})
        key = first.token
        encrypted = (Path(directory) / 'identity.dpapi').read_bytes()
        assert key.encode() not in encrypted and client['client_id'].encode() not in encrypted
        first.stop()
        second = bridge_class(data_dir=directory, persistent=True, listen_port=0)
        second.public_url = first.public_url
        assert second.token == key and second.oauth.valid_token(tokens['access_token'])
        assert client['client_id'] in second.oauth.clients
        assert not second.oauth.pending and not second.oauth.codes
        refreshed = second.oauth.exchange({'client_id': client['client_id'], 'grant_type': 'refresh_token', 'refresh_token': tokens['refresh_token']})
        try:
            second.oauth.exchange({'client_id': client['client_id'], 'grant_type': 'refresh_token', 'refresh_token': tokens['refresh_token']})
            raise AssertionError('Refresh token replay accepted')
        except OAuthError:
            pass
        second.oauth.revoke_all()
        third = bridge_class(data_dir=directory, persistent=True, listen_port=0)
        third.public_url = first.public_url
        assert not third.oauth.valid_token(refreshed['access_token'])
        second.stop()
        third.stop()

    unrelated = {'TCP': {'443': {'HTTPS': True}}, 'Web': {'test.ts.net:443': {'Handlers': {'/': {'Proxy': 'http://127.0.0.1:3747'}}}}}
    original = repr(unrelated)
    changes = plan(unrelated, 'test.ts.net', 'http://127.0.0.1:8879')
    assert len(changes) == 3 and repr(unrelated) == original
    unrelated['Web']['test.ts.net:443']['Handlers']['/pc-mcp-bridge'] = {'Proxy': 'http://127.0.0.1:9999'}
    try:
        plan(unrelated, 'test.ts.net', 'http://127.0.0.1:8879')
        raise AssertionError('Conflicting mount accepted')
    except ValueError:
        pass
    return ['Stale OAuth-state writer preserves a repaired/rotated on-disk master key',
            'Windows DPAPI identity and OAuth clients/grants survive restart; refresh replay rejected and explicit revocation persists',
            'Tailscale mount planning preserves unrelated routes and rejects occupied bridge paths']
