import { corsHeaders, json, requireAdmin } from '../_shared/admin.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { serviceClient } = await requireAdmin(request);
    const body = await request.json();
    if (body.action === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      const displayName = String(body.displayName || '').trim().slice(0, 80);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: '請輸入有效的電子郵件地址。' }, 400);
      const redirectTo = Deno.env.get('PUBLIC_SITE_URL') || 'https://ray970225.github.io/dongmei-swim/education.html';
      const { error: allowError } = await serviceClient.from('member_invites').upsert({ email, display_name: displayName }, { onConflict: 'email' });
      if (allowError) return json({ error: '會員邀請資料建立失敗。' }, 500);
      const { error } = await serviceClient.auth.admin.inviteUserByEmail(email, { data: { display_name: displayName }, redirectTo });
      if (error) {
        await serviceClient.from('member_invites').delete().eq('email', email);
        return json({ error: '邀請未送出，請確認信件服務設定或會員狀態。' }, 400);
      }
      return json({ ok: true });
    }
    if (body.action === 'set_active') {
      const profileId = String(body.profileId || '');
      const active = Boolean(body.active);
      if (!/^[0-9a-f-]{36}$/i.test(profileId)) return json({ error: '會員資料無效。' }, 400);
      const { data: target, error: lookupError } = await serviceClient.from('profiles')
        .select('role').eq('id', profileId).maybeSingle();
      if (lookupError || !target || target.role !== 'member') return json({ error: '只能停用或啟用一般會員帳號。' }, 404);
      const { error } = await serviceClient.from('profiles').update({ active }).eq('id', profileId);
      if (error) return json({ error: '會員狀態更新失敗。' }, 500);
      return json({ ok: true });
    }
    return json({ error: '不支援的會員操作。' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json({ error: message.includes('Administrator') ? '此操作僅限管理員。' : '請先以管理員帳號登入。' }, 401);
  }
});
