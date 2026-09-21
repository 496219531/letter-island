#!/usr/bin/env python3
"""Repeatable web / iPhone delivery for this repository; stdlib only."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import plistlib
import shlex
import subprocess
import sys
import tarfile
import urllib.request
import uuid

from deploy_remote import BACKEND_FILES, validate_manifest

REPO = Path(__file__).resolve().parents[1]
HOST = 'root@101.132.227.80'
BASE = 'http://101.132.227.80/letter-island/'
BUNDLE = 'com.hankk.gulugarden'
DEFAULT_DEVICE = '00008110-0006341C1AC0401E'


def execute(args, *, log=None, input_text=None, timeout=600, check=True):
    if log:
        with Path(log).open('w') as output:
            result = subprocess.run(args, cwd=REPO, input=input_text, text=True,
                                    stdout=output, stderr=subprocess.STDOUT, timeout=timeout)
    else:
        result = subprocess.run(args, cwd=REPO, input=input_text, text=True,
                                capture_output=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError('Command failed: ' + args[0] + (f'; see {log}' if log else '\n' + result.stderr[-1500:]))
    return result


def ssh(key, command, **kwargs):
    return execute(['ssh', '-i', str(key), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
                    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', HOST,
                    shlex.join(command)], **kwargs)


def package_web(out):
    files = [REPO / name for name in sorted(BACKEND_FILES)]
    files += sorted(p for p in (REPO / 'dist').rglob('*') if not p.is_dir() and p.name != '.DS_Store')
    manifest = {}
    for path in files:
        if path.is_symlink() or not path.is_file():
            raise RuntimeError('Release must contain ordinary files: ' + str(path))
        manifest[path.relative_to(REPO).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    validate_manifest(manifest)
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    with tarfile.open(out / 'release.tar.gz', 'w:gz') as tar:
        for name in manifest:
            tar.add(REPO / name, arcname=name, recursive=False)
    return manifest


def device_apps(device, out, tag):
    target = out / (tag + '-apps.json')
    execute(['xcrun', 'devicectl', 'device', 'info', 'apps', '--device', device,
             '--filter', f'bundleIdentifier == "{BUNDLE}"', '--timeout', '30',
             '--json-output', str(target)], log=out / (tag + '-apps.log'), timeout=45)
    return json.loads(target.read_text())['result']['apps']


def choose_build(source, installed, requested=None):
    previous = max([int(source)] + [int(app['bundleVersion']) for app in installed])
    value = int(requested) if requested else previous + 1
    if value <= previous:
        raise ValueError(f'Build number must exceed {previous}')
    return str(value)


def prepare_iphone(args, out, installed):
    info = plistlib.loads((REPO / 'ios/GuluGarden/Info.plist').read_bytes())
    number = choose_build(info['CFBundleVersion'], installed, args.build_number)
    info['CFBundleVersion'] = number
    # A build-specific plist avoids modifying the tracked source just to increment a release.
    build_plist = out / 'Info.plist'
    build_plist.write_bytes(plistlib.dumps(info))
    print('Building signed iPhone app, build ' + number, flush=True)
    execute(['xcodebuild', '-project', 'ios/GuluGarden.xcodeproj', '-scheme', 'GuluGarden',
             '-configuration', 'Debug', '-destination', 'generic/platform=iOS',
             '-derivedDataPath', 'ios/build', '-allowProvisioningUpdates',
             'INFOPLIST_FILE=' + str(build_plist), 'build'], log=out / 'iphone-build.log', timeout=900)
    app = REPO / 'ios/build/Build/Products/Debug-iphoneos/GuluGarden.app'
    execute(['codesign', '--verify', '--deep', '--strict', str(app)], log=out / 'codesign.log')
    built = plistlib.loads((app / 'Info.plist').read_bytes())
    if built['CFBundleVersion'] != number or built['CFBundleIdentifier'] != BUNDLE:
        raise RuntimeError('Built app identity/version mismatch')
    for original in (REPO / 'ios/GuluGarden/Web').rglob('*'):
        if original.is_file() and original.name != '.DS_Store' and original.read_bytes() != (app / 'Web' / original.relative_to(REPO / 'ios/GuluGarden/Web')).read_bytes():
            raise RuntimeError('Stale native web resource: ' + original.name)
    if (app / 'bridge.js').read_bytes() != (REPO / 'ios/GuluGarden/bridge.js').read_bytes():
        raise RuntimeError('Stale native bridge')
    return app, number


def install_iphone(args, out, app, number):
    print('Installing iPhone build ' + number, flush=True)
    execute(['xcrun', 'devicectl', 'device', 'install', 'app', '--device', args.device,
             '--timeout', '120', str(app)], log=out / 'iphone-install.log', timeout=150)
    apps = device_apps(args.device, out, 'installed')
    if not any(a['bundleIdentifier'] == BUNDLE and a['bundleVersion'] == number for a in apps):
        raise RuntimeError('Device inventory did not confirm the installed build')
    result = {'status': 'installed', 'build': number, 'bundle': BUNDLE}
    launch = execute(['xcrun', 'devicectl', 'device', 'process', 'launch', '--device', args.device,
                      '--timeout', '30', BUNDLE], log=out / 'iphone-launch.log', timeout=45, check=False)
    result['launch'] = 'opened' if launch.returncode == 0 else 'not-opened; see iphone-launch.log (phone may be locked)'
    return result


def deploy_web(args, out, release, manifest):
    print('Uploading website/backend; remote backup and rollback are enabled', flush=True)
    stage = '/tmp/letter-deploy-' + release
    ssh(args.ssh_key, ['mkdir', '-m', '700', stage])
    execute(['scp', '-i', str(args.ssh_key), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
             str(out / 'release.tar.gz'), str(out / 'manifest.json'),
             str(REPO / 'scripts/deploy_remote.py'), HOST + ':' + stage + '/'], log=out / 'upload.log')
    command = ['python3', stage + '/deploy_remote.py']
    ssh(args.ssh_key, command + ['activate', '--release', release,
                                '--archive', stage + '/release.tar.gz', '--manifest', stage + '/manifest.json'],
        log=out / 'web-activate.log', timeout=360)
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for name in ('index.html', 'library-ui.js', 'library.css', 'custom-library.js', 'duel-client.js', 'game-ui.js', 'mobile-app.js', 'iphone.css'):
            with opener.open(BASE + name, timeout=15) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != manifest['dist/' + name]:
                raise RuntimeError('External asset hash mismatch: ' + name)
    except Exception:
        ssh(args.ssh_key, command + ['rollback', '--release', release], log=out / 'web-rollback.log', timeout=180)
        raise
    return {'status': 'deployed', 'release': release, 'url': BASE,
            'backup': '/opt/chuo-yixia/backups/letter-island-' + release,
            'verification': 'remote health/database/hash checks and external asset hashes passed'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', choices=['web', 'iphone', 'all', 'status'])
    parser.add_argument('--prepare-only', action='store_true', help='Test/build/package locally; do not upload or install')
    parser.add_argument('--ssh-key', type=Path, default=Path.home() / '.ssh/chuo-aliyun-deploy')
    parser.add_argument('--device', default=DEFAULT_DEVICE, help='Exact physical device identifier; never auto-select another phone')
    parser.add_argument('--build-number', type=int, help='Optional explicit iPhone build number (must increase)')
    args = parser.parse_args()
    args.ssh_key = args.ssh_key.expanduser().resolve()
    if args.target == 'status':
        result = ssh(args.ssh_key, ['python3', '-', 'status'],
                     input_text=(REPO / 'scripts/deploy_remote.py').read_text(), timeout=90)
        print(result.stdout.strip())
        devices = execute(['xcrun', 'devicectl', 'list', 'devices', '--timeout', '15'], check=False, timeout=30)
        print(devices.stdout.strip())
        return
    release = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S') + '-' + uuid.uuid4().hex[:8]
    output_root = REPO / 'output/deploy'
    output_root.mkdir(parents=True, exist_ok=True)
    out = output_root / release
    out.mkdir(mode=0o700)
    report = {'run': release, 'target': args.target, 'prepare_only': args.prepare_only, 'log_directory': str(out)}
    print('Deployment logs: ' + str(out), flush=True)
    with (output_root / '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            native = args.target in ('iphone', 'all')
            web = args.target in ('web', 'all')
            installed = device_apps(args.device, out, 'before') if native and not args.prepare_only else []
            print('Running application and deployment regression tests', flush=True)
            execute(['npm', 'test'], log=out / 'tests.log')
            execute([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_deploy.py'], log=out / 'deploy-tests.log')
            execute(['node', 'ios/prepare.mjs'] if native else ['npm', 'run', 'build'], log=out / 'build.log')
            app, number = prepare_iphone(args, out, installed) if native else (None, None)
            manifest = package_web(out) if web else None
            if args.prepare_only:
                report.update(status='prepared', iphone_build=number, app=str(app) if app else None)
            else:
                if web:
                    report['web'] = deploy_web(args, out, release, manifest)
                    (out / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
                if native:
                    report['iphone'] = install_iphone(args, out, app, number)
                report['status'] = 'complete'
        except Exception as error:
            report.update(status='failed', error=str(error))
            raise
        finally:
            (out / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Deployment stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
