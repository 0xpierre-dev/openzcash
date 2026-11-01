"""Private PostgreSQL client selection shared by the VPS backup and monitor.

The remote source is a loopback-only SSH relay to Railway. An invalid remote
configuration never falls back to the retained, inactive VPS database.
"""
import hashlib
from pathlib import Path
import re
import stat

REMOTE_ENV = Path('/etc/participate/database-remote.env')
REMOTE_CA = Path('/etc/participate/railway-db-ca.crt')
SOURCE_PATH = Path('/etc/participate/database-source')
CLIENT_IMAGE = 'postgres@sha256:20edbde7749f822887a1a022ad526fde0a47d6b2be9a8364433605cf65099416'
ENV_KEYS = {'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGSSLROOTCERT'}


def database_configuration(env_path=REMOTE_ENV, ca_path=REMOTE_CA, source_path=SOURCE_PATH):
    env_path, ca_path, source_path = Path(env_path), Path(ca_path), Path(source_path)
    if source_path.is_symlink() or env_path.is_symlink():
        raise ValueError('DATABASE_SOURCE_CONFIGURATION_INVALID')
    remote_required = source_path.exists()
    if remote_required and (not source_path.is_file() or source_path.stat().st_mode & 0o022
                            or source_path.read_text().strip() != 'railway-remote'):
        raise ValueError('DATABASE_SOURCE_CONFIGURATION_INVALID')
    if not env_path.exists():
        if remote_required:
            raise ValueError('DATABASE_REMOTE_CONFIGURATION_MISSING')
        return {'source': 'vps-local', 'identity': 'vps-local:participate'}
    mode = env_path.stat().st_mode
    if not stat.S_ISREG(mode) or mode & 0o077:
        raise ValueError('DATABASE_REMOTE_CONFIGURATION_INVALID')
    values = {}
    for line in env_path.read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or key not in ENV_KEYS or key in values or not value or '\x00' in value:
            raise ValueError('DATABASE_REMOTE_CONFIGURATION_INVALID')
        values[key] = value
    if set(values) != ENV_KEYS or values['PGHOST'] != '127.0.0.1' or values['PGPORT'] != '55440' \
            or values['PGSSLMODE'] != 'verify-ca' or values['PGSSLROOTCERT'] != str(ca_path) \
            or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,62}', values['PGDATABASE']) \
            or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,62}', values['PGUSER']):
        raise ValueError('DATABASE_REMOTE_CONFIGURATION_INVALID')
    if not ca_path.is_file() or ca_path.stat().st_mode & 0o022 \
            or '-----BEGIN CERTIFICATE-----' not in ca_path.read_text():
        raise ValueError('DATABASE_REMOTE_CA_INVALID')
    # Password rotation does not invalidate a backup of the same database.
    identity = hashlib.sha256(('railway-private-relay:' + values['PGDATABASE'] + ':' +
                               hashlib.sha256(ca_path.read_bytes()).hexdigest()).encode()).hexdigest()
    return {'source': 'railway-remote', 'identity': identity,
            'env_path': str(env_path), 'ca_path': str(ca_path)}


def database_source(configuration=None):
    config = configuration if configuration is not None else database_configuration()
    return {'databaseSource': config['source'], 'databaseIdentity': config['identity']}


def database_command(tool, arguments, *, stdin=False, connect=True, configuration=None):
    if tool not in {'psql', 'pg_dump', 'pg_restore'}:
        raise ValueError('DATABASE_CLIENT_INVALID')
    config = configuration if configuration is not None else database_configuration()
    if config['source'] == 'vps-local':
        return ['docker', 'exec', *(['-i'] if stdin else []), 'participate-db', tool,
                *(['-U', 'postgres', '-d', 'participate'] if connect else []), *arguments]
    # Credentials are passed by the private env file, never in arguments/logs.
    # Host networking reaches only the loopback listener created by SSH.
    return ['docker', 'run', '--rm', *(['-i'] if stdin else []), '--network', 'host',
            '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
            '--env-file', config['env_path'], '-e', 'PGCONNECT_TIMEOUT=10',
            '--mount', f"type=bind,src={config['ca_path']},dst={config['ca_path']},readonly",
            CLIENT_IMAGE, tool, *arguments]
