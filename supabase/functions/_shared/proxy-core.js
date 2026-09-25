const ALLOWED_ORIGINS = new Set([
  'https://ray970225.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

const FORWARDED_REQUEST_HEADERS = [
  'accept', 'accept-profile', 'cache-control', 'content-disposition', 'content-length',
  'content-profile', 'content-range', 'content-type', 'if-match', 'if-none-match',
  'prefer', 'range', 'x-client-info', 'x-copy-source', 'x-metadata', 'x-upsert'
];

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

function json(body, status, cors = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function isAllowedPath(path) {
  const route = path.split('?', 1)[0];
  if (/^\/(rest|storage)\/v1(?:\/|$)/.test(route)) return true;
  if (/^\/auth\/v1(?:\/|$)/.test(route) &&
      !/^\/auth\/v1\/(?:admin|signup)(?:\/|$)/.test(route)) return true;
  return ['/functions/v1/manage-member', '/functions/v1/dispatch-swim-sync'].includes(route);
}

function validTarget(value) {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return false;
  const path = value.split('?', 1)[0];
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { return false; }
  if (decoded.includes('\\') || decoded.split('/').some(part => part === '.' || part === '..')) return false;
  return isAllowedPath(value);
}

function addCors(headers, origin) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
  }
  headers.set('access-control-allow-methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('access-control-allow-headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, accept-profile, content-profile, prefer, range, content-range, x-upsert, x-metadata, x-copy-source, content-disposition, cache-control');
  headers.set('access-control-expose-headers', 'content-range, content-location, etag, x-request-id');
  headers.append('vary', 'Origin');
  return headers;
}

export function createProxyHandler({ projectUrl, apiKey, fetcher = fetch }) {
  if (!projectUrl || !apiKey) throw new Error('Proxy server configuration is incomplete.');
  const baseUrl = new URL(projectUrl);
  if (baseUrl.protocol !== 'https:' || !baseUrl.hostname.endsWith('.supabase.co')) throw new Error('Invalid Supabase project URL.');

  return async request => {
    const origin = request.headers.get('origin') || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: '來源網站未獲允許。' }, 403);
    const cors = addCors(new Headers({ 'cache-control': 'no-store' }), origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!METHODS.has(request.method)) return json({ error: '不支援的請求方式。' }, 405, cors);

    const target = new URL(request.url).searchParams.get('path') || '';
    if (!validTarget(target)) return json({ error: '請求路徑不在允許範圍。' }, 400, cors);

    const upstream = new URL(target, `${baseUrl.origin}/`);
    if (upstream.origin !== baseUrl.origin) return json({ error: '無效的服務路徑。' }, 400, cors);
    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    headers.set('apikey', apiKey);
    const authorization = request.headers.get('authorization');
    if (authorization) headers.set('authorization', authorization);

    try {
      const response = await fetcher(upstream, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual'
      });
      const responseHeaders = new Headers(response.headers);
      for (const name of ['connection', 'content-length', 'keep-alive', 'transfer-encoding', 'set-cookie']) responseHeaders.delete(name);
      addCors(responseHeaders, origin);
      responseHeaders.set('cache-control', 'no-store');
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    } catch {
      return json({ error: '資料服務目前無法連線，請稍後再試。' }, 502, cors);
    }
  };
}

export const proxyPolicy = Object.freeze({
  allowedOrigins: [...ALLOWED_ORIGINS],
  isAllowedPath,
  validTarget
});
