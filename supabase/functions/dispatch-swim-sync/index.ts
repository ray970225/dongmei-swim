const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store'
};

Deno.serve(request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return new Response(JSON.stringify({ error: '成績同步入口已停用，請依人工流程更新成績資料。' }), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
});
