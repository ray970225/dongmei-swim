import { createProxyHandler } from '../_shared/proxy-core.js';

function getPublishableKey() {
  const keyMap = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (keyMap) {
    try {
      const parsed = JSON.parse(keyMap);
      if (typeof parsed.default === 'string' && parsed.default) return parsed.default;
    } catch {
      // Fall back to the project's legacy anon key when available.
    }
  }
  return Deno.env.get('SUPABASE_ANON_KEY') || '';
}

const handler = createProxyHandler({
  projectUrl: Deno.env.get('SUPABASE_URL') || '',
  apiKey: getPublishableKey()
});

Deno.serve(handler);
