import assert from 'node:assert/strict';

globalThis.location = { hostname: 'ray970225.github.io' };
delete globalThis.TMSC_SUPABASE_CONFIG;
const publicDefault = await import('../assets/js/supabase-client.js?public-default-test');
assert.equal(publicDefault.isSupabaseConfigured(), true, 'hosted pages should use the key-free server proxy by default');

globalThis.TMSC_SUPABASE_CONFIG = { url: 'https://example-project.supabase.co', publishableKey: 'must-not-enable-production-client' };
const directConfig = await import('../assets/js/supabase-client.js?direct-production-test');
assert.equal(directConfig.isSupabaseConfigured(), false, 'a direct API key must never enable the hosted browser client');

globalThis.TMSC_SUPABASE_CONFIG = {
  url: 'https://example-project.supabase.co',
  proxyUrl: 'https://example-project.supabase.co/functions/v1/tmsc-api'
};
const proxyConfig = await import('../assets/js/supabase-client.js?proxy-production-test');
assert.equal(proxyConfig.isSupabaseConfigured(), true, 'the server proxy should enable a key-free hosted client');

globalThis.location = { hostname: 'localhost' };
globalThis.TMSC_SUPABASE_CONFIG = { url: 'https://example-project.supabase.co', publishableKey: 'local-preview-only' };
const localConfig = await import('../assets/js/supabase-client.js?local-preview-test');
assert.equal(localConfig.isSupabaseConfigured(), true, 'a local preview may use the ignored local runtime key');
const headers = publicDefault.sanitizeProxyHeaders(new Headers({
  apikey: 'browser-side-placeholder',
  authorization: 'Bearer proxy-client',
  origin: 'https://ray970225.github.io',
  'content-type': 'application/json'
}));
assert.equal(headers.has('apikey'), false, 'browser API keys must not reach the proxy request');
assert.equal(headers.has('authorization'), false, 'the placeholder bearer must not reach Supabase');
assert.equal(headers.has('origin'), false, 'the caller cannot forge an upstream origin header');
assert.equal(headers.get('content-type'), 'application/json');
const memberHeaders = publicDefault.sanitizeProxyHeaders(new Headers({ authorization: 'Bearer real-user-jwt' }));
assert.equal(memberHeaders.get('authorization'), 'Bearer real-user-jwt', 'the real member session must reach RLS');
console.log('Supabase client configuration tests passed.');
