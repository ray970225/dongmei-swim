import assert from 'node:assert/strict';
import { createProxyHandler, proxyPolicy } from '../supabase/functions/_shared/proxy-core.js';

const captured = [];
const handler = createProxyHandler({
  projectUrl: 'https://example-project.supabase.co',
  apiKey: 'server-only-test-key',
  fetcher: async (url, init) => {
    captured.push({ url: String(url), init });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  }
});

const options = await handler(new Request('https://example-project.supabase.co/functions/v1/tmsc-api', {
  method: 'OPTIONS', headers: { origin: 'http://localhost:8000' }
}));
assert.equal(options.status, 204);
assert.equal(options.headers.get('access-control-allow-origin'), 'http://localhost:8000');

const blockedOrigin = await handler(new Request('https://example-project.supabase.co/functions/v1/tmsc-api?path=%2Frest%2Fv1%2Fresults', {
  headers: { origin: 'https://unexpected.example' }
}));
assert.equal(blockedOrigin.status, 403);

for (const path of [
  '', 'https://attacker.example/', '//attacker.example/rest/v1/results',
  '/rest/v1/../../auth/v1/admin/users', '/auth/v1/admin/users',
  '/auth/v1/signup',
  '/functions/v1/tmsc-api', '/realtime/v1/websocket'
]) assert.equal(proxyPolicy.validTarget(path), false, `must block ${path}`);
assert.equal(proxyPolicy.validTarget('/rest/v1/%2e%2e/auth/v1/admin/users'), false, 'must block encoded traversal');
assert.equal(proxyPolicy.validTarget('/rest/v1/results%5C..%5Cauth/v1/admin/users'), false, 'must block encoded backslashes');
assert.equal(proxyPolicy.validTarget('/rest/v1/results?select=id'), true);
assert.equal(proxyPolicy.validTarget('/auth/v1/token?grant_type=password'), true);
assert.equal(proxyPolicy.validTarget('/storage/v1/object/sign/education/file.pdf'), true);
assert.equal(proxyPolicy.validTarget('/storage/v1/object/upload/sign/education/file.pdf?token=one-time'), true);
assert.equal(proxyPolicy.validTarget('/functions/v1/manage-member'), true);

const response = await handler(new Request('https://example-project.supabase.co/functions/v1/tmsc-api?path=%2Frest%2Fv1%2Fresults%3Fselect%3Did', {
  headers: {
    origin: 'https://ray970225.github.io',
    apikey: 'browser-must-not-control-key',
    authorization: 'Bearer user-session-token',
    'content-type': 'application/json'
  }
}));
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true });
assert.equal(captured.length, 1);
assert.equal(captured[0].url, 'https://example-project.supabase.co/rest/v1/results?select=id');
assert.equal(captured[0].init.headers.get('apikey'), 'server-only-test-key');
assert.equal(captured[0].init.headers.get('authorization'), 'Bearer user-session-token');
assert.equal(captured[0].init.headers.get('origin'), null);
console.log('Supabase proxy tests passed.');
