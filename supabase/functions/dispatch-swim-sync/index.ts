import { corsHeaders, json, requireAdmin } from '../_shared/admin.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { userClient, serviceClient, user } = await requireAdmin(request);
    if (Deno.env.get('SWIM_SOURCE_AUTOMATION_AUTHORIZED') !== 'true') {
      return json({ error: '成績來源尚未授權自動同步，請改用核准的匯入方式。' }, 503);
    }
    const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
    if (!token) return json({ error: '同步服務尚未完成設定。' }, 503);
    const repository = Deno.env.get('GITHUB_REPOSITORY') || 'ray970225/dongmei-swim';
    const { data: jobId, error: jobError } = await userClient.rpc('request_sync_job');
    if (jobError) {
      const message = jobError.message.includes('sync_already_running') ? '同步正在執行中。' :
        jobError.message.includes('sync_cooldown') ? '剛完成一次同步，請稍後再試。' : '無法建立同步工作。';
      return json({ error: message }, 409);
    }
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/sync-swim.yml/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref: 'main', inputs: { job_id: jobId, requested_by: user.id } })
    });
    if (!response.ok) {
      await serviceClient.from('sync_jobs').update({ status: 'failed', finished_at: new Date().toISOString(), error_count: 1,
        summary: { error: `workflow_dispatch failed (${response.status})` } }).eq('id', jobId);
      return json({ error: '無法啟動成績同步，請稍後再試。' }, 502);
    }
    return json({ jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json({ error: message.includes('Administrator') ? '此操作僅限管理員。' : '請先以管理員帳號登入。' }, 401);
  }
});
