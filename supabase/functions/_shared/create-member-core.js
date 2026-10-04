const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createMemberAccount(serviceClient, { email, displayName, initialPassword }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(displayName || '').trim().slice(0, 80);
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return { status: 400, body: { error: '請輸入有效的電子郵件地址。' } };
  }
  if (!normalizedName) {
    return { status: 400, body: { error: '請輸入選手姓名。' } };
  }
  if (typeof initialPassword !== 'string' || initialPassword.length < 8) {
    return { status: 503, body: { error: '初始密碼尚未完成後端設定，請聯絡系統管理員。' } };
  }

  const { data: existingProfile, error: profileLookupError } = await serviceClient.from('profiles')
    .select('id').eq('email', normalizedEmail).maybeSingle();
  if (profileLookupError) {
    return { status: 500, body: { error: '會員帳號狀態查詢失敗。' }, logMessage: profileLookupError.message };
  }
  if (existingProfile) {
    return { status: 409, body: { error: '這個電子郵件已經有會員帳號。' } };
  }

  const { data: previousInvite, error: inviteLookupError } = await serviceClient.from('member_invites')
    .select('email,display_name,invited_by,created_at,must_change_password')
    .eq('email', normalizedEmail).maybeSingle();
  if (inviteLookupError) {
    return { status: 500, body: { error: '會員帳號準備失敗。' }, logMessage: inviteLookupError.message };
  }

  const { error: inviteError } = await serviceClient.from('member_invites').upsert({
    email: normalizedEmail,
    display_name: normalizedName,
    must_change_password: true
  }, { onConflict: 'email' });
  if (inviteError) {
    return { status: 500, body: { error: '會員帳號準備失敗。' }, logMessage: inviteError.message };
  }

  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email: normalizedEmail,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { display_name: normalizedName }
  });
  if (createError || !created?.user) {
    const { data: inviteAfterFailure } = await serviceClient.from('member_invites')
      .select('email,must_change_password').eq('email', normalizedEmail).maybeSingle();
    if (inviteAfterFailure?.must_change_password) {
      if (previousInvite) await serviceClient.from('member_invites').upsert(previousInvite, { onConflict: 'email' });
      else await serviceClient.from('member_invites').delete().eq('email', normalizedEmail);
    }
    return {
      status: 400,
      body: { error: '會員帳號建立失敗，請確認電子郵件是否已註冊。' },
      logMessage: createError?.message || 'Auth user creation returned no user'
    };
  }

  const { data: profile, error: createdProfileError } = await serviceClient.from('profiles')
    .select('id,role,active,must_change_password').eq('id', created.user.id).maybeSingle();
  if (createdProfileError || !profile || profile.role !== 'member' || !profile.active || !profile.must_change_password) {
    await serviceClient.auth.admin.deleteUser(created.user.id);
    return {
      status: 500,
      body: { error: '帳號已建立，但會員資料初始化失敗。請稍後重試或聯絡系統管理員。' },
      logMessage: createdProfileError?.message || 'Member profile trigger did not create a forced-reset profile'
    };
  }

  return {
    status: 200,
    body: { ok: true, initialPassword },
    audit: {
      action: 'create',
      entityId: created.user.id,
      entityLabel: `${normalizedName} · ${normalizedEmail}`
    }
  };
}
