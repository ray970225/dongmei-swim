import { getSupabase, isSupabaseConfigured } from './supabase-client.js?v=20260925-4';

const $ = selector => document.querySelector(selector);
let supabase;
let articles = [];
let categories = [];
let syncTimer;
let activeUserId = '';
const loadedContent = new Set();

async function uploadWithSignedUrl(bucketName, path, file) {
  const storage = supabase.storage.from(bucketName);
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error) throw error;
  const { error: uploadError } = await storage.uploadToSignedUrl(path, data.token, file, { contentType: file.type });
  if (uploadError) throw uploadError;
}

function message(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle('is-error', isError);
}

function showLogin(text = '') {
  activeUserId = '';
  $('#adminApp').hidden = true; $('#loginPanel').hidden = false;
  $('#signOutButton').hidden = true; $('#loginError').textContent = text;
}

async function verifyAdmin(session) {
  if (!session?.user) return null;
  const { data, error } = await supabase.from('profiles').select('display_name,role,active').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  return data?.active && data.role === 'admin' ? data : null;
}

function switchTab(tab) {
  document.querySelectorAll('.admin-tabs button').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  document.querySelectorAll('.admin-pane').forEach(pane => pane.classList.toggle('active', pane.id === `pane-${tab}`));
  if (['news', 'honours', 'recruit'].includes(tab) && !loadedContent.has(tab)) {
    void loadPublicContent(tab).catch(error => {
      const messageId = { news: 'siteNewsMessage', honours: 'siteHonourMessage', recruit: 'recruitmentMessage' }[tab];
      message($(`#${messageId}`), error.message || '資料載入失敗；請確認已套用公開內容資料表設定。', true);
    });
  }
}

function formatTime(value) {
  if (!value) return '尚無同步紀錄';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '同步時間無法讀取' : new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(date);
}

function renderSync(rows) {
  const latest = rows[0];
  $('#syncMessage').textContent = '';
  $('#lastSync').textContent = latest?.status === 'success' ? `最後同步：${formatTime(latest.finished_at || latest.requested_at)}` : latest ? `最近狀態：${statusText(latest.status)} · ${formatTime(latest.requested_at)}` : '尚無同步紀錄';
  const history = $('#syncHistory'); history.replaceChildren();
  rows.slice(0, 8).forEach(row => {
    const item = document.createElement('div'); item.className = 'compact-row';
    const title = document.createElement('strong'); title.textContent = `${statusText(row.status)} · ${formatTime(row.finished_at || row.requested_at)}`;
    const detail = document.createElement('span'); detail.textContent = row.status === 'success'
      ? `新增 ${row.inserted_count} 筆 · 更新 ${row.updated_count} 筆 · 重複 ${row.duplicate_count} 筆 · ${row.affected_athlete_count} 位選手`
      : row.summary?.error || '';
    item.append(title, detail); history.append(item);
  });
  if (latest?.status === 'success') {
    const result = $('#syncResult'); result.replaceChildren(); result.hidden = false;
    [['新增', latest.inserted_count], ['更新', latest.updated_count], ['重複', latest.duplicate_count], ['影響選手', latest.affected_athlete_count], ['錯誤', latest.error_count]].forEach(([label, value]) => {
      const stat = document.createElement('div'); stat.className = 'sync-stat';
      const number = document.createElement('strong'); number.textContent = Number(value || 0).toLocaleString();
      const caption = document.createElement('span'); caption.textContent = label;
      stat.append(number, caption); result.append(stat);
    });
  } else {
    $('#syncResult').hidden = true;
    if (latest?.status === 'failed') message($('#syncMessage'), latest.summary?.error || '同步失敗，請檢查同步紀錄。', true);
  }
  const busy = latest && ['queued', 'running'].includes(latest.status);
  const cooldownUntil = latest ? new Date(latest.requested_at).getTime() + 15 * 60 * 1000 : 0;
  const cooldown = Date.now() < cooldownUntil;
  const button = $('#syncButton'); button.disabled = Boolean(busy || cooldown);
  button.innerHTML = busy ? '<span class="spinner"></span>同步處理中…' : cooldown ? '<span>◷</span>請稍後再同步' : '<span>↻</span>同步最新成績';
  if (busy) {
    clearTimeout(syncTimer); syncTimer = setTimeout(() => void loadSyncJobs(), 7000);
  } else if (cooldown) {
    clearTimeout(syncTimer); syncTimer = setTimeout(() => void loadSyncJobs(), Math.min(cooldownUntil - Date.now() + 100, 60000));
  }
}

function statusText(status) { return ({ queued: '排隊中', running: '同步中', success: '同步完成', failed: '同步失敗' })[status] || status; }

async function loadSyncJobs() {
  const { data, error } = await supabase.from('sync_jobs').select('*').order('requested_at', { ascending: false }).limit(10);
  if (error) throw error;
  renderSync(data || []);
}

async function triggerSync() {
  const button = $('#syncButton'); button.disabled = true;
  message($('#syncMessage'), '正在安全啟動同步工作…'); $('#syncResult').hidden = true;
  const { data, error } = await supabase.functions.invoke('dispatch-swim-sync', { body: {} });
  if (error || data?.error) {
    message($('#syncMessage'), data?.error || '無法啟動同步。請確認管理員權限與服務設定。', true);
    await loadSyncJobs(); return;
  }
  message($('#syncMessage'), '同步工作已啟動，完成後會自動顯示新增、更新與錯誤筆數。');
  await loadSyncJobs();
}

function slugFor(text) {
  const ascii = text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${ascii || 'article'}-${crypto.randomUUID().slice(0, 8)}`;
}

async function loadArticles() {
  const [{ data, error }, { data: categoryRows, error: categoryError }] = await Promise.all([
    supabase.from('articles').select('id,title,summary,body,status,published_at,category_id').order('updated_at', { ascending: false }),
    supabase.from('categories').select('id,name,slug,sort_order').order('sort_order')
  ]);
  if (error || categoryError) throw error || categoryError;
  articles = data || []; categories = categoryRows || [];
  $('#categoryOptions').replaceChildren(...categories.map(category => { const option = document.createElement('option'); option.value = category.name; return option; }));
  const list = $('#adminArticleList'); list.replaceChildren();
  if (!articles.length) { list.textContent = '目前尚無文章。'; return; }
  articles.forEach(article => {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'compact-row article-admin-row';
    const title = document.createElement('strong'); title.textContent = article.title;
    const status = document.createElement('span'); status.textContent = article.status === 'published' ? '已發布' : '草稿';
    row.append(title, status); row.addEventListener('click', () => {
      void editArticle(article).catch(error => message($('#articleMessage'), error.message || '文章載入失敗。', true));
    }); list.append(row);
  });
}

const publicContent = {
  news: { table: 'site_news', host: '#siteNewsList', message: '#siteNewsMessage', title: row => row.title, detail: row => `${row.date} · ${row.desc || '沒有描述'}` },
  honours: { table: 'site_honours', host: '#siteHonoursList', message: '#siteHonourMessage', title: row => `${row.event} · ${row.year}`, detail: row => `${row.cat} · ${row.name} · ${(row.items || []).length} 項` },
  recruit: { table: 'recruitment_classes', host: '#recruitmentList', message: '#recruitmentMessage', title: row => row.name, detail: row => [row.age, row.fee, row.desc].filter(Boolean).join(' · ') || '尚未填寫說明' }
};

function renderPublicContent(tab, rows) {
  const config = publicContent[tab];
  const host = $(config.host); host.replaceChildren();
  if (!rows.length) { host.textContent = '目前尚無資料。'; return; }
  rows.forEach(row => {
    const item = document.createElement('div'); item.className = 'compact-row';
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = config.title(row);
    const detail = document.createElement('span'); detail.textContent = config.detail(row); copy.append(title, detail);
    const actions = document.createElement('div'); actions.className = 'editor-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button-secondary'; edit.textContent = '編輯';
    edit.addEventListener('click', () => editPublicContent(tab, row));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = '刪除';
    remove.addEventListener('click', async () => {
      if (!confirm('確定刪除這筆公開資料？')) return;
      remove.disabled = true;
      const { error } = await supabase.from(config.table).delete().eq('id', row.id);
      if (error) { message($(config.message), error.message || '刪除失敗。', true); remove.disabled = false; return; }
      if (tab === 'news' && row.image_path) {
        const { error: imageError } = await supabase.storage.from('site-media').remove([row.image_path]);
        if (imageError) console.error('公開圖片刪除失敗', imageError);
      }
      message($(config.message), '資料已刪除。');
      loadedContent.delete(tab); await loadPublicContent(tab);
    });
    actions.append(edit, remove); item.append(copy, actions); host.append(item);
  });
}

async function loadPublicContent(tab) {
  const config = publicContent[tab];
  const order = tab === 'news' ? { column: 'date', ascending: false }
    : tab === 'honours' ? { column: 'year', ascending: false }
      : { column: 'sort_order', ascending: true };
  const { data, error } = await supabase.from(config.table).select('*').order(order.column, { ascending: order.ascending });
  if (error) throw error;
  renderPublicContent(tab, data || []);
  loadedContent.add(tab);
}

function editPublicContent(tab, row = null) {
  const form = $(`#${{ news: 'siteNewsForm', honours: 'siteHonourForm', recruit: 'recruitmentForm' }[tab]}`);
  form.hidden = false;
  if (tab === 'news') {
    $('#siteNewsId').value = row?.id || ''; $('#siteNewsDate').value = row?.date || new Date().toISOString().slice(0, 10);
    $('#siteNewsTitle').value = row?.title || ''; $('#siteNewsDesc').value = row?.desc || ''; $('#siteNewsImg').value = row?.img || '';
    $('#siteNewsImageFile').value = '';
    $('#siteNewsMessage').textContent = '';
  } else if (tab === 'honours') {
    $('#siteHonourId').value = row?.id || ''; $('#siteHonourCat').value = row?.cat || '全國';
    $('#siteHonourEvent').value = row?.event || ''; $('#siteHonourName').value = row?.name || '';
    $('#siteHonourYear').value = row?.year || new Date().getFullYear(); $('#siteHonourItems').value = (row?.items || []).join('\n');
    $('#siteHonourMessage').textContent = '';
  } else {
    $('#recruitmentId').value = row?.id || ''; $('#recruitmentName').value = row?.name || '';
    $('#recruitmentAge').value = row?.age || ''; $('#recruitmentFee').value = row?.fee || ''; $('#recruitmentDesc').value = row?.desc || '';
    $('#recruitmentMessage').textContent = '';
  }
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function savePublicContent(event, tab) {
  event.preventDefault();
  const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  const config = publicContent[tab];
  try {
    const id = tab === 'news' ? $('#siteNewsId').value : tab === 'honours' ? $('#siteHonourId').value : $('#recruitmentId').value;
    const payload = tab === 'news' ? {
      date: $('#siteNewsDate').value, title: $('#siteNewsTitle').value.trim(), desc: $('#siteNewsDesc').value.trim(), img: $('#siteNewsImg').value.trim()
    } : tab === 'honours' ? {
      cat: $('#siteHonourCat').value, event: $('#siteHonourEvent').value.trim(), name: $('#siteHonourName').value.trim(),
      year: Number($('#siteHonourYear').value), items: $('#siteHonourItems').value.split('\n').map(line => line.trim()).filter(Boolean)
    } : {
      name: $('#recruitmentName').value.trim(), age: $('#recruitmentAge').value.trim(), fee: $('#recruitmentFee').value.trim(),
      desc: $('#recruitmentDesc').value.trim()
    };
    payload.updated_at = new Date().toISOString();
    const prior = tab === 'news' && id ? await supabase.from('site_news').select('image_path').eq('id', id).maybeSingle() : null;
    if (prior?.error) throw prior.error;
    let uploadedImagePath = '';
    const imageFile = tab === 'news' ? $('#siteNewsImageFile').files?.[0] : null;
    if (imageFile) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type)) throw new Error('請選擇 JPG、PNG 或 WebP 圖片。');
      if (imageFile.size > 8 * 1024 * 1024) throw new Error('圖片大小不能超過 8 MB。');
      uploadedImagePath = `news/${crypto.randomUUID()}-${imageFile.name.replace(/[\\/]/g, '_')}`;
      await uploadWithSignedUrl('site-media', uploadedImagePath, imageFile);
      payload.image_path = uploadedImagePath;
      payload.img = supabase.storage.from('site-media').getPublicUrl(uploadedImagePath).data.publicUrl;
    }
    if (id) {
      const { error } = await supabase.from(config.table).update(payload).eq('id', id);
      if (error) {
        if (uploadedImagePath) await supabase.storage.from('site-media').remove([uploadedImagePath]);
        throw error;
      }
    } else {
      const { error } = await supabase.from(config.table).insert(payload);
      if (error) {
        if (uploadedImagePath) await supabase.storage.from('site-media').remove([uploadedImagePath]);
        throw error;
      }
    }
    if (uploadedImagePath && prior?.data?.image_path) await supabase.storage.from('site-media').remove([prior.data.image_path]);
    message($(config.message), '資料已儲存。'); form.hidden = true; form.reset(); loadedContent.delete(tab); await loadPublicContent(tab);
  } catch (error) { message($(config.message), error.message || '儲存失敗。', true); }
  finally { button.disabled = false; }
}

async function editArticle(article = null) {
  const form = $('#articleForm'); form.hidden = false;
  $('#articleId').value = article?.id || '';
  $('#articleTitle').value = article?.title || '';
  $('#articleCategory').value = categories.find(item => item.id === article?.category_id)?.name || '';
  $('#articleSummary').value = article?.summary || '';
  const body = Array.isArray(article?.body) ? article.body.map(block => block.text || '').join('\n\n') : '';
  $('#articleBody').value = body;
  $('#articlePublished').checked = article?.status === 'published';
  $('#deadlineAt').value = '';
  $('#articleFiles').value = '';
  $('#articleMessage').textContent = '';
  const attachmentList = $('#articleAttachmentList'); attachmentList.replaceChildren();
  if (article?.id) {
    const [{ data: files, error: filesError }, { data: deadline, error: deadlineError }] = await Promise.all([
      supabase.from('attachments').select('id,object_path,file_name').eq('article_id', article.id).order('sort_order'),
      supabase.from('deadlines').select('id,due_at').eq('article_id', article.id).order('due_at').limit(1).maybeSingle()
    ]);
    if (filesError || deadlineError) throw filesError || deadlineError;
    for (const file of files || []) {
      const row = document.createElement('div'); row.className = 'attachment-admin-row';
      const name = document.createElement('span'); name.textContent = file.file_name;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = '移除';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        const { error: storageError } = await supabase.storage.from('education').remove([file.object_path]);
        if (storageError) { message($('#articleMessage'), '附件移除失敗，請稍後再試。', true); remove.disabled = false; return; }
        const { error } = await supabase.from('attachments').delete().eq('id', file.id);
        if (error) { message($('#articleMessage'), '附件資料更新失敗。', true); remove.disabled = false; return; }
        row.remove();
      });
      row.append(name, remove); attachmentList.append(row);
    }
    if (deadline?.due_at) {
      const date = new Date(deadline.due_at);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      $('#deadlineAt').value = date.toISOString().slice(0, 16);
    }
    form.dataset.deadlineId = deadline?.id || '';
  } else form.dataset.deadlineId = '';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function categoryId(name) {
  const current = categories.find(item => item.name === name);
  if (current) return current.id;
  const { data, error } = await supabase.from('categories').insert({ name, slug: slugFor(name) }).select('id,name,slug,sort_order').single();
  if (error) throw error;
  categories.push(data);
  return data.id;
}

async function saveArticle(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const id = $('#articleId').value;
    const title = $('#articleTitle').value.trim();
    const categoryName = $('#articleCategory').value.trim();
    const article = {
      title, slug: slugFor(title), summary: $('#articleSummary').value.trim(),
      body: $('#articleBody').value.split(/\n{2,}/).map(text => ({ type: 'paragraph', text: text.trim() })).filter(block => block.text),
      category_id: await categoryId(categoryName),
      status: $('#articlePublished').checked ? 'published' : 'draft',
      published_at: $('#articlePublished').checked
        ? (articles.find(item => item.id === id)?.published_at || new Date().toISOString())
        : null,
      updated_at: new Date().toISOString()
    };
    let articleId = id;
    if (id) {
      const { error } = await supabase.from('articles').update(article).eq('id', id);
      if (error) throw error;
    } else {
      article.slug = slugFor(title);
      const { data, error } = await supabase.from('articles').insert({ ...article, author_id: (await supabase.auth.getUser()).data.user.id }).select('id').single();
      if (error) throw error;
      articleId = data.id;
    }
    const deadlineValue = $('#deadlineAt').value;
    const currentDeadlineId = form.dataset.deadlineId;
    if (deadlineValue && currentDeadlineId) {
      const { error } = await supabase.from('deadlines').update({ title, due_at: new Date(deadlineValue).toISOString() }).eq('id', currentDeadlineId);
      if (error) throw error;
    } else if (deadlineValue) {
      const { data, error } = await supabase.from('deadlines').insert({ article_id: articleId, title, due_at: new Date(deadlineValue).toISOString() }).select('id').single();
      if (error) throw error;
      form.dataset.deadlineId = data.id;
    } else if (currentDeadlineId) {
      const { error } = await supabase.from('deadlines').delete().eq('id', currentDeadlineId);
      if (error) throw error;
      form.dataset.deadlineId = '';
    }
    for (const file of $('#articleFiles').files) {
      if (file.size > 50 * 1024 * 1024) throw new Error('單一附件大小不能超過 50 MB。');
      const objectPath = `${articleId}/${crypto.randomUUID()}-${file.name.replace(/[\\/]/g, '_')}`;
      await uploadWithSignedUrl('education', objectPath, file);
      const { error: metadataError } = await supabase.from('attachments').insert({ article_id: articleId, object_path: objectPath, file_name: file.name, mime_type: file.type, byte_size: file.size });
      if (metadataError) throw metadataError;
    }
    message($('#articleMessage'), '文章已儲存。'); await loadArticles();
  } catch (error) {
    console.error(error); message($('#articleMessage'), error.message || '儲存失敗。', true);
  } finally { button.disabled = false; }
}

async function loadMembers() {
  const { data, error } = await supabase.from('profiles').select('id,email,display_name,role,active').order('display_name');
  if (error) throw error;
  const host = $('#memberList'); host.replaceChildren();
  (data || []).filter(profile => profile.role === 'member').forEach(profile => {
    const row = document.createElement('div'); row.className = 'compact-row member-row';
    const copy = document.createElement('div'); const name = document.createElement('strong'); name.textContent = profile.display_name || profile.email;
    const email = document.createElement('span'); email.textContent = profile.email; copy.append(name, email);
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'button-secondary'; toggle.textContent = profile.active ? '停用' : '重新啟用';
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      const { data: result, error: invokeError } = await supabase.functions.invoke('manage-member', { body: { action: 'set_active', profileId: profile.id, active: !profile.active } });
      if (invokeError || result?.error) message($('#memberMessage'), result?.error || '會員狀態更新失敗。', true);
      else { message($('#memberMessage'), '會員狀態已更新。'); await loadMembers(); }
    });
    row.append(copy, toggle); host.append(row);
  });
}

async function activate(session) {
  if (session?.user?.id && session.user.id === activeUserId && !$('#adminApp').hidden) return;
  activeUserId = session?.user?.id || '';
  try {
    const admin = await verifyAdmin(session);
    if (!admin) { showLogin('此帳號沒有管理員權限。'); return; }
    $('#loginPanel').hidden = true; $('#adminApp').hidden = false; $('#signOutButton').hidden = false;
    $('#memberLabel').textContent = 'ADMIN MODE'; $('#adminName').textContent = admin.display_name ? `· ${admin.display_name}` : '';
    await Promise.all([loadSyncJobs(), loadArticles(), loadMembers()]);
  } catch (error) { console.error(error); showLogin('管理資料載入失敗，請重新登入。'); }
}

if (!isSupabaseConfigured()) $('#configNotice').hidden = false;
else {
  supabase = await getSupabase(); $('#loginPanel').hidden = false;
  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button');
    if (button.disabled) return;
    button.disabled = true; button.textContent = '登入中…'; $('#loginError').textContent = '';
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
      if (error) { $('#loginError').textContent = '登入失敗，請確認管理員帳號與密碼。'; return; }
      await activate(data.session);
    } catch (error) {
      console.error('Admin sign-in failed:', error instanceof Error ? error.name : 'UnknownError');
      $('#loginError').textContent = '登入服務暫時無法連線，請稍後重試。';
    } finally {
      button.disabled = false; button.textContent = '登入管理台 ↗';
    }
  });
  $('#signOutButton').addEventListener('click', async () => { await supabase.auth.signOut(); showLogin(); });
  document.querySelectorAll('.admin-tabs button').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  $('#syncButton').addEventListener('click', triggerSync);
  $('#newArticleButton').addEventListener('click', () => {
    void editArticle().catch(error => message($('#articleMessage'), error.message || '文章載入失敗。', true));
  });
  $('#cancelArticle').addEventListener('click', () => { $('#articleForm').hidden = true; });
  $('#articleForm').addEventListener('submit', saveArticle);
  $('#newNewsButton').addEventListener('click', () => editPublicContent('news'));
  $('#newHonourButton').addEventListener('click', () => editPublicContent('honours'));
  $('#newRecruitButton').addEventListener('click', () => editPublicContent('recruit'));
  $('#cancelSiteNews').addEventListener('click', () => { $('#siteNewsForm').hidden = true; $('#siteNewsImageFile').value = ''; });
  $('#cancelSiteHonour').addEventListener('click', () => { $('#siteHonourForm').hidden = true; });
  $('#cancelRecruitment').addEventListener('click', () => { $('#recruitmentForm').hidden = true; });
  $('#siteNewsForm').addEventListener('submit', event => void savePublicContent(event, 'news'));
  $('#siteHonourForm').addEventListener('submit', event => void savePublicContent(event, 'honours'));
  $('#recruitmentForm').addEventListener('submit', event => void savePublicContent(event, 'recruit'));
  $('#inviteForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true;
    const { data, error } = await supabase.functions.invoke('manage-member', { body: { action: 'invite', email: $('#inviteEmail').value, displayName: $('#inviteName').value } });
    button.disabled = false;
    if (error || data?.error) message($('#memberMessage'), data?.error || '邀請失敗，請確認邀請服務設定。', true);
    else { form.reset(); message($('#memberMessage'), '會員邀請已寄出。'); await loadMembers(); }
  });
  const { data: { session } } = await supabase.auth.getSession(); if (session) await activate(session);
  supabase.auth.onAuthStateChange((_event, session) => { if (session) setTimeout(() => void activate(session), 0); else showLogin(); });
}
