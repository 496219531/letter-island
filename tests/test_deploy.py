import hashlib
import io
import json
from pathlib import Path
import sqlite3
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import deploy
import deploy_remote as remote


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / 'letter-island'
        self.previous = self.root / 'releases' / 'old'
        self.previous.mkdir(parents=True)
        (self.root / 'current').symlink_to(self.previous)
        self.backups = self.base / 'backups'
        self.backups.mkdir()
        self.database = self.base / 'community.sqlite'
        with sqlite3.connect(self.database) as db:
            db.execute('CREATE TABLE records(value TEXT)')
            db.execute("INSERT INTO records VALUES('keep user data')")
        self.site = self.base / 'nginx.conf'
        self.site.write_text('location ^~ /letter-island/api/library/ { return 403; }')
        self.release = '20260921000000-1234abcd'
        self.payloads = {name: b'// backend' for name in remote.BACKEND_FILES}
        for name in ('index.html', 'library-ui.js', 'custom-library.js', 'duel-client.js', 'game-ui.js'):
            self.payloads['dist/' + name] = name.encode()
        self.payloads['deploy/aliyun/letter-island.locations.conf'] = (SCRIPTS.parent / 'deploy/aliyun/letter-island.locations.conf').read_bytes()
        self.manifest = {name: hashlib.sha256(data).hexdigest() for name, data in self.payloads.items()}
        self.archive = self.base / 'release.tar.gz'
        with tarfile.open(self.archive, 'w:gz') as tar:
            for name, data in self.payloads.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
        for key, value in [('ROOT', self.root), ('BACKUPS', self.backups),
                           ('DATABASE', self.database), ('SITE', self.site)]:
            patcher = patch.object(remote, key, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_deploy_preserves_database_and_records_verified_backup(self):
        with patch.object(remote, 'run'), patch.object(remote, 'health'), patch.object(remote, 'verify_routes'), \
                patch.object(remote, 'get', side_effect=lambda url: self.payloads['dist/' + url.rsplit('/', 1)[-1]]):
            result = remote.activate(self.release, self.archive, self.manifest)
        self.assertEqual(result['status'], 'deployed')
        self.assertEqual((self.root / 'current').resolve(), self.root / 'releases' / self.release)
        backup = Path(result['backup'])
        for path in (self.database, backup / 'community.sqlite'):
            with sqlite3.connect(path) as db:
                self.assertEqual(db.execute('SELECT value FROM records').fetchone()[0], 'keep user data')
        self.assertIn('/letter-island/api/library/ocr/upload', self.site.read_text())
        self.assertIn('return 403;', self.site.read_text())
        self.assertEqual(json.loads((backup / 'deployment.json').read_text())['hashes'], 'passed')

    def test_health_failure_rolls_back_code_but_keeps_new_database_writes(self):
        def health():
            if (self.root / 'current').resolve() != self.previous:
                with sqlite3.connect(self.database) as db:
                    db.execute("INSERT INTO records VALUES('new user data')")
                raise RuntimeError('unhealthy new release')
        with patch.object(remote, 'run'), patch.object(remote, 'health', side_effect=health), \
                patch.object(remote, 'verify_routes'), patch.object(remote, 'retry', side_effect=lambda check: check()):
            with self.assertRaisesRegex(RuntimeError, 'unhealthy'):
                remote.activate(self.release, self.archive, self.manifest)
        self.assertEqual((self.root / 'current').resolve(), self.previous)
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM records').fetchone()[0], 2)
        result = json.loads((self.backups / ('letter-island-' + self.release) / 'deployment.json').read_text())
        self.assertEqual(result['rollback']['status'], 'rolled-back')
        self.assertEqual(self.site.read_text(), 'location ^~ /letter-island/api/library/ { return 403; }')

    def test_rollback_does_not_clobber_a_later_deployment(self):
        backup = self.backups / ('letter-island-' + self.release)
        backup.mkdir()
        (backup / 'previous-release').write_text(str(self.previous))
        with self.assertRaisesRegex(RuntimeError, 'Current release changed'):
            remote.rollback(self.release)
        self.assertEqual((self.root / 'current').resolve(), self.previous)

    def test_corrupt_package_is_rejected_before_activation(self):
        damaged = dict(self.manifest)
        damaged['dist/index.html'] = '0' * 64
        with patch.object(remote, 'run'), patch.object(remote, 'health'), patch.object(remote, 'verify_routes'):
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                remote.activate(self.release, self.archive, damaged)
        self.assertEqual((self.root / 'current').resolve(), self.previous)

    def test_path_traversal_and_symlink_members_are_rejected(self):
        for name in ('../outside', '/tmp/outside', 'dist/../outside', 'dist/.env', 'dist/private.key', 'dist/community.sqlite'):
            with self.assertRaises(ValueError):
                remote.validate_manifest({**self.manifest, name: '0' * 64})
        archive = self.base / 'link.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar:
            for name in self.manifest:
                info = tarfile.TarInfo(name)
                info.type = tarfile.SYMTYPE
                info.linkname = '/etc/passwd'
                tar.addfile(info)
        with self.assertRaisesRegex(ValueError, 'contains links'):
            remote.unpack(archive, self.manifest, self.base / 'unpacked')

    def test_build_number_uses_installed_version_and_rejects_downgrade(self):
        self.assertEqual(deploy.choose_build('68', [{'bundleVersion': '72'}]), '73')
        self.assertEqual(deploy.choose_build('68', [], 75), '75')
        with self.assertRaises(ValueError):
            deploy.choose_build('68', [{'bundleVersion': '72'}], 72)

    def test_prepare_only_never_uploads_or_installs(self):
        fake_repo = self.base / 'repo'
        fake_repo.mkdir()
        with patch.object(deploy, 'REPO', fake_repo), patch.object(sys, 'argv', ['deploy.py', 'all', '--prepare-only']), \
                patch.object(deploy, 'execute'), patch.object(deploy, 'prepare_iphone', return_value=(self.base / 'app', '69')), \
                patch.object(deploy, 'package_web', return_value=self.manifest), \
                patch.object(deploy, 'deploy_web') as upload, patch.object(deploy, 'install_iphone') as install, \
                patch.object(deploy, 'device_apps') as devices:
            deploy.main()
            upload.assert_not_called()
            install.assert_not_called()
            devices.assert_not_called()
        reports = list((fake_repo / 'output/deploy').glob('*/result.json'))
        self.assertEqual(json.loads(reports[0].read_text())['status'], 'prepared')

    def test_all_records_successful_web_when_phone_install_fails(self):
        fake_repo = self.base / 'partial-repo'
        fake_repo.mkdir()
        with patch.object(deploy, 'REPO', fake_repo), patch.object(sys, 'argv', ['deploy.py', 'all']), \
                patch.object(deploy, 'execute'), patch.object(deploy, 'device_apps', return_value=[]), \
                patch.object(deploy, 'prepare_iphone', return_value=(self.base / 'app', '69')), \
                patch.object(deploy, 'package_web', return_value=self.manifest), \
                patch.object(deploy, 'deploy_web', return_value={'status': 'deployed', 'release': 'verified'}), \
                patch.object(deploy, 'install_iphone', side_effect=RuntimeError('phone disconnected')):
            with self.assertRaisesRegex(RuntimeError, 'phone disconnected'):
                deploy.main()
        report = json.loads(next((fake_repo / 'output/deploy').glob('*/result.json')).read_text())
        self.assertEqual(report['status'], 'failed')
        self.assertEqual(report['web']['status'], 'deployed')
        self.assertNotIn('iphone', report)

    def test_unavailable_phone_stops_all_before_web_mutation(self):
        fake_repo = self.base / 'offline-repo'
        fake_repo.mkdir()
        with patch.object(deploy, 'REPO', fake_repo), patch.object(sys, 'argv', ['deploy.py', 'all']), \
                patch.object(deploy, 'device_apps', side_effect=RuntimeError('unavailable')), \
                patch.object(deploy, 'execute') as commands, patch.object(deploy, 'deploy_web') as upload:
            with self.assertRaisesRegex(RuntimeError, 'unavailable'):
                deploy.main()
            commands.assert_not_called()
            upload.assert_not_called()


if __name__ == '__main__':
    unittest.main()
