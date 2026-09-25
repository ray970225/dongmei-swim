import { createClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

export function clients(request: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) throw new Error('Function environment is incomplete');
  const bearer = request.headers.get('Authorization') || '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: bearer } } });
  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userClient, serviceClient, bearer };
}

export async function requireAdmin(request: Request) {
  const { userClient, serviceClient, bearer } = clients(request);
  if (!bearer.startsWith('Bearer ')) throw new Error('Sign in required');
  const accessToken = bearer.slice('Bearer '.length);
  const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !user) throw new Error('Sign in required');
  const { data: profile, error: profileError } = await serviceClient.from('profiles')
    .select('role,active').eq('id', user.id).maybeSingle();
  if (profileError || !profile?.active || profile.role !== 'admin') throw new Error('Administrator access required');
  return { user, userClient, serviceClient };
}
