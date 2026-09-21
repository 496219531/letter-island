#!/usr/bin/env python3
"""Remote half of Letter Island deployments. Invoked by deploy.py over SSH."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tarfile
import time
import urllib.request
import urllib.error

ROOT = Path('/opt/letter-island')
BACKUPS = Path('/opt/chuo-yixia/backups')
DATABASE = Path('/var/lib/letter-island/community.sqlite')
SITE = Path('/etc/nginx/sites-available/chuo-yixia')
BASE = 'http://101.132.227.80/letter-island/'
BACKEND_FILES = {'community-store.mjs', 'lan-server.mjs', 'library-service.mjs',
                 'speech-bridge.mjs', 'ocr-queue.mjs', 'duel.cjs', 'engine.js', 'vocabulary.js',
                 'dialogues.js', 'custom-library.js', 'package.json', 'deploy/aliyun/letter-island.locations.conf'}
ENDPOINTS = ['http://127.0.0.1:4174/api/health', BASE + 'api/health',
             'http://127.0.0.1:8787/api/health', 'http://101.132.227.80/backend/api/health']


def run(*args):
    subprocess.run(args, check=True, timeout=60, stdout=subprocess.DEVNULL)


def get(url, data=None):
    request = urllib.request.Request(url, data=None if data is None else json.dumps(data).encode(),
                                    headers={'Content-Type': 'application/json'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=8) as response:
        return response.read()


def retry(check, attempts=8):
    for attempt in range(attempts):
        try:
            return check()
        except Exception:
            if attempt + 1 == attempts:
                raise
            time.sleep(1)


def health():
    for url in ENDPOINTS:
        if json.loads(get(url)).get('ok') is not True:
            raise RuntimeError('Health check failed: ' + url)


def verify_routes(ocr=False):
    data = json.loads(get(BASE + 'api/library/public/list', {}))
    if not isinstance(data.get('rows'), list):
        raise RuntimeError('Public library route is unavailable')
    if ocr:
        try:
            get(BASE + 'api/library/ocr/list', {})
        except urllib.error.HTTPError as error:
            if error.code == 401:
                return
            raise
        raise RuntimeError('OCR route did not enforce account authentication')


def backup_database(path):
    with sqlite3.connect(DATABASE.as_uri() + '?mode=ro', uri=True) as source, sqlite3.connect(path) as target:
        source.backup(target)
        if target.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('SQLite backup integrity check failed')
    path.chmod(0o600)


def validate_manifest(manifest):
    if not isinstance(manifest, dict) or not BACKEND_FILES.issubset(manifest):
        raise ValueError('Missing backend files in manifest')
    for name, digest in manifest.items():
        path = Path(name)
        if (path.is_absolute() or '..' in path.parts or str(path) != name or
                any(part.startswith('.') for part in path.parts) or path.suffix in {'.key', '.pem', '.sqlite', '.db'} or
                (name not in BACKEND_FILES and not name.startswith('dist/')) or
                not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest)):
            raise ValueError('Invalid release manifest path or digest')
    if 'dist/index.html' not in manifest:
        raise ValueError('Missing website index')


def unpack(archive, manifest, destination):
    validate_manifest(manifest)
    # Write only ordinary, allowlisted manifest files. Never extract links or archive metadata.
    with tarfile.open(archive, 'r:gz') as tar:
        members = tar.getmembers()
        if (len(members) != len(manifest) or {m.name for m in members} != set(manifest) or
                any(not m.isfile() for m in members)):
            raise ValueError('Archive does not match manifest or contains links')
        for member in members:
            data = tar.extractfile(member).read()
            if hashlib.sha256(data).hexdigest() != manifest[member.name]:
                raise ValueError('Release hash mismatch: ' + member.name)
            target = destination / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(0o644)


def switch(target, release):
    temporary = ROOT / ('next-' + release)
    if temporary.is_symlink():
        temporary.unlink()
    temporary.symlink_to(target)
    os.replace(temporary, ROOT / 'current')


def receipt(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(temporary, path)


def sync_ocr_routes(destination):
    template = (destination / 'deploy/aliyun/letter-island.locations.conf').read_text()
    pattern = r'location = /letter-island/api/library/ocr/([a-z]+) \{[^{}]*\}'
    expected = {match.group(1): match.group(0) for match in re.finditer(pattern, template)}
    if set(expected) != {'create', 'upload', 'submit', 'list', 'result', 'ack', 'retry', 'remove'}:
        raise RuntimeError('OCR proxy template is incomplete')
    original = SITE.read_text()
    existing = {match.group(1): match.group(0) for match in re.finditer(pattern, original)}
    if any(name not in expected or block != expected[name] for name, block in existing.items()):
        raise RuntimeError('Existing OCR proxy differs; inspect before replacing it')
    missing = [block for name, block in expected.items() if name not in existing]
    if not missing:
        return False
    anchor = 'location ^~ /letter-island/api/library/ {'
    if original.count(anchor) != 1:
        raise RuntimeError('Cannot locate unique library proxy boundary')
    SITE.write_text(original.replace(anchor, '\n'.join(missing) + '\n' + anchor))
    return True


def restore_proxy(backup):
    previous = (backup / 'nginx.conf').read_bytes()
    if SITE.read_bytes() != previous:
        SITE.write_bytes(previous)
        run('nginx', '-t')
        run('systemctl', 'reload', 'nginx')


def rollback(release):
    backup = BACKUPS / ('letter-island-' + release)
    previous = Path((backup / 'previous-release').read_text().strip())
    if previous.parent != ROOT / 'releases' or not previous.is_dir():
        raise RuntimeError('Previous release is invalid; refusing rollback')
    if (ROOT / 'current').resolve() != ROOT / 'releases' / release:
        raise RuntimeError('Current release changed; refusing to replace another deployment')
    switch(previous, release)
    restore_proxy(backup)
    run('systemctl', 'restart', 'letter-island')
    retry(health)
    receipt(backup / 'rollback.json', {'release': release, 'restored': str(previous),
                                      'database': 'retained', 'health': 'passed'})
    return {'status': 'rolled-back', 'release': release, 'previous': str(previous)}


def activate(release, archive, manifest):
    destination = ROOT / 'releases' / release
    backup = BACKUPS / ('letter-island-' + release)
    previous = (ROOT / 'current').resolve(strict=True)
    if previous.parent != ROOT / 'releases':
        raise RuntimeError('Unexpected current release path')
    # Fail before mutation if the existing service or proxy is already broken.
    health()
    verify_routes()
    run('nginx', '-t')
    validate_manifest(manifest)
    if destination.exists() or backup.exists():
        raise RuntimeError('Release ID already exists; use a new run')
    backup.mkdir(mode=0o700)
    (backup / 'previous-release').write_text(str(previous) + '\n')
    (backup / 'nginx.conf').write_bytes(SITE.read_bytes())
    backup_database(backup / 'community.sqlite')
    destination.mkdir(mode=0o755)
    unpack(archive, manifest, destination)
    destination.chmod(0o755)
    for folder in destination.rglob('*'):
        if folder.is_dir():
            folder.chmod(0o755)
    for name in sorted(name for name in BACKEND_FILES if name.endswith(('.js', '.mjs', '.cjs'))):
        run(str(ROOT / 'node/bin/node'), '--check', str(destination / name))
    switched = False
    report = {'release': release, 'previous': str(previous), 'backup': str(backup)}
    try:
        proxy_changed = sync_ocr_routes(destination)
        if proxy_changed:
            run('nginx', '-t')
        switch(destination, release)
        switched = True
        run('systemctl', 'restart', 'letter-island')
        if proxy_changed:
            run('systemctl', 'reload', 'nginx')
        retry(health)
        retry(lambda: verify_routes(ocr=True))
        for name in ('index.html', 'library-ui.js', 'custom-library.js', 'duel-client.js', 'game-ui.js'):
            data = get(BASE + name)
            if hashlib.sha256(data).hexdigest() != manifest['dist/' + name]:
                raise RuntimeError('Public asset mismatch: ' + name)
        with sqlite3.connect(DATABASE.as_uri() + '?mode=ro', uri=True) as db:
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('Live SQLite integrity check failed')
        report.update(status='deployed', health='passed', hashes='passed')
        receipt(backup / 'deployment.json', report)
        return report
    except BaseException as error:
        report.update(status='failed', error=type(error).__name__)
        if switched:
            try:
                report['rollback'] = rollback(release)
            except BaseException as rollback_error:
                report['rollback'] = {'status': 'failed', 'error': type(rollback_error).__name__}
        else:
            restore_proxy(backup)
        receipt(backup / 'deployment.json', report)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['activate', 'rollback', 'status'])
    parser.add_argument('--release')
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--manifest', type=Path)
    args = parser.parse_args()
    if args.action == 'status':
        health()
        verify_routes()
        print(json.dumps({'status': 'healthy', 'release': (ROOT / 'current').resolve().name}))
        return
    if not args.release or not re.fullmatch(r'\d{14}-[a-f0-9]{8}', args.release):
        parser.error('Invalid release identifier')
    with (ROOT / '.deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = rollback(args.release) if args.action == 'rollback' else activate(
            args.release, args.archive, json.loads(args.manifest.read_text()))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
