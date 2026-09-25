import { getSupabase, isSupabaseConfigured } from './supabase-client.js?v=20260925-4';

const $ = selector => document.querySelector(selector);
let authLinkType = new URLSearchParams(location.hash.slice(1)).get('type') || '';
const configNotice = $('#configNotice');
const loginPanel = $('#loginPanel');
const appPanel = $('#educationApp');
const loginError = $('#loginError');
let supabase;
let allArticles = [];
let categories = [];
let activeCategory = '';
let activeUserId = '';
const memberViewRequested = new URLSearchParams(location.search).get('view') === 'member';

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = busy ? '登入中…' : label;
}

function showLogin(message = '') {
  activeUserId = '';
  appPanel.hidden = true;
  loginPanel.hidden = false;
  togglePasswordSetup(false);
  $('#signOutButton').hidden = true;
  $('#adminLink').hidden = true;
  $('#athleteNavLink').hidden = true;
  $('#memberLabel').textContent = 'MEMBER ACCESS';
  loginError.textContent = message;
}

function togglePasswordSetup(show) {
  $('#loginFields').hidden = show;
  $('#loginFields').querySelectorAll('input,button').forEach(input => {
    input.disabled = show;
    if (input.matches('input')) input.required = !show;
  });
  $('#passwordSetup').hidden = !show;
  $('#newPassword').required = show;
  $('#confirmPassword').required = show;
}

function signInErrorMessage(error) {
  if (error?.code === 'invalid_credentials') return '帳號或密碼錯誤，請重新確認。';
  if (error?.code === 'email_not_confirmed') return '此帳號尚未完成啟用，請聯絡教練團。';
  if (error?.code === 'over_request_rate_limit') return '登入嘗試過於頻繁，請稍後再試。';
  return '登入系統發生錯誤，請稍後重試。';
}

async function currentMember(session) {
  if (!session?.user) return null;
  const { data, error } = await supabase.from('profiles')
    .select('display_name,role,active').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  if (!data?.active || !['member', 'admin'].includes(data.role)) return null;
  return data;
}

function renderCategories() {
  const host = $('#categoryList');
  host.replaceChildren();
  [['', '全部資訊'], ...categories.map(category => [category.id, category.name])].forEach(([id, name]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `category-chip${activeCategory === id ? ' active' : ''}`;
    button.textContent = name;
    button.addEventListener('click', () => { activeCategory = id; renderCategories(); renderArticles(); });
    host.append(button);
  });
}

function renderArticles() {
  const host = $('#articleList');
  const query = $('#articleSearch').value.trim().toLocaleLowerCase();
  const rows = allArticles.filter(article => (!activeCategory || article.category_id === activeCategory) &&
    (!query || `${article.title} ${article.summary} ${(article.body || []).map?.(block => block.text || '').join(' ') || ''}`.toLocaleLowerCase().includes(query)));
  host.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '目前沒有符合的文章。';
    host.append(empty);
    return;
  }
  rows.forEach((article, index) => {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'article-row';
    const left = document.createElement('span'); left.className = 'article-index'; left.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span'); copy.className = 'article-copy';
    const category = document.createElement('span'); category.className = 'article-category';
    category.textContent = categories.find(item => item.id === article.category_id)?.name || '升學資訊';
    const title = document.createElement('strong'); title.textContent = article.title;
    const summary = document.createElement('span'); summary.className = 'article-summary'; summary.textContent = article.summary;
    copy.append(category, title, summary);
    const date = document.createElement('time'); date.className = 'article-date';
    date.textContent = article.published_at ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium' }).format(new Date(article.published_at)) : '';
    const arrow = document.createElement('span'); arrow.className = 'article-arrow'; arrow.textContent = '↗';
    link.append(left, copy, date, arrow);
    link.addEventListener('click', () => openArticle(article));
    host.append(link);
  });
}

function renderDeadlines(rows) {
  const strip = $('#deadlineStrip');
  const host = $('#deadlineList');
  host.replaceChildren();
  strip.hidden = !rows?.length;
  (rows || []).slice(0, 4).forEach(deadline => {
    const item = document.createElement('div'); item.className = 'deadline-item';
    const date = new Date(deadline.due_at);
    const day = document.createElement('strong'); day.textContent = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit' }).format(date);
    const title = document.createElement('span'); title.textContent = deadline.title;
    item.append(day, title); host.append(item);
  });
}

function renderArticleBody(body) {
  const host = $('#readerBody'); host.replaceChildren();
  const blocks = Array.isArray(body) ? body : String(body || '').split(/\n{2,}/).map(text => ({ type: 'paragraph', text }));
  blocks.forEach(block => {
    if (!block || typeof block.text !== 'string') return;
    const element = block.type === 'heading' ? document.createElement('h3') : document.createElement('p');
    element.textContent = block.text;
    host.append(element);
  });
}

async function openArticle(article) {
  $('#readerCategory').textContent = categories.find(item => item.id === article.category_id)?.name || '升學資訊';
  $('#readerTitle').textContent = article.title;
  $('#readerSummary').textContent = article.summary || '';
  renderArticleBody(article.body);
  const host = $('#readerAttachments'); host.replaceChildren();
  const { data: attachments, error } = await supabase.from('attachments').select('id,object_path,file_name,mime_type')
    .eq('article_id', article.id).order('sort_order');
  if (error) { host.textContent = '附件載入失敗，請稍後再試。'; }
  else for (const file of attachments || []) {
    const row = document.createElement('section'); row.className = 'attachment-row';
    const name = document.createElement('strong'); name.textContent = file.file_name;
    const isPdf = file.mime_type === 'application/pdf';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = isPdf ? '開啟隊內 PDF 閱讀器' : '檢視圖片';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const { data, error: urlError } = await supabase.storage.from('education').createSignedUrl(file.object_path, 300);
      button.disabled = false;
      if (urlError) { button.textContent = '無法開啟附件'; return; }
      if (isPdf) {
        const frame = document.createElement('iframe'); frame.className = 'pdf-frame'; frame.title = file.file_name; frame.src = data.signedUrl;
        const prior = row.querySelector('iframe'); prior?.remove(); row.append(frame);
      } else {
        const image = document.createElement('img'); image.className = 'article-image'; image.alt = file.file_name; image.src = data.signedUrl;
        const prior = row.querySelector('img'); prior?.remove(); row.append(image);
      }
    });
    row.append(name, button); host.append(row);
  }
  $('#reader').hidden = false;
  $('.library-section').hidden = true;
  $('#deadlineStrip').hidden = true;
  $('#reader').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadMemberData() {
  const [{ data: categoriesData, error: categoryError }, { data: articlesData, error: articleError }, { data: deadlinesData, error: deadlineError }] = await Promise.all([
    supabase.from('categories').select('id,name,slug,sort_order').order('sort_order'),
    supabase.from('articles').select('id,category_id,title,summary,body,published_at').eq('status', 'published').order('published_at', { ascending: false }),
    supabase.from('deadlines').select('id,title,due_at').gte('due_at', new Date().toISOString()).order('due_at').limit(4)
  ]);
  const error = categoryError || articleError || deadlineError;
  if (error) throw error;
  categories = categoriesData || [];
  allArticles = articlesData || [];
  renderDeadlines(deadlinesData);
  renderCategories();
  renderArticles();
}

async function activate(session) {
  if (session?.user?.id && session.user.id === activeUserId && !appPanel.hidden) return;
  activeUserId = session?.user?.id || '';
  if (session && ['invite', 'recovery'].includes(authLinkType)) {
    loginPanel.hidden = false; appPanel.hidden = true;
    togglePasswordSetup(true);
    $('#signOutButton').hidden = false;
    return;
  }
  try {
    const member = await currentMember(session);
    if (!member) { showLogin('此帳號尚未啟用為東美會員，請聯絡教練團。'); return; }
    if (member.role === 'admin' && !memberViewRequested) {
      location.replace('admin-v2.html');
      return;
    }
    loginPanel.hidden = true;
    appPanel.hidden = false;
    $('#memberName').textContent = member.display_name ? `· ${member.display_name}` : '';
    $('#memberLabel').textContent = member.role === 'admin' ? 'ADMIN MODE' : 'MEMBER MODE';
    $('#adminLink').hidden = member.role !== 'admin';
    $('#athleteNavLink').hidden = false;
    $('#signOutButton').hidden = false;
    $('#reader').hidden = true;
    $('.library-section').hidden = false;
    await loadMemberData();
  } catch (error) {
    console.error(error);
    showLogin('無法載入隊內資料，請確認登入狀態後再試。');
  }
}

if (!isSupabaseConfigured()) {
  configNotice.hidden = false;
} else {
  supabase = await getSupabase();
  togglePasswordSetup(false);
  $('#loginPanel').hidden = false;
  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button.disabled) return;
    setBusy(button, true);
    loginError.textContent = '';
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
      if (error) { loginError.textContent = signInErrorMessage(error); return; }
      await activate(data.session);
    } catch (error) {
      console.error('Member sign-in failed:', error instanceof Error ? error.name : 'UnknownError');
      loginError.textContent = '登入服務暫時無法連線，請稍後重試。';
    } finally {
      setBusy(button, false, '登入隊內資料庫 ↗');
    }
  });
  $('#savePassword').addEventListener('click', async event => {
    const button = event.currentTarget;
    const password = $('#newPassword').value;
    if (password !== $('#confirmPassword').value) { loginError.textContent = '兩次輸入的密碼不一致。'; return; }
    if (password.length < 10) { loginError.textContent = '請設定至少 10 個字元的密碼。'; return; }
    button.disabled = true; loginError.textContent = '';
    const { error } = await supabase.auth.updateUser({ password });
    button.disabled = false;
    if (error) { loginError.textContent = '密碼設定失敗，請稍後再試。'; return; }
    authLinkType = '';
    history.replaceState(null, '', location.pathname);
    await supabase.auth.signOut();
    showLogin('密碼已更新，請使用新密碼登入。');
  });
  $('#signOutButton').addEventListener('click', async () => {
    await supabase.auth.signOut();
    allArticles = []; categories = [];
    showLogin();
  });
  $('#articleSearch').addEventListener('input', renderArticles);
  $('#backToLibrary').addEventListener('click', () => {
    $('#reader').hidden = true; $('.library-section').hidden = false;
    $('#deadlineStrip').hidden = !$('#deadlineList').children.length;
  });
  const { data: { session } } = await supabase.auth.getSession();
  const authHash = new URLSearchParams(location.hash.slice(1));
  const authError = authHash.get('error_description') || authHash.get('error');
  if (session) await activate(session);
  else if (authError) {
    showLogin('重設連結無效或已過期，請重新寄送密碼重設郵件。');
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) setTimeout(() => void activate(session), 0);
    else showLogin();
  });
}
