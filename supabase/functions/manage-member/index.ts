import { corsHeaders, json, requireAdmin, requireAuthenticatedUser } from '../_shared/admin.ts';
import { createMemberAccount } from '../_shared/create-member-core.js';
import { deleteMemberAccount } from '../_shared/manage-member-core.js';

async function recordMemberOperation(serviceClient, user, audit) {
  let error;
  try {
    ({ error } = await serviceClient.from('admin_audit_logs').insert({
      actor_id: user.id,
      actor_email: user.email || '管理員',
      action: audit.action,
      entity_type: 'member',
      entity_id: audit.entityId,
      entity_label: audit.entityLabel
    }));
  } catch (cause) {
    console.error('Admin operation audit write failed:', cause instanceof Error ? cause.message : 'Unknown error');
    return false;
  }
  if (error) {
    console.error('Admin operation audit write failed:', error.message);
    return false;
  }
  return true;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await request.json();
    if (body.action === 'complete_password_setup') {
      const { user, serviceClient } = await requireAuthenticatedUser(request);
      const password = String(body.password || '');
      if (password.length < 10) return json({ error: '新密碼至少需要 10 個字元。' }, 400);
      const { data: profile, error: profileError } = await serviceClient.from('profiles')
        .select('role,active,must_change_password').eq('id', user.id).maybeSingle();
      if (profileError || profile?.role !== 'member' || !profile.active || !profile.must_change_password) {
        return json({ error: '此帳號目前不需要初次密碼設定，請重新登入。' }, 403);
      }
      const { error: passwordError } = await serviceClient.auth.admin.updateUserById(user.id, { password });
      if (passwordError) return json({ error: '密碼更新失敗，請確認密碼規則後重試。' }, 400);
      const { data: updatedProfile, error: updateError } = await serviceClient.from('profiles')
        .update({ must_change_password: false }).eq('id', user.id).eq('must_change_password', true)
        .select('id').maybeSingle();
      if (updateError || !updatedProfile) return json({ error: '密碼已更新，但帳號權限尚未完成。請重新整理後重試。' }, 500);
      return json({ ok: true });
    }

    const { user, serviceClient } = await requireAdmin(request);
    if (body.action === 'create_member') {
      const result = await createMemberAccount(serviceClient, {
        email: body.email,
        displayName: body.displayName,
        initialPassword: Deno.env.get('MEMBER_INITIAL_PASSWORD')
      });
      if (result.logMessage) console.error('Member account creation notice:', result.logMessage);
      const auditRecorded = result.status !== 200 || !result.audit
        ? true
        : await recordMemberOperation(serviceClient, user, result.audit);
      return json(auditRecorded ? result.body : { ...result.body, auditWarning: true }, result.status);
    }
    if (body.action === 'delete_member') {
      const result = await deleteMemberAccount(serviceClient, String(body.profileId || ''));
      if (result.logMessage) console.error('Member account deletion notice:', result.logMessage);
      const auditRecorded = result.status !== 200 || !result.audit
        ? true
        : await recordMemberOperation(serviceClient, user, result.audit);
      return json(auditRecorded ? result.body : { ...result.body, auditWarning: true }, result.status);
    }
    return json({ error: '不支援的會員操作。' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return json({ error: message.includes('Administrator') ? '此操作僅限管理員。' : '請先以管理員帳號登入。' }, 401);
  }
});
