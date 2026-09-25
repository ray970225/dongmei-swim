// Public endpoint addresses are identifiers, not credentials. Local ignored runtime config
// may opt into direct access only for localhost previews.
// Public deployments use an Edge Function proxy; the Supabase API key stays server-side.
// Direct browser access is limited to localhost previews and is never a production fallback.
const projectUrl = 'https://xsmbubwgtkbtsyiskivf.supabase.co';
const config = globalThis.TMSC_SUPABASE_CONFIG ?? {
  url: projectUrl,
  proxyUrl: `${projectUrl}/functions/v1/tmsc-api`
};
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname);

export function isSupabaseConfigured() {
  const validUrl = typeof config.url === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url);
  const hasProxy = typeof config.proxyUrl === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/tmsc-api\/?$/i.test(config.proxyUrl);
  const hasLocalKey = localHost && typeof config.publishableKey === 'string' && config.publishableKey.length > 0;
  return validUrl && (hasProxy || hasLocalKey);
}

export function sanitizeProxyHeaders(input) {
  const headers = new Headers(input);
  headers.delete('apikey');
  headers.delete('origin');
  if (headers.get('authorization') === 'Bearer proxy-client') headers.delete('authorization');
  return headers;
}

export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const proxyFetch = config.proxyUrl ? async (input, init = {}) => {
    const request = new Request(input, init);
    const source = new URL(request.url);
    if (source.origin !== new URL(config.url).origin) throw new Error('Supabase client attempted an unapproved external request.');
    const endpoint = new URL(config.proxyUrl);
    endpoint.searchParams.set('path', `${source.pathname}${source.search}`);
    const headers = sanitizeProxyHeaders(request.headers);
    const method = request.method.toUpperCase();
    const isJson = request.headers.get('content-type')?.toLowerCase().includes('application/json');
    // Supabase Auth sends small JSON payloads. Buffer these before the second fetch so
    // browsers do not have to forward a streaming Request body across origins.
    const body = ['GET', 'HEAD'].includes(method)
      ? undefined
      : isJson ? await request.arrayBuffer() : request.body;
    return fetch(endpoint, { method, headers, body, signal: request.signal, redirect: 'manual' });
  } : undefined;
  return createClient(config.url, config.proxyUrl ? 'proxy-client' : config.publishableKey, {
    global: proxyFetch ? { fetch: proxyFetch } : undefined,
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}
