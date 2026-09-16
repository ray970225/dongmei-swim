import { initializeApp }     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs }
                              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyAllss1eAGWAxzUshcOOXfqGtLP1ikSqfI",
  authDomain:        "dongmei-swim.firebaseapp.com",
  projectId:         "dongmei-swim",
  storageBucket:     "dongmei-swim.firebasestorage.app",
  messagingSenderId: "766030230820",
  appId:             "1:766030230820:web:422a37a4ef2a1be627efb1"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

function medalIcon(award='') {
  if (award.includes('🥇')||award.includes('第一')) return '🥇';
  if (award.includes('🥈')||award.includes('第二')) return '🥈';
  if (award.includes('🥉')||award.includes('第三')) return '🥉';
  return '🏅';
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
    const snap = await getDocs(collection(db, 'news'));
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

async function loadHonours() {
  const loadingEl = document.getElementById('honoursLoading');
  const errorEl   = document.getElementById('honoursError');
  try {
    const snap = await getDocs(collection(db, 'honours'));
    allHonours = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allHonours.sort((a,b) => (b.year||0)-(a.year||0));
    loadingEl.style.display = 'none';
    renderHonours('all');
  } catch(e) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = '⚠️ 榮譽資料載入失敗。';
  }
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
      <div class="honour-medal">${medalIcon(r.award||'')}</div>
      <div class="honour-info">
        <div class="honour-event">${r.event||''} · ${r.year||''}</div>
        <div class="honour-name">${r.name||''}</div>
        <div class="honour-items">${
          (r.items||[]).map(line => {
            const parts = line.trim().split(/\s+/);
            const event = parts[0]||'';
            const time  = parts[1]||'';
            const award = parts.slice(2).join(' ')||'';
            const medal = award.includes('第一') ? '🥇' : award.includes('第二') ? '🥈' : award.includes('第三') ? '🥉' : '🏅';
            return `<div class="honour-item">
              <span class="hi-event">${event}</span>
              ${time ? `<span class="hi-time">${time}</span>` : ''}
              ${award ? `<span class="hi-award">${medal} ${award}</span>` : ''}
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

  const pageButtons = Array.from({ length: totalPages }, (_, i) => {
    const page = i + 1;
    return `<button class="page-btn ${page === currentHonoursPage ? 'active' : ''}" data-page="${page}" aria-label="第 ${page} 頁">${page}</button>`;
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

loadNews();
loadHonours();
