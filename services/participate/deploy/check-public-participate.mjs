/** Anonymous, non-mutating production acceptance. Sends no email or credits. */
import assert from 'node:assert/strict';
const origin = 'https://openzcash.org';
const results = [];
async function check(name, path, options = {}, inspect = () => {}) {
  const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(30000), ...options });
  const text = await response.text();
  await inspect(response, text);
  results.push({ name, status: response.status });
}
await check('portal', '/zcg/participate', {}, (r, text) => {
  assert.equal(r.status, 200); assert.match(text, /src="\/participate(?:"|\?)/);
  assert.doesNotMatch(text, /railway\.internal|192\.0\.2\.1|198\.51\.100\.1|localhost:4411/);
});
await check('workspace', '/participate?embed=1', {}, (r, text) => {
  assert.equal(r.status, 200); assert.match(text, /Under review/); assert.match(text, /Sign in/);
  assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'self'/);
  assert.match(r.headers.get('cache-control') ?? '', /no-store/);
});
await check('email configuration', '/api/auth/email/options', {}, (r, text) => {
  assert.equal(r.status, 200); assert.deepEqual(JSON.parse(text), { emailAvailable: true, demoAvailable: false });
  assert.match(r.headers.get('cache-control') ?? '', /no-store/);
});
await check('account requires authentication', '/api/account/settings', {}, r => assert.equal(r.status, 401));
await check('public committee restricted', '/api/participate/committee', {}, (r, text) => {
  assert.equal(r.status, 200); assert.match(text, /RESTRICTED/);
});
await check('history retained', '/zcg/decisions', {}, r => {
  assert.equal(r.status, 308); assert.match(r.headers.get('location') ?? '', /\/zcg\/participate\?view=history$/);
});
const post = originValue => ({ method: 'POST', headers: { origin: originValue, 'content-type': 'application/json' }, body: '{}' });
await check('empty email validated without sending', '/api/auth/email/request', post(origin), r => assert.equal(r.status, 400));
await check('foreign origin rejected', '/api/auth/email/request', {
  ...post('https://example.invalid'), headers: { ...post('https://example.invalid').headers, 'x-forwarded-host': 'openzcash.org', 'x-forwarded-proto': 'https' },
}, r => assert.equal(r.status, 403));
await check('legacy shared demo unavailable', '/api/auth/demo', post(origin), r => assert.equal(r.status, 404));
await check('logout returns to public origin', '/api/auth/logout', {
  method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'next=%2Fparticipate%3Fembed%3D1',
}, r => { assert.equal(r.status, 303); assert.equal(new URL(r.headers.get('location')).origin, origin); });
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), passed: results }, null, 2));
