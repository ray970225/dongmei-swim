import { getSupabase, isSupabaseConfigured } from './supabase-client.js?v=20260925-3';

const configNotice = document.querySelector('#configNotice');
const resetPanel = document.querySelector('#resetPanel');
const form = document.querySelector('#resetRequestForm');
const emailInput = document.querySelector('#resetEmail');
const sendButton = document.querySelector('#sendResetButton');
const message = document.querySelector('#resetMessage');
const errorMessage = document.querySelector('#resetError');

if (!isSupabaseConfigured()) {
  configNotice.hidden = false;
} else {
  const supabase = await getSupabase();
  resetPanel.hidden = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    sendButton.disabled = true;
    sendButton.textContent = '寄送中…';
    errorMessage.textContent = '';
    message.textContent = '';

    const redirectTo = new URL('education.html', location.href);
    const { error } = await supabase.auth.resetPasswordForEmail(emailInput.value.trim(), {
      redirectTo: redirectTo.href
    });

    sendButton.disabled = false;
    sendButton.innerHTML = '寄送重設連結 <span aria-hidden="true">↗</span>';
    if (error) {
      const status = Number.isInteger(error.status) ? `HTTP ${error.status}` : '';
      const code = typeof error.code === 'string' && /^[a-z0-9_-]{1,48}$/i.test(error.code) ? error.code : '';
      const diagnostic = [status, code].filter(Boolean).join(' · ');
      errorMessage.textContent = `目前無法寄送重設連結${diagnostic ? `（${diagnostic}）` : ''}，請稍後再試或聯絡教練團。`;
      return;
    }

    message.textContent = '若此信箱已啟用為東美會員，你會收到重設密碼郵件。請從郵件中的連結返回本站設定新密碼；若忘記登入信箱，請聯絡教練團。';
  });
}
