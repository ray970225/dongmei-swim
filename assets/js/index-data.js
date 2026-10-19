import { isSupabaseConfigured, publicSelect } from './supabase-client.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const safeImageUrl = value => {
  try {
    const url = new URL(String(value || ''), location.href);
    return ['https:', 'http:'].includes(url.protocol) ? escapeHtml(url.href) : '';
  } catch { return ''; }
};

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

/* 動態插入的卡片也要套用捲動顯示效果 */
const revealObs = new IntersectionObserver(
  entries => entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.12 }
);

/* ─── LOAD NEWS ─── */
async function loadNews() {
  const loadingEl = document.getElementById('newsLoading');
  const errorEl   = document.getElementById('newsError');
  try {
    const rows = isSupabaseConfigured()
      ? await publicSelect('site_news', 'select=id,date,title,desc,img&order=date.desc')
      : [];
    rows.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    loadingEl.style.display = 'none';
    const grid = document.getElementById('newsGrid');
    if (!rows.length) { await renderRecentMeets(grid); return; }
    grid.innerHTML = rows.map(r => {
      const imageUrl = safeImageUrl(r.img);
      return `
      <div class="news-card reveal">
        <div class="news-card-img">
          ${imageUrl ? `<img src="${imageUrl}" alt="${escapeHtml(r.title || '')}" loading="lazy">` : '🏊‍♂️'}
        </div>
        <div class="news-card-body">
          <div class="news-date">${escapeHtml(r.date || '')}</div>
          <div class="news-title-text">${escapeHtml(r.title || '（無標題）')}</div>
          <div class="news-desc">${escapeHtml(r.desc || '')}</div>
        </div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
  } catch(e) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = '⚠️ 動態載入失敗，請稍後再試。';
  }
}

// 沒有公告時，改列成績資料中最近的賽事，讓這一區仍有實際內容。
async function renderRecentMeets(grid) {
  const facets = await fetch('data/swim-search-facets.json').then(response => response.ok ? response.json() : null).catch(() => null);
  const meets = (facets?.competitions || []).slice(0, 3);
  if (!meets.length) { grid.innerHTML = '<p class="news-empty-note">目前暫無消息，敬請期待。</p>'; return; }
  grid.classList.add('news-meets-host');
  grid.innerHTML = `<p class="news-empty-note">目前沒有新公告，以下是最近同步的賽事成績。</p>
    <div class="news-meets">${meets.map(meet => `
      <a class="news-meet" href="results.html?competition=${encodeURIComponent(meet.name)}">
        <span class="news-meet-date">${escapeHtml(meet.latest_date || '')}</span>
        <span class="news-meet-name">${escapeHtml(meet.name)}</span>
        <span class="news-meet-link">查看這場賽事成績 →</span>
      </a>`).join('')}</div>`;
}

/* ─── LOAD HONOURS ─── */
let allHonours = [];
let currentHonoursCat = 'all';
let currentHonoursPage = 1;
let honoursQuery = '';
const HONOURS_PER_PAGE = 8;
let honoursLoadStarted = false;

async function loadHonours() {
  if (honoursLoadStarted) return;
  honoursLoadStarted = true;
  const loadingEl = document.getElementById('honoursLoading');
  const errorEl   = document.getElementById('honoursError');
  const [manualResult, automaticResult] = await Promise.allSettled([
    loadManualHonours(),
    fetch('data/swim-honours-public.json').then(async response => {
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
  const uniqueHonours = new Map();
  for (const row of [...automaticHonours, ...manualHonours]) {
    const key = `${row.event}\u0000${row.name}\u0000${String(row.year)}`;
    if (!uniqueHonours.has(key)) uniqueHonours.set(key, row);
  }
  allHonours = [...uniqueHonours.values()]
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
  const data = await publicSelect('site_honours', 'select=id,cat,event,name,year,items');
  return (data || []).map(row => ({ ...row, source: 'manual' }));
}

function renderHonours(cat = currentHonoursCat, page = 1) {
  currentHonoursCat = cat;
  currentHonoursPage = page;
  const query = honoursQuery.trim();
  const data = allHonours.filter(r => (cat === 'all' || (r.cat || '').includes(cat))
    && (!query || `${r.name || ''} ${r.event || ''} ${r.year || ''}`.includes(query)));
  document.getElementById('honoursCount').textContent = allHonours.length
    ? `共 ${data.length.toLocaleString('zh-TW')} 筆前八名紀錄${query ? `（搜尋「${query}」）` : ''}` : '';
  const grid = document.getElementById('honoursGrid');
  const pagination = document.getElementById('honoursPagination');
  const totalPages = Math.ceil(data.length / HONOURS_PER_PAGE);
  currentHonoursPage = Math.min(Math.max(page, 1), totalPages || 1);
  const start = (currentHonoursPage - 1) * HONOURS_PER_PAGE;
  const pageData = data.slice(start, start + HONOURS_PER_PAGE);

  if (!data.length) {
    grid.innerHTML = '<p class="news-empty-note">沒有符合的紀錄，請換個關鍵字或類別。</p>';
    pagination.innerHTML = '';
    return;
  }

  grid.innerHTML = pageData.map(r => `
    <div class="honour-card reveal">
      <div class="honour-medal ${Number(r.best_rank || rankFromAward(r.award)) > 3 ? 'honour-rank' : ''}">${medalOrRank(r.best_rank, r.award)}</div>
      <div class="honour-info">
        <div class="honour-event">${escapeHtml(r.event || '')} · ${escapeHtml(r.year || '')}</div>
        <div class="honour-name">${escapeHtml(r.name || '')}</div>
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
              <span class="hi-event">${escapeHtml(event)}</span>
              ${time ? `<span class="hi-time">${escapeHtml(time)}</span>` : ''}
              ${award ? `<span class="hi-award">${medal ? `${medal} ` : ''}${escapeHtml(award)}</span>` : ''}
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

document.getElementById('honoursFilter').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('#honoursFilter .filter-btn').forEach(b => {
    b.classList.toggle('active', b === btn);
    b.setAttribute('aria-pressed', String(b === btn));
  });
  renderHonours(btn.dataset.cat, 1);
});

let honoursSearchTimer;
document.getElementById('honoursSearch').addEventListener('input', event => {
  clearTimeout(honoursSearchTimer);
  honoursSearchTimer = setTimeout(() => {
    honoursQuery = event.target.value;
    if (allHonours.length) renderHonours(currentHonoursCat, 1);
  }, 180);
});

document.getElementById('honoursPagination').addEventListener('click', e => {
  const btn = e.target.closest('.page-btn');
  if (!btn || btn.disabled) return;
  renderHonours(currentHonoursCat, Number(btn.dataset.page));
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  document.getElementById('honoursGrid').scrollIntoView({ behavior, block: 'start' });
});

async function loadRecruitmentGroups() {
  if (!isSupabaseConfigured()) return;
  const data = await publicSelect('recruitment_classes', 'select=name,age,desc&order=sort_order').catch(() => null);
  if (!data?.length) return;
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
