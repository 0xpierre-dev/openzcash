import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[2] / 'deploy/participate-db-backup.py'
sys.path.insert(0, str(MODULE.parent))
spec = importlib.util.spec_from_file_location('participate_backup', MODULE)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


@unittest.skipUnless(shutil.which('age') and shutil.which('age-keygen'), 'age is required')
class EncryptedBackupTest(unittest.TestCase):
    def test_decryption_roundtrip_and_tamper_rejection(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            key = directory / 'identity.txt'
            subprocess.run(['age-keygen', '-o', str(key)], check=True, capture_output=True)
            recipient = subprocess.check_output(['age-keygen', '-y', str(key)], text=True).strip()
            source = directory / 'daily-fixture.dump'
            source.write_bytes(b'PGDMP private database fixture\n' * 500)
            encrypted, digest = backup.encrypt_backup(source, recipient)
            plaintext = subprocess.check_output(['age', '--decrypt', '-i', str(key), str(encrypted)], stderr=subprocess.PIPE)
            self.assertEqual(plaintext, source.read_bytes())
            self.assertEqual(digest, backup.sha256(encrypted))
            self.assertEqual(encrypted.stat().st_mode & 0o777, 0o600)
            self.assertNotIn(b'private database fixture', encrypted.read_bytes())
            content = bytearray(encrypted.read_bytes())
            content[-1] ^= 1
            encrypted.write_bytes(content)
            result = subprocess.run(['age', '--decrypt', '-i', str(key), str(encrypted)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)

    def test_secret_key_is_never_accepted_as_encryption_recipient(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'daily-fixture.dump'
            source.write_bytes(b'private data')
            with self.assertRaises(ValueError):
                backup.encrypt_backup(source, 'AGE-SECRET-KEY-1INVALID')
            self.assertEqual(list(Path(folder).iterdir()), [source])


if __name__ == '__main__':
    unittest.main()
