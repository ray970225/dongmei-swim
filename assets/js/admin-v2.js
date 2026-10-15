import { getSupabase, isSupabaseConfigured } from './supabase-client.js?v=20260925-4';

const $ = selector => document.querySelector(selector);
let supabase;
let articles = [];
let categories = [];
let auditRows = [];
let activeUserId = '';
const loadedContent = new Set();

const taskHelp = {
  articles: { scope: '隊內資料 · 會員限定', title: '管理升學文章與附件', description: '新增文章、招生簡章、重要日期、圖片或 PDF。只有登入且啟用中的東美會員能閱讀已發布內容。' },
  members: { scope: '隊內資料 · 帳號管理', title: '建立與刪除會員', description: '建立會員登入帳號；不再需要的會員可永久刪除。刪除無法復原，管理員帳號不可從這裡刪除。' },
  news: { scope: '公開官網 · 首頁消息', title: '管理最新動態', description: '新增、修改或移除官網首頁所有訪客都看得到的隊務消息。' },
  honours: { scope: '公開官網 · 榮譽殿堂', title: '管理榮譽紀錄', description: '維護賽事、年份、選手、成績與名次，儲存後會更新官網榮譽殿堂。' },
  recruit: { scope: '公開官網 · 招生區', title: '管理招生班別', description: '更新班別名稱、適合年齡、費用和說明；儲存後會顯示在官網招生區。' },
  audit: { scope: '管理紀錄 · 管理員限定', title: '後台操作紀錄', description: '查看管理員對隊內文章、官網消息、榮譽紀錄、招生班別及會員帳號的操作。' }
};

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
  const isHome = tab === 'home';
  $('#adminHeading').hidden = !isHome;
  $('#adminHome').hidden = !isHome;
  $('#adminTaskHeader').hidden = isHome;
  document.querySelectorAll('.admin-pane').forEach(pane => pane.classList.toggle('active', pane.id === `pane-${tab}`));
  if (!isHome) {
    const help = taskHelp[tab];
    $('#activeTaskScope').textContent = help.scope;
    $('#activeTaskTitle').textContent = help.title;
    $('#activeTaskDescription').textContent = help.description;
  }
  if (tab === 'audit') void loadAuditLogs();
  if (['news', 'honours', 'recruit'].includes(tab) && !loadedContent.has(tab)) {
    void loadPublicContent(tab).catch(error => {
      const messageId = { news: 'siteNewsMessage', honours: 'siteHonourMessage', recruit: 'recruitmentMessage' }[tab];
      message($(`#${messageId}`), error.message || '資料載入失敗；請確認已套用公開內容資料表設定。', true);
    });
  }
}

const auditEntityNames = {
  article: '隊內文章', news: '首頁公告', honour: '榮譽紀錄', recruitment: '招生班別', member: '會員帳號'
};
const auditActionNames = { create: '新增', update: '修改', delete: '刪除' };
const auditStatusNames = { draft: '草稿', published: '已發布', archived: '已封存' };

function formatAuditTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '時間無法讀取' : new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium', timeStyle: 'short', hour12: false
  }).format(date);
}

function renderAuditLogs() {
  const host = $('#adminAuditList');
  const entity = $('#auditEntityFilter').value;
  const search = $('#auditSearch').value.trim().toLocaleLowerCase('zh-TW');
  const filtered = auditRows.filter(row => {
    if (entity !== 'all' && row.entity_type !== entity) return false;
    if (!search) return true;
    return [row.actor_email, row.entity_label, row.entity_id, auditEntityNames[row.entity_type], auditActionNames[row.action]]
      .filter(Boolean).join(' ').toLocaleLowerCase('zh-TW').includes(search);
  });
  host.replaceChildren();
  $('#auditCount').textContent = `顯示 ${filtered.length} 筆${auditRows.length === 200 ? ' · 最近 200 筆' : ''}`;
  if (!filtered.length) {
    const empty = document.createElement('div'); empty.className = 'admin-empty-state'; empty.setAttribute('role', 'status');
    const title = document.createElement('strong');
    title.textContent = auditRows.length ? '沒有符合條件的紀錄' : '目前還沒有操作紀錄';
    const detail = document.createElement('span');
    detail.textContent = auditRows.length
      ? '請調整項目篩選或搜尋文字。'
      : '新增或修改網站內容、會員帳號後，系統會自動記下管理員與操作項目。';
    empty.append(title, detail); host.append(empty); return;
  }
  filtered.forEach(row => {
    const item = document.createElement('article'); item.className = 'compact-row audit-log-row';
    const copy = document.createElement('div'); copy.className = 'audit-log-copy';
    const title = document.createElement('strong');
    title.textContent = `${auditActionNames[row.action] || '操作'}${auditEntityNames[row.entity_type] || '資料'}`;
    const label = document.createElement('span'); label.className = 'audit-log-label'; label.textContent = row.entity_label || '未命名項目';
    const meta = document.createElement('span'); meta.className = 'audit-log-meta';
    meta.textContent = `${row.actor_email || '系統作業'} · ${formatAuditTime(row.created_at)}`;
    copy.append(title, label, meta);
    if (row.details?.from_status || row.details?.to_status) {
      const status = document.createElement('span'); status.className = 'audit-log-status';
      const from = auditStatusNames[row.details.from_status] || row.details.from_status || '—';
      const to = auditStatusNames[row.details.to_status] || row.details.to_status || '—';
      status.textContent = `文章狀態：${from} → ${to}`; copy.append(status);
    }
    item.append(copy); host.append(item);
  });
}

async function loadAuditLogs() {
  const button = $('#refreshAuditButton');
  button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '載入中…';
  message($('#auditMessage'), '');
  $('#adminAuditList').textContent = '正在載入操作紀錄…';
  try {
    const { data, error } = await supabase.from('admin_audit_logs')
      .select('id,actor_email,action,entity_type,entity_id,entity_label,details,created_at')
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    auditRows = data || [];
    renderAuditLogs();
  } catch (error) {
    console.error('Admin audit history could not be loaded:', error instanceof Error ? error.name : 'UnknownError');
    $('#adminAuditList').replaceChildren();
    message($('#auditMessage'), '操作紀錄載入失敗。請確認資料庫更新已部署，再重新整理。', true);
    $('#auditCount').textContent = '';
  } finally {
    button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = '重新整理';
  }
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
    row.setAttribute('aria-label', `編輯隊內文章：${article.title}`);
    const title = document.createElement('strong'); title.textContent = article.title;
    const status = document.createElement('span'); status.textContent = `${article.status === 'published' ? '已發布' : '草稿'} · 點選以編輯`;
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
  if (!rows.length) {
    const empty = document.createElement('div'); empty.className = 'admin-empty-state'; empty.setAttribute('role', 'status');
    const title = document.createElement('strong');
    title.textContent = { news: '目前沒有首頁消息', honours: '目前沒有比賽獎項', recruit: '目前沒有招生班別' }[tab];
    const detail = document.createElement('span');
    detail.textContent = { news: '發布後，訪客就會在官網首頁看到這則消息。', honours: '新增賽事和名次後，會顯示在官網榮譽殿堂。', recruit: '新增班別後，會顯示在官網招生區。' }[tab];
    empty.append(title, detail); host.append(empty); return;
  }
  rows.forEach(row => {
    const item = document.createElement('div'); item.className = 'compact-row';
    const copy = document.createElement('div'); const title = document.createElement('strong'); title.textContent = config.title(row);
    const detail = document.createElement('span'); detail.textContent = config.detail(row); copy.append(title, detail);
    const actions = document.createElement('div'); actions.className = 'editor-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button-secondary';
    edit.textContent = `編輯${{ news: '消息', honours: '獎項紀錄', recruit: '招生班別' }[tab]}`;
    edit.addEventListener('click', () => editPublicContent(tab, row));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button';
    remove.textContent = `刪除${{ news: '消息', honours: '獎項紀錄', recruit: '招生班別' }[tab]}`;
    remove.addEventListener('click', async () => {
      if (!confirm(`確定刪除「${config.title(row)}」？刪除後官網訪客將看不到這筆資料。`)) return;
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
  const { data, error } = await supabase.from('profiles').select('id,email,display_name,role').order('display_name');
  if (error) throw error;
  const host = $('#memberList'); host.replaceChildren();
  (data || []).filter(profile => profile.role === 'member').forEach(profile => {
    const row = document.createElement('div'); row.className = 'compact-row member-row';
    const copy = document.createElement('div'); const name = document.createElement('strong'); name.textContent = profile.display_name || profile.email;
    const email = document.createElement('span'); email.textContent = profile.email; copy.append(name, email);
    const actions = document.createElement('div'); actions.className = 'member-row-actions';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button-danger';
    remove.textContent = '永久刪除帳號';
    remove.setAttribute('aria-label', `永久刪除會員帳號：${profile.display_name || profile.email}`);
    remove.addEventListener('click', async () => {
      const identity = profile.email || profile.display_name || '此會員';
      if (!window.confirm(`確定永久刪除「${identity}」的帳號嗎？登入身分與會員關聯資料會一併移除，無法復原。`)) return;
      remove.disabled = true;
      message($('#memberMessage'), `正在刪除 ${identity} 的帳號…`);
      let deleted = false;
      try {
        const { data: result, error: invokeError } = await supabase.functions.invoke('manage-member', {
          body: { action: 'delete_member', profileId: profile.id }
        });
        if (invokeError || result?.error || !result?.deleted) {
          message($('#memberMessage'), result?.error || '帳號刪除失敗，請稍後重試。', true);
          return;
        }
        deleted = true;
        message($('#memberMessage'), result.auditWarning
          ? '會員帳號已刪除，但操作紀錄未能寫入；請聯絡系統管理員。'
          : '會員帳號已永久刪除。', Boolean(result.auditWarning));
      } catch (error) {
        console.error('Member account deletion failed:', error instanceof Error ? error.name : 'UnknownError');
        message($('#memberMessage'), '帳號刪除服務暫時無法連線，請稍後重試。', true);
      } finally {
        remove.disabled = false;
      }
      if (deleted) {
        try { await loadMembers(); }
        catch (error) {
          console.error('Deleted member list refresh failed:', error instanceof Error ? error.name : 'UnknownError');
          message($('#memberMessage'), '帳號已刪除，但名單更新失敗；請重新整理頁面。', true);
        }
      }
    });
    actions.append(remove);
    row.append(copy, actions); host.append(row);
  });
}

async function activate(session) {
  if (session?.user?.id && session.user.id === activeUserId && !$('#adminApp').hidden) return;
  activeUserId = session?.user?.id || '';
  try {
    const admin = await verifyAdmin(session);
    if (!admin) { showLogin('此帳號沒有管理員權限。'); return; }
    $('#loginPanel').hidden = true; $('#adminApp').hidden = false; $('#signOutButton').hidden = false;
    $('#memberLabel').textContent = '管理員'; $('#adminName').textContent = admin.display_name ? `· ${admin.display_name}` : '';
    switchTab('home');
    await Promise.all([loadArticles(), loadMembers()]);
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
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  $('#backToAdminHome').addEventListener('click', () => switchTab('home'));
  $('#refreshAuditButton').addEventListener('click', () => void loadAuditLogs());
  $('#auditEntityFilter').addEventListener('change', renderAuditLogs);
  $('#auditSearch').addEventListener('input', renderAuditLogs);
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
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true; button.textContent = '建立中…';
    try {
      const { data, error } = await supabase.functions.invoke('manage-member', { body: { action: 'create_member', email: $('#inviteEmail').value, displayName: $('#inviteName').value } });
      if (error || data?.error) message($('#memberMessage'), data?.error || '會員帳號建立失敗，請稍後重試。', true);
      else {
        form.reset();
        const auditWarning = data.auditWarning ? '操作紀錄未能寫入，請聯絡系統管理員。' : '';
        message($('#memberMessage'), `帳號已建立。初始密碼：${data.initialPassword}。請私下提供給選手，首次登入後必須更改。${auditWarning ? ` ${auditWarning}` : ''}`, Boolean(auditWarning));
        await loadMembers();
      }
    } catch (error) {
      console.error('Member account creation failed:', error instanceof Error ? error.name : 'UnknownError');
      message($('#memberMessage'), '會員帳號建立失敗，請檢查網路後重試。', true);
    } finally {
      button.disabled = false; button.textContent = '建立會員帳號';
    }
  });
  const { data: { session } } = await supabase.auth.getSession(); if (session) await activate(session);
  supabase.auth.onAuthStateChange((_event, session) => { if (session) setTimeout(() => void activate(session), 0); else showLogin(); });
}
