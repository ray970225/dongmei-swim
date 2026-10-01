import { getSupabase, isSupabaseConfigured } from './supabase-client.js?v=20260925-4';

const $ = selector => document.querySelector(selector);
let supabase;
let activeUserId = '';

function setMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle('is-error', isError);
}

function returnToLogin() {
  location.replace('education.html');
}

async function activate(session) {
  const user = session?.user;
  if (!user?.id) { returnToLogin(); return; }
  if (user.id === activeUserId) return;
  activeUserId = user.id;
  try {
    const { data: profile, error } = await supabase.from('profiles')
      .select('display_name,role,active').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!profile?.active || !['member', 'admin'].includes(profile.role)) {
      setMessage($('#accountNotice'), '此帳號目前無法使用會員服務，請聯絡教練團。', true);
      await supabase.auth.signOut();
      return;
    }

    const isAdmin = profile.role === 'admin';
    $('#accountRoleLabel').textContent = isAdmin ? '管理員帳號' : '會員帳號';
    $('#accountEmail').textContent = user.email || '';
    $('#adminBackLink').hidden = !isAdmin;
    $('#accountBackLink').href = isAdmin ? 'admin-v2.html' : 'education.html';
    $('#accountBackLink').textContent = isAdmin ? '← 回到教練工作台' : '← 回到會員工作台';
    $('#passwordForm').hidden = false;
    $('#accountNotice').hidden = true;
    $('#signOutButton').hidden = false;
  } catch (error) {
    console.error('Account settings access check failed:', error instanceof Error ? error.name : 'UnknownError');
    setMessage($('#accountNotice'), '無法確認帳號權限，請重新登入後再試。', true);
  }
}

function passwordErrorMessage(error) {
  const details = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  if (details.includes('invalid_credentials') || details.includes('current password') || details.includes('password is incorrect')) {
    return '目前密碼不正確，請重新輸入。';
  }
  if (details.includes('same_password') || details.includes('different from the old password')) {
    return '新密碼需要與目前密碼不同。';
  }
  if (details.includes('weak_password') || details.includes('password should be')) {
    return '新密碼不符合安全要求，請設定至少 10 個字元。';
  }
  return '密碼更新失敗，請稍後重試；若問題持續，請聯絡管理員。';
}

if (!isSupabaseConfigured()) {
  setMessage($('#accountNotice'), '登入服務目前無法連線，請稍後再試。', true);
} else {
  supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await activate(session);
  else returnToLogin();

  $('#passwordForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('#savePasswordButton');
    const currentPassword = $('#currentPassword').value;
    const password = $('#newPassword').value;
    const confirmation = $('#confirmPassword').value;
    const message = $('#passwordMessage');
    message.textContent = '';
    message.classList.remove('is-error');

    if (password.length < 10) { setMessage(message, '新密碼至少需要 10 個字元。', true); return; }
    if (password !== confirmation) { setMessage(message, '兩次輸入的新密碼不一致。', true); return; }
    if (password === currentPassword) { setMessage(message, '新密碼請設定為不同的密碼。', true); return; }

    button.disabled = true;
    button.textContent = '更新中…';
    try {
      const { error } = await supabase.auth.updateUser({ password, current_password: currentPassword });
      if (error) { setMessage(message, passwordErrorMessage(error), true); return; }
      form.reset();
      setMessage(message, '密碼已更新。下次登入請使用新密碼。');
    } catch (error) {
      console.error('Password update failed:', error instanceof Error ? error.name : 'UnknownError');
      setMessage(message, '密碼更新時發生系統錯誤，請稍後重試。', true);
    } finally {
      button.disabled = false;
      button.textContent = '更新密碼';
    }
  });

  $('#signOutButton').addEventListener('click', async () => {
    await supabase.auth.signOut();
    returnToLogin();
  });

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    if (!nextSession) returnToLogin();
    else if (nextSession.user?.id !== activeUserId) void activate(nextSession);
  });
}
