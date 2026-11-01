from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'deploy'))
from participate_database import database_command, database_configuration, database_source


class DatabaseClientTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env = Path(self.directory.name) / 'database-remote.env'
        self.ca = Path(self.directory.name) / 'railway-db-ca.crt'
        self.source = Path(self.directory.name) / 'database-source'
        self.ca.write_text('-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----\n')
        self.ca.chmod(0o644)

    def configure(self, **overrides):
        values = {'PGHOST': '127.0.0.1', 'PGPORT': '55440', 'PGDATABASE': 'railway',
                  'PGUSER': 'participate_backup', 'PGPASSWORD': 'private-test-password',
                  'PGSSLMODE': 'verify-ca', 'PGSSLROOTCERT': str(self.ca), **overrides}
        self.env.write_text(''.join(key + '=' + value + '\n' for key, value in values.items()))
        self.env.chmod(0o600)
        return database_configuration(self.env, self.ca, self.source)

    def test_absent_configuration_uses_explicit_local_source(self):
        config = database_configuration(self.env, self.ca, self.source)
        self.assertEqual(database_source(config)['databaseSource'], 'vps-local')
        self.assertEqual(database_command('psql', ['-qAt'], stdin=True, configuration=config),
                         ['docker', 'exec', '-i', 'participate-db', 'psql', '-U', 'postgres', '-d', 'participate', '-qAt'])

    def test_cutover_sentinel_prevents_fallback_when_remote_credentials_disappear(self):
        self.source.write_text('railway-remote\n')
        self.source.chmod(0o644)
        config = self.configure()
        self.assertEqual(config['source'], 'railway-remote')
        self.env.unlink()
        with self.assertRaisesRegex(ValueError, 'DATABASE_REMOTE_CONFIGURATION_MISSING'):
            database_configuration(self.env, self.ca, self.source)

    def test_invalid_or_writable_cutover_sentinel_fails_closed(self):
        self.source.write_text('unknown-source\n')
        self.source.chmod(0o644)
        with self.assertRaises(ValueError):
            database_configuration(self.env, self.ca, self.source)
        self.source.write_text('railway-remote\n')
        self.source.chmod(0o666)
        with self.assertRaises(ValueError):
            database_configuration(self.env, self.ca, self.source)

    def test_dangling_source_symlink_does_not_restore_legacy_fallback(self):
        self.source.symlink_to(Path(self.directory.name) / 'missing-target')
        with self.assertRaises(ValueError):
            database_configuration(self.env, self.ca, self.source)

    def test_remote_client_uses_private_relay_and_pinned_ca_without_password_in_argv(self):
        config = self.configure()
        command = database_command('pg_dump', ['-Fc', '--no-owner', '--no-acl'], configuration=config)
        self.assertEqual(database_source(config)['databaseSource'], 'railway-remote')
        self.assertEqual(command[command.index('--network') + 1], 'host')
        self.assertEqual(command[command.index('--env-file') + 1], str(self.env))
        self.assertIn(f'type=bind,src={self.ca},dst={self.ca},readonly', command)
        self.assertNotIn('private-test-password', ' '.join(command))
        self.assertNotIn('participate-db', command)
        self.assertIn('--read-only', command)
        self.assertIn('PGCONNECT_TIMEOUT=10', command)

    def test_remote_archive_validation_does_not_require_old_database(self):
        command = database_command('pg_restore', ['--list'], stdin=True, connect=False,
                                   configuration=self.configure())
        self.assertIn('-i', command)
        self.assertEqual(command[-2:], ['pg_restore', '--list'])
        self.assertNotIn('participate-db', command)

    def test_insecure_or_public_remote_configuration_fails_closed(self):
        for override in [{'PGSSLMODE': 'disable'}, {'PGHOST': 'public.proxy.example'},
                         {'PGPORT': '55439'}, {'PGSSLROOTCERT': '/tmp/unpinned.crt'},
                         {'PGUSER': 'postgres\nPGSSLMODE=disable'}, {'PGDATABASE': ''}]:
            with self.subTest(override=override), self.assertRaises(ValueError):
                self.configure(**override)

    def test_missing_duplicate_or_unexpected_values_fail_closed(self):
        self.configure()
        original = self.env.read_text()
        for text in [original.replace('PGPASSWORD=private-test-password\n', ''),
                     original + 'PGHOST=127.0.0.1\n', original + 'PGOPTIONS=-c allow_system_table_mods=on\n']:
            self.env.write_text(text)
            with self.assertRaises(ValueError):
                database_configuration(self.env, self.ca, self.source)

    def test_readable_password_file_is_rejected(self):
        self.configure()
        self.env.chmod(0o644)
        with self.assertRaises(ValueError):
            database_configuration(self.env, self.ca, self.source)

    def test_missing_or_writable_ca_is_rejected(self):
        self.configure()
        self.ca.chmod(0o666)
        with self.assertRaises(ValueError):
            database_configuration(self.env, self.ca, self.source)
        self.ca.unlink()
        with self.assertRaises(ValueError):
            database_configuration(self.env, self.ca, self.source)

    def test_source_identity_tracks_database_and_ca_but_not_password(self):
        original = database_source(self.configure())
        self.assertEqual(original, database_source(self.configure(PGPASSWORD='rotated-password')))
        self.assertNotEqual(original, database_source(self.configure(PGDATABASE='different_database')))
        self.configure()
        self.ca.write_text('-----BEGIN CERTIFICATE-----\nreplacement-ca\n-----END CERTIFICATE-----\n')
        self.assertNotEqual(original, database_source(database_configuration(self.env, self.ca, self.source)))


if __name__ == '__main__':
    unittest.main()
