import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const PRODUCTION_ORIGIN = 'https://openzcash.org';

// Production serves openzcash.org only. The committee demo opts in with
// PARTICIPATE_DEMO_ENVIRONMENT=true and must then use its own openzcash.org
// subdomain, the private Railway database mode and a participate_demo database.
export function originAllowed(env, url) {
  if (env.PARTICIPATE_DEMO_ENVIRONMENT !== 'true') return env.APP_BASE_URL === PRODUCTION_ORIGIN && env.PARTICIPATE_PARENT_ORIGIN === PRODUCTION_ORIGIN;
  const origin = env.APP_BASE_URL ?? '';
  return /^https:\/\/[a-z0-9-]{1,40}\.openzcash\.org$/.test(origin) && origin !== 'https://www.openzcash.org'
    && env.PARTICIPATE_PARENT_ORIGIN === origin && (env.PASSKEY_ORIGIN ?? origin) === origin
    && env.PARTICIPATE_DB_MODE === 'railway-private' && /^\/participate_demo(_[a-z0-9]{1,40})?$/.test(url.pathname);
}

export function configuration(env) {
  const mode = env.PARTICIPATE_DB_MODE ?? 'ssh-tunnel';
  const url = new URL(env.DATABASE_URL ?? 'invalid:');
  if (Buffer.byteLength(env.ZCAP_SESSION_SECRET ?? '', 'utf8') < 32
      || Buffer.byteLength(env.EMAIL_AUTH_SECRET ?? '', 'utf8') < 32
      || env.ZCAP_SESSION_SECRET === env.EMAIL_AUTH_SECRET
      || !originAllowed(env, url)) {
    throw new Error('INVALID_RUNTIME_CONFIGURATION');
  }
  if (mode === 'railway-private') {
    // Private Railway service DNS only. Do not let connection parameters replace
    // the destination with a public host or a filesystem socket.
    const parameters = {
      schema: /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/,
      sslmode: /^(disable|prefer|require)$/,
      connection_limit: /^[1-9][0-9]{0,3}$/,
      pool_timeout: /^[0-9]{1,5}$/,
      connect_timeout: /^[0-9]{1,5}$/,
      socket_timeout: /^[0-9]{1,5}$/,
      statement_cache_size: /^[0-9]{1,6}$/,
    };
    const seen = new Set();
    const validParameters = [...url.searchParams].every(([name, value]) => {
      if (seen.has(name) || !Object.hasOwn(parameters, name) || !parameters[name].test(value)) return false;
      seen.add(name); return true;
    });
    if (!['postgresql:', 'postgres:'].includes(url.protocol)
        || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.railway\.internal$/.test(url.hostname)
        || (url.port && url.port !== '5432') || !/^\/[a-zA-Z0-9_][a-zA-Z0-9_-]{0,62}$/.test(url.pathname)
        || !url.username || !url.password || url.hash || !validParameters) {
      throw new Error('INVALID_RUNTIME_CONFIGURATION');
    }
    return { mode };
  }
  if (mode !== 'ssh-tunnel') throw new Error('INVALID_RUNTIME_CONFIGURATION');
  const host = env.PARTICIPATE_DB_SSH_HOST ?? '';
  const hostKey = env.PARTICIPATE_DB_SSH_HOST_KEY ?? '';
  const key = (env.PARTICIPATE_DB_SSH_KEY ?? '').trim();
  if (!/^[a-z0-9][a-z0-9.-]+$/i.test(host) || !/^ssh-ed25519 [A-Za-z0-9+/=]+$/.test(hostKey)
      || !key.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----') || !key.endsWith('-----END OPENSSH PRIVATE KEY-----')
      || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/participate') {
    throw new Error('INVALID_RUNTIME_CONFIGURATION');
  }
  return { mode, host, hostKey, key };
}

export function tunnelArguments(config, directory) {
  return ['-N', '-F', '/dev/null', '-i', join(directory, 'identity'),
    '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${join(directory, 'known_hosts')}`, '-o', 'HostKeyAlias=participate-db-vps',
    '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
    '-L', '127.0.0.1:55439:127.0.0.1:55439', `participate-web-db@${config.host}`];
}

export function applicationEnvironment(env) {
  // The web application has no reason to read the tunnel identity or topology.
  return Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('PARTICIPATE_DB_SSH_')));
}

function canConnect() {
  return new Promise(resolveConnection => {
    const socket = createConnection({ host: '127.0.0.1', port: 55439 });
    const finish = result => { socket.destroy(); resolveConnection(result); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

export async function run() {
  const log = (event, detail = {}) => console.log(JSON.stringify({ service: 'participate-web', event, ...detail }));
  let directory, tunnel, app, stopping = false;
  let finish;
  const completion = new Promise(resolveCompletion => { finish = resolveCompletion; });
  const shutdown = (code, event) => {
    if (stopping) return;
    stopping = true;
    log(event);
    app?.kill('SIGTERM'); tunnel?.kill('SIGTERM');
    // Await the children so the app cannot outlive the database connection.
    const children = [app, tunnel].filter(Boolean);
    const closed = Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve() : new Promise(resolveExit => child.once('close', resolveExit))));
    Promise.race([closed, delay(5000)]).then(async () => {
      for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      if (directory) await rm(directory, { recursive: true, force: true });
      finish(code);
    });
  };
  process.once('SIGTERM', () => shutdown(0, 'stopping'));
  process.once('SIGINT', () => shutdown(0, 'stopping'));
  try {
    const config = configuration(process.env);
    if (config.mode === 'ssh-tunnel') {
      if (await canConnect()) throw new Error('DATABASE_PORT_ALREADY_IN_USE');
      directory = await mkdtemp(join(tmpdir(), 'participate-db-'));
      await writeFile(join(directory, 'identity'), config.key + '\n', { mode: 0o600 });
      await writeFile(join(directory, 'known_hosts'), `participate-db-vps ${config.hostKey}\n`, { mode: 0o600 });
      tunnel = spawn('ssh', tunnelArguments(config, directory), { stdio: ['ignore', 'ignore', 'ignore'] });
      tunnel.once('error', () => shutdown(1, 'database_tunnel_failed'));
      tunnel.once('exit', () => shutdown(1, 'database_tunnel_closed'));
      let connected = false;
      for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
        if (await canConnect()) { connected = true; break; }
        await delay(250);
      }
      if (!stopping && !connected) shutdown(1, 'database_tunnel_timeout');
      if (!stopping) log('database_tunnel_ready');
    } else {
      // Readiness still requires the deployment's /api/health database check.
      log('database_connection_configured', { mode: config.mode });
    }
    if (!stopping) {
      app = spawn(process.execPath, [resolve('server.js')], { env: applicationEnvironment(process.env), stdio: 'inherit' });
      app.once('error', () => shutdown(1, 'application_start_failed'));
      app.once('exit', code => shutdown(code === 0 ? 0 : 1, 'application_stopped'));
    }
  } catch { shutdown(1, 'runtime_configuration_failed'); }
  return completion;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await run();
