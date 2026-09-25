import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
                                   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, limit }
                                   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ── CONFIG ── */
const firebaseConfig = globalThis.TMSC_FIREBASE_CONFIG;

const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

/* ── AUTH ── */
window.doLogin = async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const pwd   = document.getElementById('loginPwd').value;
  const err   = document.getElementById('loginErr');
  err.textContent = '';
  if (!auth) { err.textContent = '管理服務尚未完成安全設定。'; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pwd);
  } catch(e) {
    err.textContent = '帳號或密碼錯誤，請再試一次。';
  }
};

window.doLogout = () => auth ? signOut(auth) : Promise.resolve();

if (auth) onAuthStateChanged(auth, user => {
  if (user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminShell').style.display  = 'block';
    document.getElementById('adminEmail').textContent    = user.email;
    loadAll();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminShell').style.display  = 'none';
  }
});
else {
  const loginError = document.getElementById('loginErr');
  if (loginError) loginError.textContent = '管理服務尚未完成安全設定。';
}

/* ── TAB SWITCH ── */
window.switchTab = el => {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-' + el.dataset.tab).classList.add('active');
};

/* ── TOAST ── */
function toast(msg, err=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  setTimeout(() => t.className = 'toast', 2800);
}

function setNewsImagePreview(url='') {
  const preview = document.getElementById('news-img-preview');
  const link = document.getElementById('news-img-link');
  if (url) {
    preview.innerHTML = `<img src="${url}" alt="最新動態圖片預覽">`;
    link.href = url;
    link.style.display = 'inline-flex';
  } else {
    preview.textContent = '尚無圖片';
    link.removeAttribute('href');
    link.style.display = 'none';
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('圖片讀取失敗，請換一張照片試試'));
    img.src = URL.createObjectURL(file);
  });
}

function canvasToDataUrl(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality);
}

async function compressNewsImage(file) {
  const img = await loadImageFromFile(file);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.82;
  let dataUrl = canvasToDataUrl(canvas, quality);
  while (dataUrl.length > 850000 && quality > 0.46) {
    quality -= 0.08;
    dataUrl = canvasToDataUrl(canvas, quality);
  }
  if (dataUrl.length > 950000) {
    throw new Error('圖片仍然太大，請先裁切或換小一點的照片');
  }
  return dataUrl;
}

async function prepareNewsImageIfNeeded() {
  const fileInput = document.getElementById('news-img-file');
  const file = fileInput.files?.[0];
  if (!file) return document.getElementById('news-img').value.trim();
  if (!file.type.startsWith('image/')) throw new Error('請選擇圖片檔案');
  return compressNewsImage(file);
}

document.getElementById('news-img-file').addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) {
    setNewsImagePreview(document.getElementById('news-img').value.trim());
    return;
  }
  if (!file.type.startsWith('image/')) {
    toast('請選擇圖片檔案', true);
    e.target.value = '';
    return;
  }
  setNewsImagePreview(URL.createObjectURL(file));
});

/* ── MODAL ── */
window.openModal  = (type, data=null) => {
  if (type === 'news') {
    document.getElementById('modal-news-title').textContent = data ? '編輯動態' : '新增動態';
    document.getElementById('news-id').value    = data?.id    || '';
    document.getElementById('news-date').value  = data?.date  || new Date().toISOString().slice(0,10);
    document.getElementById('news-title').value = data?.title || '';
    document.getElementById('news-desc').value  = data?.desc  || '';
    document.getElementById('news-img').value   = data?.img   || '';
    document.getElementById('news-img-file').value = '';
    setNewsImagePreview(data?.img || '');
  } else if (type === 'honours') {
    document.getElementById('modal-honours-title').textContent = data ? '編輯獎項' : '新增獎項';
    document.getElementById('honours-id').value    = data?.id    || '';
    document.getElementById('honours-cat').value   = data?.cat   || '全國';
    document.getElementById('honours-event').value = data?.event || '';
    document.getElementById('honours-name').value  = data?.name  || '';
    document.getElementById('honours-year').value  = data?.year  || new Date().getFullYear();
    document.getElementById('honours-items').value = (data?.items || []).join('\n');
  } else if (type === 'recruit') {
    document.getElementById('modal-recruit-title').textContent = data ? '編輯班別' : '新增班別';
    document.getElementById('recruit-id').value   = data?.id   || '';
    document.getElementById('recruit-name').value = data?.name || '';
    document.getElementById('recruit-age').value  = data?.age  || '';
    document.getElementById('recruit-desc').value = data?.desc || '';
    document.getElementById('recruit-fee').value  = data?.fee  || '';
  }
  document.getElementById('modal-' + type).classList.add('open');
};
window.closeModal = type => document.getElementById('modal-' + type).classList.remove('open');

/* ── GENERIC CRUD ── */
async function loadCollection(col) {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function saveDoc(col, id, data) {
  if (id) {
    await updateDoc(doc(db, col, id), data);
  } else {
    await addDoc(collection(db, col), data);
  }
}
async function delDoc(col, id) {
  await deleteDoc(doc(db, col, id));
}

/* ── LOAD ALL ── */
async function loadAll() {
  await Promise.all([loadNews(), loadHonours(), loadRecruit(), loadSyncStatus()]);
  loadDashboard();
}

/* ── SWIM DATA SYNC STATUS ── */
function formatSyncTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium', timeStyle: 'short', hour12: false
  }).format(date);
}

async function loadSyncStatus() {
  const state = document.getElementById('sync-state');
  const summary = document.getElementById('syncSummary');
  try {
    const response = await fetch(`data/swim-sync-status.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`同步紀錄讀取失敗：${response.status}`);
    const data = await response.json();
    if (data.status !== 'success' || !data.last_success_at) throw new Error('同步紀錄格式不正確');
    state.textContent = '正常';
    state.classList.remove('is-error');
    summary.innerHTML = `
      <div class="sync-summary-head"><strong>✓ 最近一次資料同步成功</strong><span>${formatSyncTime(data.last_success_at)}</span></div>
      <div class="sync-summary-grid">
        <div><b>${Number(data.swimmer_count || 0).toLocaleString()}</b><span>位選手</span></div>
        <div><b>${Number(data.result_count || 0).toLocaleString()}</b><span>筆成績</span></div>
        <div><b>+${Number(data.new_result_count || 0).toLocaleString()}</b><span>本次新增</span></div>
        <div><b>${Number(data.automatic_honours_count || 0).toLocaleString()}</b><span>前八名榮譽</span></div>
      </div>`;
  } catch (error) {
    console.error(error);
    state.textContent = '待確認';
    state.classList.add('is-error');
    summary.innerHTML = '<div class="sync-summary-error">暫時無法讀取同步紀錄；請確認資料檔是否已完整推送。</div>';
  }
}

/* ════ NEWS ════ */
let newsData = [];
async function loadNews() {
  newsData = await loadCollection('news');
  newsData.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  document.getElementById('cnt-news').textContent = newsData.length;
  renderNewsList();
}
function renderNewsList() {
  const el = document.getElementById('newsList');
  if (!newsData.length) { el.innerHTML = '<div class="empty-state">尚無資料，點擊右上角新增</div>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>日期</th><th>標題</th><th>描述</th><th>圖片</th><th></th></tr></thead>
    <tbody>${newsData.map(r=>`
      <tr>
        <td data-label="日期">${r.date||'—'}</td>
        <td data-label="標題"><b>${r.title||''}</b></td>
        <td data-label="描述" class="td-truncate">${r.desc||''}</td>
        <td data-label="圖片">${r.img ? `<a href="${r.img}" target="_blank" style="color:var(--aqua);font-size:.75rem;">查看</a>` : '—'}</td>
        <td data-label="操作">
          <button class="btn-icon" onclick='editNews(${JSON.stringify(r)})'>✏️</button>
          <button class="btn-icon btn-del" onclick="removeNews('${r.id}')">🗑️</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}
window.editNews = data => openModal('news', data);
window.removeNews = async id => {
  if (!confirm('確定刪除？')) return;
  await delDoc('news', id);
  toast('已刪除');
  loadNews().then(loadDashboard);
};
window.saveNews = async () => {
  const id    = document.getElementById('news-id').value;
  const saveBtn = document.querySelector('#modal-news .btn-primary');
  const data  = {
    date:  document.getElementById('news-date').value,
    title: document.getElementById('news-title').value.trim(),
    desc:  document.getElementById('news-desc').value.trim(),
    img:   document.getElementById('news-img').value.trim(),
  };
  if (!data.title) { toast('請填寫標題', true); return; }
  try {
    saveBtn.disabled = true;
    saveBtn.textContent = '處理圖片中…';
    data.img = await prepareNewsImageIfNeeded();
    await saveDoc('news', id, data);
    closeModal('news');
    toast(id ? '已更新' : '已新增 ✓');
    loadNews().then(loadDashboard);
  } catch (e) {
    console.error(e);
    toast(e.message || '圖片上傳失敗，請稍後再試', true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '儲存';
  }
};

/* ════ HONOURS ════ */
let honoursData = [];
async function loadHonours() {
  honoursData = await loadCollection('honours');
  honoursData.sort((a,b) => (b.year||0)-(a.year||0));
  document.getElementById('cnt-honours').textContent = honoursData.length;
  renderHonoursList();
}
function renderHonoursList() {
  const el = document.getElementById('honoursList');
  if (!honoursData.length) { el.innerHTML = '<div class="empty-state">尚無資料</div>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>類別</th><th>賽事</th><th>選手</th><th>成績明細</th><th>年份</th><th></th></tr></thead>
    <tbody>${honoursData.map(r=>`
      <tr>
        <td data-label="類別"><span class="badge badge-aqua">${r.cat||''}</span></td>
        <td data-label="賽事" class="td-truncate">${r.event||''}</td>
        <td data-label="選手">${r.name||''}</td>
        <td data-label="成績明細" class="td-truncate">${(r.items||[]).join(' / ')}</td>
        <td data-label="年份">${r.year||''}</td>
        <td data-label="操作">
          <button class="btn-icon" onclick='editHonours(${JSON.stringify(r)})'>✏️</button>
          <button class="btn-icon btn-del" onclick="removeHonours('${r.id}')">🗑️</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}
window.editHonours = data => openModal('honours', data);
window.removeHonours = async id => {
  if (!confirm('確定刪除？')) return;
  await delDoc('honours', id);
  toast('已刪除');
  loadHonours();
};
window.saveHonours = async () => {
  const id   = document.getElementById('honours-id').value;
  const data = {
    cat:   document.getElementById('honours-cat').value,
    event: document.getElementById('honours-event').value.trim(),
    name:  document.getElementById('honours-name').value.trim(),
    year:  document.getElementById('honours-year').value,
    items: document.getElementById('honours-items').value.split('\n').map(s=>s.trim()).filter(Boolean),
  };
  if (!data.name || !data.event) { toast('請填寫選手與賽事', true); return; }
  await saveDoc('honours', id, data);
  closeModal('honours');
  toast(id ? '已更新' : '已新增 ✓');
  loadHonours();
};

/* ════ RECRUIT ════ */
let recruitData = [];
async function loadRecruit() {
  recruitData = await loadCollection('recruit');
  document.getElementById('cnt-recruit').textContent = recruitData.length;
  renderRecruitList();
}
function renderRecruitList() {
  const el = document.getElementById('recruitList');
  if (!recruitData.length) { el.innerHTML = '<div class="empty-state">尚無資料</div>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>班別</th><th>年齡</th><th>費用</th><th>說明</th><th></th></tr></thead>
    <tbody>${recruitData.map(r=>`
      <tr>
        <td data-label="班別"><b>${r.name||''}</b></td>
        <td data-label="年齡">${r.age||''}</td>
        <td data-label="費用">${r.fee||'—'}</td>
        <td data-label="說明" class="td-truncate">${r.desc||''}</td>
        <td data-label="操作">
          <button class="btn-icon" onclick='editRecruit(${JSON.stringify(r)})'>✏️</button>
          <button class="btn-icon btn-del" onclick="removeRecruit('${r.id}')">🗑️</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}
window.editRecruit = data => openModal('recruit', data);
window.removeRecruit = async id => {
  if (!confirm('確定刪除？')) return;
  await delDoc('recruit', id);
  toast('已刪除');
  loadRecruit();
};
window.saveRecruit = async () => {
  const id   = document.getElementById('recruit-id').value;
  const data = {
    name: document.getElementById('recruit-name').value.trim(),
    age:  document.getElementById('recruit-age').value.trim(),
    desc: document.getElementById('recruit-desc').value.trim(),
    fee:  document.getElementById('recruit-fee').value.trim(),
  };
  if (!data.name) { toast('請填寫班別名稱', true); return; }
  await saveDoc('recruit', id, data);
  closeModal('recruit');
  toast(id ? '已更新' : '已新增 ✓');
  loadRecruit();
};

/* ════ DASHBOARD recent ════ */
function loadDashboard() {
  const recent = newsData.slice(0, 5);
  const el = document.getElementById('recentNews');
  if (!recent.length) { el.innerHTML = '<div class="empty-state">尚無動態</div>'; return; }
  el.innerHTML = `<table>
    <thead><tr><th>日期</th><th>標題</th><th>描述</th></tr></thead>
    <tbody>${recent.map(r=>`
      <tr>
        <td data-label="日期">${r.date||'—'}</td>
        <td data-label="標題"><b>${r.title||''}</b></td>
        <td data-label="描述" class="td-truncate">${r.desc||''}</td>
      </tr>`).join('')}
    </tbody></table>`;
}
