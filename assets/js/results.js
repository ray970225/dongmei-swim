const input = document.getElementById('searchInput');
const button = document.getElementById('searchBtn');
const competitionSelect = document.getElementById('competitionSelect');
const eventSelect = document.getElementById('eventSelect');
const list = document.getElementById('resultsList');
const meta = document.getElementById('metaText');
const updatedAt = document.getElementById('updatedAt');
let rows = [];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const uniqueSorted = values => [...new Set(values.filter(Boolean))]
  .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
const formatRank = rank => rank ? `第 ${rank} 名` : '名次未列';

const formatUpdatedAt = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '最後更新時間未提供';
  return `最後更新：${new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date)}（台灣時間）`;
};

const setOptions = (select, values, defaultLabel, selected = '') => {
  select.innerHTML = [`<option value="">${defaultLabel}</option>`, ...values.map(value =>
    `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  )].join('');
  select.value = values.includes(selected) ? selected : '';
};

const syncEventOptions = () => {
  const competition = competitionSelect.value;
  const currentEvent = eventSelect.value;
  const matchingRows = competition ? rows.filter(row => row.competition === competition) : rows;
  setOptions(eventSelect, uniqueSorted(matchingRows.map(row => row.event)), '全部項目', currentEvent);
};

const selectionSummary = (competition, event) => {
  const filters = [];
  if (competition) filters.push(`賽事：${competition}`);
  if (event) filters.push(`項目：${event}`);
  return filters.length ? `（${filters.join('｜')}）` : '';
};

const render = query => {
  const q = query.trim();
  const competition = competitionSelect.value;
  const event = eventSelect.value;
  if (!q && !competition && !event) {
    list.innerHTML = '<div class="empty">請輸入選手姓名，或選擇賽事／項目開始查詢。</div>';
    meta.textContent = `已同步 ${rows.length} 筆成績`;
    return;
  }

  const matches = rows
    .filter(row => !q || String(row.swimmer || '').includes(q))
    .filter(row => !competition || row.competition === competition)
    .filter(row => !event || row.event === event)
    .sort((a, b) => String(b.competition_date || '').localeCompare(String(a.competition_date || '')));
  const summary = selectionSummary(competition, event);
  meta.textContent = matches.length ? `找到 ${matches.length} 筆成績${summary}` : `找不到符合條件的成績${summary}`;

  if (!matches.length) {
    list.innerHTML = '<div class="empty">目前沒有符合的同步資料。可調整姓名、賽事或項目後再試一次。</div>';
    return;
  }

  list.innerHTML = matches.map(row => `
    <article class="row">
      <div class="date">${escapeHtml(row.competition_date || '')}</div>
      <div>
        <div class="title">${escapeHtml(row.swimmer)}｜${escapeHtml(row.event || '未列項目')}</div>
        <div class="sub">${escapeHtml(row.competition || '')}<br>
          ${escapeHtml(row.team || '')} · ${escapeHtml(row.age_group || '')} · ${escapeHtml(row.round || '')} · ${escapeHtml(formatRank(row.rank))}</div>
      </div>
      <div class="time">${escapeHtml(row.time || '-')}</div>
    </article>
  `).join('');
};

const search = () => {
  const q = input.value.trim();
  const url = new URL(location.href);
  const filters = { q, competition: competitionSelect.value, event: eventSelect.value };
  Object.entries(filters).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  history.replaceState(null, '', url);
  render(q);
};

button.addEventListener('click', search);
input.addEventListener('keydown', event => { if (event.key === 'Enter') search(); });
competitionSelect.addEventListener('change', () => { syncEventOptions(); search(); });
eventSelect.addEventListener('change', search);

Promise.all([
  fetch('data/swim-results.json').then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }),
  fetch('data/swim-results-meta.json').then(response => response.ok ? response.json() : null).catch(() => null)
])
  .then(([data, metadata]) => {
    rows = Array.isArray(data) ? data : [];
    const params = new URLSearchParams(location.search);
    const initialCompetition = params.get('competition') || '';
    const initialEvent = params.get('event') || '';
    setOptions(competitionSelect, uniqueSorted(rows.map(row => row.competition)), '全部賽事', initialCompetition);
    syncEventOptions();
    eventSelect.value = [...eventSelect.options].some(option => option.value === initialEvent) ? initialEvent : '';
    const fallbackTimestamp = rows.map(row => row.synced_at).filter(Boolean).sort().at(-1);
    updatedAt.textContent = formatUpdatedAt(metadata?.synced_at || fallbackTimestamp);
    input.value = params.get('q') || '';
    render(input.value);
  })
  .catch(error => {
    meta.textContent = '資料載入失敗';
    updatedAt.textContent = '最後更新時間無法取得';
    list.innerHTML = `<div class="empty">無法載入成績資料：${escapeHtml(error.message)}</div>`;
  });
