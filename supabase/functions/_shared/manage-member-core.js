export async function deleteMemberAccount(serviceClient, profileId) {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) {
    return { status: 400, body: { error: '會員資料無效。' } };
  }

  const { data: target, error: lookupError } = await serviceClient.from('profiles')
    .select('id,email,display_name,role').eq('id', profileId).maybeSingle();
  if (lookupError || !target || target.role !== 'member') {
    return { status: 404, body: { error: '只能刪除一般會員帳號。' } };
  }

  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(profileId);
  if (deleteError) {
    return {
      status: 500,
      body: { error: '帳號刪除失敗，請確認該帳號沒有擁有中的檔案後再重試。' },
      logMessage: deleteError.message
    };
  }

  const { error: inviteError } = await serviceClient.from('member_invites').delete().eq('email', target.email);
  return {
    status: 200,
    body: { ok: true, deleted: true },
    logMessage: inviteError?.message,
    audit: {
      action: 'delete',
      entityId: target.id,
      entityLabel: `${target.display_name || '會員'} · ${target.email}`
    }
  };
}
