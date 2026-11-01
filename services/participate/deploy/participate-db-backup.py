#!/usr/bin/python3
"""Private daily dump and public-key encrypted copy; retain 14 complete snapshots."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import re
from participate_database import database_command, database_configuration, database_source


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def encrypt_backup(target, recipient, executable='age'):
    # Only a public recipient is accepted on the server. Decryption stays off-server.
    if not re.fullmatch(r'age1[0-9a-z]{58}', recipient):
        raise ValueError('BACKUP_RECIPIENT_INVALID')
    encrypted = target.with_suffix('.dump.age')
    temporary = encrypted.with_suffix('.age.incomplete')
    try:
        with temporary.open('xb') as output:
            os.chmod(temporary, 0o600)
            subprocess.run([executable, '--encrypt', '--recipient', recipient, str(target)],
                           stdout=output, stderr=subprocess.PIPE, check=True, timeout=120)
            output.flush()
            os.fsync(output.fileno())
        if temporary.stat().st_size <= target.stat().st_size:
            raise ValueError('BACKUP_ENCRYPTION_INVALID')
        temporary.replace(encrypted)
        digest = sha256(encrypted)
        encrypted.with_suffix('.age.sha256').write_text(digest + '\n')
        return encrypted, digest
    finally:
        temporary.unlink(missing_ok=True)


def main():
    os.umask(0o077)
    directory = pathlib.Path('/var/backups/participate')
    directory.mkdir(mode=0o700, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target = directory / ('daily-' + stamp + '.dump')
    temporary = target.with_suffix('.incomplete')
    config = json.loads(pathlib.Path('/etc/participate/backup.json').read_text())
    database = database_configuration()
    try:
        with temporary.open('xb') as output:
            subprocess.run(database_command('pg_dump', ['-Fc', '--no-owner', '--no-acl'], configuration=database), stdout=output, stderr=subprocess.PIPE, check=True, timeout=120)
            output.flush()
            os.fsync(output.fileno())
        if temporary.stat().st_size <= 1000:
            raise ValueError('BACKUP_TOO_SMALL')
        with temporary.open('rb') as source:
            subprocess.run(database_command('pg_restore', ['--list'], stdin=True, connect=False, configuration=database), stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, timeout=30)
        temporary.replace(target)
        digest = sha256(target)
        target.with_suffix('.sha256').write_text(digest + '\n')
        encrypted, encrypted_digest = encrypt_backup(target, config['recipient'])
        target.with_suffix('.source.json').write_text(json.dumps(database_source(database)) + '\n')
        # Rotate only after both files succeeded. Preserve migration and recovery copies.
        for old in sorted(directory.glob('daily-*.dump'))[:-14]:
            for path in (old, old.with_suffix('.sha256'), old.with_suffix('.dump.age'), old.with_suffix('.dump.age.sha256'), old.with_suffix('.source.json')):
                path.unlink(missing_ok=True)
        print(json.dumps({'event': 'database_backup_completed', 'file': target.name,
            'sha256': digest, 'encryptedFile': encrypted.name, 'encryptedSha256': encrypted_digest,
            **database_source(database)}))
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'event': 'database_backup_failed', 'code': 'BACKUP_FAILED'}))
        raise SystemExit(1)
