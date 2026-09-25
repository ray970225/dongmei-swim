import { getSupabase, isSupabaseConfigured } from './supabase-client.js';

let supabasePromise;

async function publicSupabase() {
  if (!isSupabaseConfigured()) return null;
  supabasePromise ||= getSupabase();
  return supabasePromise;
}

function rankFromAward(award = '') {
  const text = String(award);
  if (text.includes('第一') || /第\s*1\s*名/.test(text)) return 1;
  if (text.includes('第二') || /第\s*2\s*名/.test(text)) return 2;
  if (text.includes('第三') || /第\s*3\s*名/.test(text)) return 3;
  const match = text.match(/第\s*(\d+)\s*名/);
  return match ? Number(match[1]) : null;
}

function medalOrRank(rank, award = '') {
  const resolvedRank = Number(rank) || rankFromAward(award);
  if (resolvedRank === 1) return '🥇';
  if (resolvedRank === 2) return '🥈';
  if (resolvedRank === 3) return '🥉';
  return resolvedRank ? `第 ${resolvedRank} 名` : '';
}

function medalForRank(rank, award = '') {
  const marker = medalOrRank(rank, award);
  return ['🥇', '🥈', '🥉'].includes(marker) ? marker : '';
}

/* scroll reveal observer (已在上方 script 宣告，這裡重新取得) */
const revealObs = new IntersectionObserver(
  entries => entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.12 }
);

/* ─── LOAD NEWS ─── */
async function loadNews() {
  const loadingEl = document.getElementById('newsLoading');
  const errorEl   = document.getElementById('newsError');
  try {
    let rows;
    const client = await publicSupabase();
    if (client) {
      const { data, error } = await client.from('site_news').select('id,date,title,desc,img').order('date', { ascending: false });
      if (error) throw error;
      rows = data || [];
    } else rows = [];
    rows.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    loadingEl.style.display = 'none';
    const grid = document.getElementById('newsGrid');
    if (!rows.length) { grid.innerHTML = '<p style="color:var(--gray);font-size:.85rem;">目前暫無消息，敬請期待。</p>'; return; }
    grid.innerHTML = rows.map(r => `
      <div class="news-card reveal">
        <div class="news-card-img">
          ${r.img ? `<img src="${r.img}" alt="${r.title||''}" loading="lazy">` : '🏊‍♂️'}
        </div>
        <div class="news-card-body">
          <div class="news-date">${r.date||''}</div>
          <div class="news-title-text">${r.title||'（無標題）'}</div>
          <div class="news-desc">${r.desc||''}</div>
        </div>
      </div>`).join('');
    grid.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
  } catch(e) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = '⚠️ 動態載入失敗，請稍後再試。';
  }
}

/* ─── LOAD HONOURS ─── */
let allHonours = [];
let currentHonoursCat = 'all';
let currentHonoursPage = 1;
const HONOURS_PER_PAGE = 6;
let honoursLoadStarted = false;

async function loadHonours() {
  if (honoursLoadStarted) return;
  honoursLoadStarted = true;
  const loadingEl = document.getElementById('honoursLoading');
  const errorEl   = document.getElementById('honoursError');
  const [manualResult, automaticResult] = await Promise.allSettled([
    loadManualHonours(),
    fetch('data/swim-honours.json', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(`自動榮譽資料載入失敗：${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('自動榮譽資料格式錯誤');
      return data;
    })
  ]);

  const manualHonours = manualResult.status === 'fulfilled'
    ? manualResult.value
    : [];
  const automaticHonours = automaticResult.status === 'fulfilled' ? automaticResult.value : [];
  allHonours = [...automaticHonours, ...manualHonours]
    .filter((row, index, rows) => rows.findIndex(other =>
      other.event === row.event && other.name === row.name && String(other.year) === String(row.year)) === index)
    .sort((a, b) => String(b.date || b.year || '').localeCompare(String(a.date || a.year || '')) ||
      Number(a.best_rank || 99) - Number(b.best_rank || 99));

  loadingEl.style.display = 'none';
  if (!allHonours.length) {
    errorEl.style.display = 'block';
    errorEl.textContent = '⚠️ 榮譽資料載入失敗，請稍後再試。';
    return;
  }
  renderHonours('all');
}

async function loadManualHonours() {
  const client = await publicSupabase();
  if (client) {
    const { data, error } = await client.from('site_honours').select('id,cat,event,name,year,items');
    if (error) throw error;
    return (data || []).map(row => ({ ...row, source: 'manual' }));
  }
  throw new Error('網站資料服務尚未設定');
}

function renderHonours(cat = currentHonoursCat, page = 1) {
  currentHonoursCat = cat;
  currentHonoursPage = page;
  const data = cat === 'all' ? allHonours : allHonours.filter(r => (r.cat||'').includes(cat));
  const grid = document.getElementById('honoursGrid');
  const pagination = document.getElementById('honoursPagination');
  const totalPages = Math.ceil(data.length / HONOURS_PER_PAGE);
  currentHonoursPage = Math.min(Math.max(page, 1), totalPages || 1);
  const start = (currentHonoursPage - 1) * HONOURS_PER_PAGE;
  const pageData = data.slice(start, start + HONOURS_PER_PAGE);

  if (!data.length) {
    grid.innerHTML = '<p style="color:var(--gray);font-size:.85rem;padding:1rem 0;">尚無記錄。</p>';
    pagination.innerHTML = '';
    return;
  }

  grid.innerHTML = pageData.map(r => `
    <div class="honour-card reveal">
      <div class="honour-medal ${Number(r.best_rank || rankFromAward(r.award)) > 3 ? 'honour-rank' : ''}">${medalOrRank(r.best_rank, r.award)}</div>
      <div class="honour-info">
        <div class="honour-event">${r.event||''} · ${r.year||''}</div>
        <div class="honour-name">${r.name||''}</div>
        <div class="honour-items">${
          (r.item_details || (r.items||[]).map(line => {
            const parts = line.trim().split(/\s+/);
            return { event: parts[0] || '', time: parts[1] || '', award: parts.slice(2).join(' ') || '' };
          })).map(item => {
            const event = item.event || '';
            const time = item.time || '';
            const award = item.award || (item.rank ? `第 ${item.rank} 名` : '');
            const medal = medalForRank(item.rank, award);
            return `<div class="honour-item">
              <span class="hi-event">${event}</span>
              ${time ? `<span class="hi-time">${time}</span>` : ''}
              ${award ? `<span class="hi-award">${medal ? `${medal} ` : ''}${award}</span>` : ''}
            </div>`;
          }).join('')
        }</div>
      </div>
    </div>`).join('');
  grid.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
  renderHonoursPagination(totalPages);
}

function renderHonoursPagination(totalPages) {
  const pagination = document.getElementById('honoursPagination');
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const visiblePages = new Set([1, totalPages]);
  for (let page = currentHonoursPage - 2; page <= currentHonoursPage + 2; page += 1) {
    if (page >= 1 && page <= totalPages) visiblePages.add(page);
  }
  const pageButtons = [...visiblePages].sort((a, b) => a - b).map((page, index, pages) => {
    const gap = index && page - pages[index - 1] > 1 ? '<span class="page-ellipsis" aria-hidden="true">…</span>' : '';
    return `${gap}<button class="page-btn ${page === currentHonoursPage ? 'active' : ''}" data-page="${page}" aria-label="第 ${page} 頁">${page}</button>`;
  }).join('');

  pagination.innerHTML = `
    <button class="page-btn" data-page="${currentHonoursPage - 1}" ${currentHonoursPage === 1 ? 'disabled' : ''} aria-label="上一頁">‹</button>
    ${pageButtons}
    <button class="page-btn" data-page="${currentHonoursPage + 1}" ${currentHonoursPage === totalPages ? 'disabled' : ''} aria-label="下一頁">›</button>
  `;
}

/* 讓 filter 按鈕能用 renderHonours */
window._renderHonours = renderHonours;
document.getElementById('honoursFilter').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHonours(btn.dataset.cat, 1);
});

document.getElementById('honoursPagination').addEventListener('click', e => {
  const btn = e.target.closest('.page-btn');
  if (!btn || btn.disabled) return;
  renderHonours(currentHonoursCat, Number(btn.dataset.page));
});

async function loadRecruitmentGroups() {
  const client = await publicSupabase();
  if (!client) return;
  const { data, error } = await client.from('recruitment_classes').select('name,age,desc').order('sort_order');
  if (error || !data?.length) return;
  const host = document.querySelector('.recruit-groups'); host.replaceChildren();
  data.forEach(group => {
    const card = document.createElement('div'); card.className = 'group-card';
    const title = document.createElement('div'); title.className = 'group-title'; title.textContent = group.name;
    const age = document.createElement('div'); age.className = 'group-age'; age.textContent = group.age;
    const desc = document.createElement('div'); desc.className = 'group-desc'; desc.textContent = group.desc;
    card.append(title, age, desc); host.append(card);
  });
}

loadNews();
void loadRecruitmentGroups();

// 榮譽資料量較大，捲動接近區塊時才下載，讓手機開啟首頁更快。
const honoursSection = document.getElementById('honours');
const startHonoursLoading = () => loadHonours();
if (location.hash === '#honours' || !('IntersectionObserver' in window)) {
  startHonoursLoading();
} else {
  const honoursObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    honoursObserver.disconnect();
    startHonoursLoading();
  }, { rootMargin: '420px 0px' });
  honoursObserver.observe(honoursSection);
}
