import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { applicationEnvironment, configuration } from './participate-web-runtime.mjs';

const env = { APP_BASE_URL: 'https://openzcash.org', PARTICIPATE_PARENT_ORIGIN: 'https://openzcash.org',
  ZCAP_SESSION_SECRET: 'session-secret-longer-than-32-bytes-for-tests', EMAIL_AUTH_SECRET: 'email-secret-longer-than-32-bytes-for-tests',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:55439/participate',
  PARTICIPATE_DB_SSH_HOST: 'database.example', PARTICIPATE_DB_SSH_HOST_KEY: 'ssh-ed25519 AAAA',
  PARTICIPATE_DB_SSH_KEY: '-----BEGIN OPENSSH PRIVATE KEY-----\nfixture\n-----END OPENSSH PRIVATE KEY-----' };
const railwayEnv = { ...env, PARTICIPATE_DB_MODE: 'railway-private',
  DATABASE_URL: 'postgresql://app:private-password@participate-db.railway.internal:5432/railway?connection_limit=10&connect_timeout=10',
  PARTICIPATE_DB_SSH_HOST: '', PARTICIPATE_DB_SSH_HOST_KEY: '', PARTICIPATE_DB_SSH_KEY: '' };

test('rejects public databases, missing identities and incorrect login origins', () => {
  assert.equal(configuration(env).host, 'database.example');
  assert.equal(configuration(env).mode, 'ssh-tunnel');
  for (const override of [{ DATABASE_URL: 'postgresql://test:test@database.example:5432/participate' },
    { PARTICIPATE_DB_SSH_KEY: '' }, { PARTICIPATE_DB_SSH_HOST_KEY: '' },
    { APP_BASE_URL: 'https://participate.example' }, { PARTICIPATE_DB_SSH_HOST: '-oProxyCommand=bad' },
    { ZCAP_SESSION_SECRET: 'weak' }, { EMAIL_AUTH_SECRET: 'weak' }, { EMAIL_AUTH_SECRET: env.ZCAP_SESSION_SECRET }]) {
    assert.throws(() => configuration({ ...env, ...override }));
  }
  assert.equal(applicationEnvironment(env).PARTICIPATE_DB_SSH_KEY, undefined);
  assert.equal(applicationEnvironment(env).DATABASE_URL, env.DATABASE_URL);
});

test('private Railway mode needs explicit selection and preserves authentication configuration checks', () => {
  assert.deepEqual(configuration(railwayEnv), { mode: 'railway-private' });
  assert.deepEqual(configuration({ ...railwayEnv, DATABASE_URL: 'postgres://app:private-password@postgres.railway.internal/participate?sslmode=require&schema=public' }), { mode: 'railway-private' });
  for (const override of [
    { PARTICIPATE_DB_MODE: undefined }, { PARTICIPATE_DB_MODE: 'direct' },
    { APP_BASE_URL: 'https://example.org' }, { PARTICIPATE_PARENT_ORIGIN: 'https://example.org' },
    { ZCAP_SESSION_SECRET: 'weak' }, { EMAIL_AUTH_SECRET: 'weak' }, { EMAIL_AUTH_SECRET: env.ZCAP_SESSION_SECRET },
  ]) assert.throws(() => configuration({ ...railwayEnv, ...override }));
});

test('the committee demo needs its own subdomain, private Railway mode and a participate_demo database', () => {
  const demoEnv = { ...railwayEnv, PARTICIPATE_DEMO_ENVIRONMENT: 'true', APP_BASE_URL: 'https://demo.openzcash.org', PARTICIPATE_PARENT_ORIGIN: 'https://demo.openzcash.org',
    DATABASE_URL: 'postgresql://app:private-password@participate-demo-db.railway.internal:5432/participate_demo' };
  assert.deepEqual(configuration(demoEnv), { mode: 'railway-private' });
  for (const override of [
    { APP_BASE_URL: 'https://openzcash.org', PARTICIPATE_PARENT_ORIGIN: 'https://openzcash.org' },
    { APP_BASE_URL: 'https://www.openzcash.org', PARTICIPATE_PARENT_ORIGIN: 'https://www.openzcash.org' },
    { APP_BASE_URL: 'https://demo.example.org', PARTICIPATE_PARENT_ORIGIN: 'https://demo.example.org' },
    { APP_BASE_URL: 'http://demo.openzcash.org', PARTICIPATE_PARENT_ORIGIN: 'http://demo.openzcash.org' },
    { PARTICIPATE_PARENT_ORIGIN: 'https://openzcash.org' }, { PASSKEY_ORIGIN: 'https://openzcash.org' },
    { DATABASE_URL: 'postgresql://app:private-password@participate-db.railway.internal:5432/participate' },
    { DATABASE_URL: 'postgresql://app:private-password@participate-db.railway.internal:5432/railway' },
  ]) assert.throws(() => configuration({ ...demoEnv, ...override }));
  // Without the demo flag a subdomain is refused, and the demo flag cannot use the SSH tunnel.
  assert.throws(() => configuration({ ...demoEnv, PARTICIPATE_DEMO_ENVIRONMENT: undefined }));
  assert.throws(() => configuration({ ...env, PARTICIPATE_DEMO_ENVIRONMENT: 'true', APP_BASE_URL: 'https://demo.openzcash.org', PARTICIPATE_PARENT_ORIGIN: 'https://demo.openzcash.org' }));
});

test('private Railway mode rejects public destinations, invalid credentials and destination override parameters', () => {
  for (const DATABASE_URL of [
    'postgresql://app:password@db.example.org:5432/railway',
    'postgresql://app:password@db.railway.internal.example.org:5432/railway',
    'postgresql://app:password@railway.internal:5432/railway',
    'postgresql://app:password@127.0.0.1:5432/railway',
    'postgresql://app:password@[::1]:5432/railway',
    'postgresql://app:password@db.railway.internal:1234/railway',
    'postgresql://app@db.railway.internal:5432/railway',
    'postgresql://db.railway.internal:5432/railway',
    'postgresql://app:password@db.railway.internal:5432/',
    'postgresql://app:password@db.railway.internal:5432/railway/extra',
    'postgresql://app:password@db.railway.internal:5432/railway?host=db.example.org',
    'postgresql://app:password@db.railway.internal:5432/railway?options=-c%20host%3Ddb.example.org',
    'postgresql://app:password@db.railway.internal:5432/railway?schema=public&schema=private',
    'postgresql://app:password@db.railway.internal:5432/railway?connection_limit=-1',
    'postgresql://app:password@db.railway.internal:5432/railway#fragment',
    'https://app:password@db.railway.internal:5432/railway',
  ]) assert.throws(() => configuration({ ...railwayEnv, DATABASE_URL }));
});

test('private Railway mode starts the app without SSH or temporary credentials and supervises its exit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'participate-direct-runtime-test-'));
  try {
    await writeFile(join(directory, 'ssh'), '#!/bin/sh\ntouch ssh-started\nexit 255\n', { mode: 0o700 });
    await writeFile(join(directory, 'server.js'), 'const fs = require("node:fs"); fs.writeFileSync("started", JSON.stringify({ databasePresent: Boolean(process.env.DATABASE_URL), hasSshVariables: Object.keys(process.env).some(name => name.startsWith("PARTICIPATE_DB_SSH_")) })); process.exitCode = 0;');
    const child = spawn(process.execPath, [resolve('deploy/participate-web-runtime.mjs')], {
      cwd: directory, env: { ...process.env, ...railwayEnv, TMPDIR: directory, PATH: `${directory}:${process.env.PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await Promise.race([once(child, 'close'), delay(12000, undefined, { ref: false }).then(() => { child.kill('SIGKILL'); throw new Error('Direct supervisor did not stop'); })]);
    assert.equal(code, 0);
    assert.match(output, /database_connection_configured/);
    assert.match(output, /application_stopped/);
    assert.doesNotMatch(output, /private-password|PRIVATE KEY|participate-db\.railway\.internal/);
    const files = await readdir(directory);
    assert.ok(files.includes('started'));
    assert.ok(!files.includes('ssh-started'));
    assert.ok(!files.some(name => name.startsWith('participate-db-')));
    const { readFile } = await import('node:fs/promises');
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'started'), 'utf8')), { databasePresent: true, hasSshVariables: false });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('failed tunnel starts no web application, logs no secrets and removes its temporary identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'participate-runtime-test-'));
  try {
    await writeFile(join(directory, 'ssh'), '#!/bin/sh\nexit 255\n', { mode: 0o700 });
    await writeFile(join(directory, 'server.js'), 'require("node:fs").writeFileSync("started", "unexpected");');
    const child = spawn(process.execPath, [resolve('deploy/participate-web-runtime.mjs')], {
      cwd: directory, env: { ...process.env, ...env, TMPDIR: directory, PATH: `${directory}:${process.env.PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await Promise.race([once(child, 'close'), delay(12000).then(() => { child.kill('SIGKILL'); throw new Error('Supervisor did not stop'); })]);
    assert.equal(code, 1);
    assert.match(output, /database_tunnel_closed|runtime_configuration_failed/);
    assert.doesNotMatch(output, /fixture|PRIVATE KEY|test:test/);
    const files = await readdir(directory);
    assert.ok(!files.includes('started'));
    assert.ok(!files.some(name => name.startsWith('participate-db-')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
