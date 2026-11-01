// OpenZcash distribution: install the complete schema into an empty database.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const name of ['.env.local', '.env']) {
  try { process.loadEnvFile(name); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.pathname.slice(1)) {
  throw new Error('DATABASE_URL must select a PostgreSQL database');
}
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password) };
if (url.searchParams.has('sslmode')) env.PGSSLMODE = url.searchParams.get('sslmode');
const psql = (args, options = {}) => execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', ...args],
  { env, encoding: 'utf8', ...options });
const tables = psql(['-At', '-c', "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"]).trim();
if (tables !== '0') throw new Error('Database is not empty. Use reviewed upgrades for an existing installation.');
psql(['--single-transaction', '-f', fileURLToPath(new URL('../prisma/baseline.sql', import.meta.url))], { stdio: 'inherit' });
console.log('Complete Participate schema installed. No accounts or records were imported.');
