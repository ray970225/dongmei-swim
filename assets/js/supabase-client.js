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

// Anonymous read of a public table without downloading supabase-js (used by the homepage).
// `query` is a PostgREST query string such as `select=id,title&order=date.desc`.
export async function publicSelect(table, query) {
  if (!isSupabaseConfigured()) throw new Error('網站資料服務尚未設定');
  const path = `/rest/v1/${table}?${query}`;
  const response = config.proxyUrl
    ? await fetch(`${config.proxyUrl}?path=${encodeURIComponent(path)}`)
    : await fetch(`${config.url.replace(/\/$/, '')}${path}`, { headers: { apikey: config.publishableKey } });
  if (!response.ok) throw new Error(`${table} HTTP ${response.status}`);
  return response.json();
}

export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  // Bundled from npm (pinned in package-lock) instead of a runtime CDN import.
  const { createClient } = await import('@supabase/supabase-js');
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
    const controller = new AbortController();
    const abortRequest = () => controller.abort(request.signal.reason);
    if (request.signal.aborted) abortRequest();
    else request.signal.addEventListener('abort', abortRequest, { once: true });
    const timeout = setTimeout(() => controller.abort(new DOMException('Supabase request timed out.', 'TimeoutError')), 20000);
    try {
      return await fetch(endpoint, { method, headers, body, signal: controller.signal, redirect: 'manual' });
    } catch (error) {
      console.error('TMSC Supabase proxy request failed:', method, error instanceof Error ? error.name : 'UnknownError');
      throw error;
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', abortRequest);
    }
  } : undefined;
  return createClient(config.url, config.proxyUrl ? 'proxy-client' : config.publishableKey, {
    global: proxyFetch ? { fetch: proxyFetch } : undefined,
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}
