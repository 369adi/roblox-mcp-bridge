"""Dedicated Funnel mounts; never reset or replace unrelated Serve entries."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

PREFIX = '/pc-mcp-bridge'
LOCAL_PORT = 8879


def binary():
    installed = Path(os.environ.get('ProgramFiles', r'C:\Program Files')) / 'Tailscale/tailscale.exe'
    found = str(installed) if installed.is_file() else shutil.which('tailscale')
    if not found:
        raise FileNotFoundError('Install and sign in to Tailscale for Windows first.')
    return found


def cli(*args, timeout=35):
    result = subprocess.run([binary(), *args], capture_output=True, text=True,
                            encoding='utf-8', errors='replace', timeout=timeout,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError('Tailscale: ' + (result.stderr or result.stdout).strip()[:500])
    return result.stdout


def plan(config, dns, target):
    authority = dns + ':443'
    tcp = config.get('TCP', {}).get('443', {})
    if tcp and not tcp.get('HTTPS'):
        raise ValueError('Tailscale port 443 has an unrelated non-HTTPS service; not changing it.')
    handlers = config.get('Web', {}).get(authority, {}).get('Handlers', {})
    routes = {PREFIX: target}
    changes = []
    for mount, proxy in routes.items():
        current = handlers.get(mount) or handlers.get(mount + '/')
        if current and current != {'Proxy': proxy}:
            raise ValueError('Existing Tailscale mount belongs to another service: ' + mount)
        if not current:
            changes.append((mount, proxy))
    return changes


def ensure(target):
    state = json.loads(cli('status', '--json'))
    if state.get('BackendState') != 'Running':
        raise RuntimeError('Tailscale is not connected. Open Tailscale and sign in; the bridge will retry.')
    dns = str(state.get('Self', {}).get('DNSName', '')).rstrip('.')
    if not re.fullmatch(r'[a-zA-Z0-9.-]+\.ts\.net', dns):
        raise ValueError('Tailscale did not return a valid ts.net name')
    config = json.loads(cli('funnel', 'status', '--json') or '{}')
    # Retire only this bridge's old OAuth discovery mounts; never touch other apps.
    handlers=config.get('Web',{}).get(dns+':443',{}).get('Handlers',{})
    for mount,proxy in {
        '/.well-known/oauth-authorization-server'+PREFIX:target+'/.well-known/oauth-authorization-server',
        '/.well-known/oauth-protected-resource'+PREFIX+'/mcp':target+'/.well-known/oauth-protected-resource/mcp',
    }.items():
        if handlers.get(mount)=={'Proxy':proxy}:
            cli('funnel','--bg','--yes','--https=443','--set-path='+mount,'off')
    changes = plan(config, dns, target)
    for mount, proxy in changes:
        cli('funnel', '--bg', '--yes', '--https=443', '--set-path=' + mount, proxy)
    # Ensure an already configured private Serve mount is not mistaken for Funnel.
    refreshed = json.loads(cli('funnel', 'status', '--json') or '{}')
    if not refreshed.get('AllowFunnel', {}).get(dns + ':443'):
        cli('funnel', '--bg', '--yes', '--https=443', '--set-path=' + PREFIX, target)
    return 'https://' + dns + PREFIX + '/mcp'
