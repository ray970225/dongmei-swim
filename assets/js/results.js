const input = document.getElementById('searchInput');
const button = document.getElementById('searchBtn');
const clearButton = document.getElementById('clearBtn');
const competitionSelect = document.getElementById('competitionSelect');
const eventSelect = document.getElementById('eventSelect');
const list = document.getElementById('resultsList');
const meta = document.getElementById('metaText');
const updatedAt = document.getElementById('updatedAt');
const insightsPanel = document.getElementById('insightsPanel');
const pagination = document.getElementById('resultsPagination');
const RESULTS_PER_PAGE = 24;
let rows = [];
let performanceByResult = new Map();
let trendSeriesByKey = new Map();
let trendResizeTimer = null;
let activeTrendKey = '';
let trendListKey = '';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const uniqueSorted = values => [...new Set(values.filter(Boolean))]
  .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
const newestCompetitionsFirst = sourceRows => {
  const latestDateByCompetition = new Map();
  sourceRows.forEach(row => {
    if (!row.competition) return;
    const date = String(row.competition_date || '');
    if (date > (latestDateByCompetition.get(row.competition) || '')) {
      latestDateByCompetition.set(row.competition, date);
    }
  });
  return [...latestDateByCompetition.keys()].sort((a, b) => {
    const dateOrder = (latestDateByCompetition.get(b) || '').localeCompare(latestDateByCompetition.get(a) || '');
    return dateOrder || String(a).localeCompare(String(b), 'zh-Hant');
  });
};
const formatRank = rank => rank ? `第 ${rank} 名` : '名次未列';
const formatTime = milliseconds => {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0');
  return minutes ? `${minutes}:${seconds}` : `${totalSeconds.toFixed(2)} 秒`;
};
const formatDifference = milliseconds => {
  const seconds = Math.abs(milliseconds) / 1000;
  return seconds < 60 ? `${seconds.toFixed(2)} 秒` : formatTime(Math.abs(milliseconds));
};
const swimmerKey = row => row.swimmer_id || row.swimmer || '';
const performanceKey = row => [swimmerKey(row), row.event || '', row.pool_type || '未列池別'].join('|');
const trendKey = (event, poolType) => [event || '未列項目', poolType || '未列池別'].join('\u0001');
const trendKeyParts = key => String(key).split('\u0001');
const trendLabel = key => trendKeyParts(key).join('｜');

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

const buildPerformanceIndex = sourceRows => {
  const groups = new Map();
  sourceRows.forEach(row => {
    if (!Number.isFinite(Number(row.time_milliseconds)) || Number(row.time_milliseconds) <= 0) return;
    const key = performanceKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  performanceByResult = new Map();
  groups.forEach(group => {
    const ordered = [...group].sort((a, b) =>
      String(a.competition_date || '').localeCompare(String(b.competition_date || '')) ||
      String(a.id || '').localeCompare(String(b.id || ''))
    );
    let best = Infinity;
    let previous = null;
    ordered.forEach(row => {
      const time = Number(row.time_milliseconds);
      performanceByResult.set(row.id, {
        isPb: time <= best,
        difference: previous === null ? null : previous - time
      });
      best = Math.min(best, time);
      previous = time;
    });
  });
};

const buildTrendSeries = sourceRows => {
  trendSeriesByKey = new Map();
  sourceRows.forEach(row => {
    if (!Number.isFinite(Number(row.time_milliseconds)) || Number(row.time_milliseconds) <= 0) return;
    const key = trendKey(row.event, row.pool_type);
    if (!trendSeriesByKey.has(key)) trendSeriesByKey.set(key, []);
    trendSeriesByKey.get(key).push(row);
  });
  trendSeriesByKey.forEach((series, key) => {
    trendSeriesByKey.set(key, series.sort((a, b) =>
      String(a.competition_date || '').localeCompare(String(b.competition_date || '')) ||
      String(a.id || '').localeCompare(String(b.id || ''))
    ));
  });
};

const renderTrendChart = key => {
  const series = trendSeriesByKey.get(key) || [];
  const select = document.getElementById('trendSelect');
  if (select) select.value = key;
  const chart = document.getElementById('trendChart');
  if (!chart) return;
  if (series.length < 2) {
    chart.innerHTML = '<div class="empty">此項目目前只有一筆有效計時成績，累積更多比賽後會顯示趨勢圖。</div>';
    return;
  }

  const mobileChart = window.matchMedia('(max-width: 700px)').matches;
  const pointSpacing = mobileChart ? 66 : 82;
  const height = mobileChart ? 230 : 270;
  const padding = mobileChart
    ? { top: 24, right: 18, bottom: 42, left: 58 }
    : { top: 28, right: 24, bottom: 48, left: 82 };
  const width = Math.max(mobileChart ? 360 : 760, padding.left + padding.right + (series.length - 1) * pointSpacing);
  const times = series.map(row => Number(row.time_milliseconds));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const spread = Math.max(max - min, Math.max(max * 0.015, 100));
  const low = min - spread * 0.25;
  const high = max + spread * 0.25;
  const x = index => padding.left + (index / (series.length - 1)) * (width - padding.left - padding.right);
  const y = value => padding.top + ((high - value) / (high - low)) * (height - padding.top - padding.bottom);
  const ticks = [0, 0.5, 1].map(position => high - (high - low) * position);
  const line = series.map((row, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(Number(row.time_milliseconds)).toFixed(1)}`).join(' ');
  const dateLabel = row => String(row.competition_date || '').replace(/^\d{4}-/, '').replace('-', '/');
  const xLabels = series
    .map((row, index) => `<text class="trend-label" x="${x(index)}" y="${height - 18}" text-anchor="middle">${escapeHtml(dateLabel(row))}</text>`)
    .join('');
  const yGrid = ticks.map(value => `<g><line class="trend-grid" x1="${padding.left}" x2="${width - padding.right}" y1="${y(value)}" y2="${y(value)}" />
    <text class="trend-label" x="${padding.left - 10}" y="${y(value) + 4}" text-anchor="end">${escapeHtml(formatTime(value))}</text></g>`).join('');
  const points = series.map((row, index) => {
    const pointY = y(Number(row.time_milliseconds));
    const valueY = pointY - 12 < padding.top + 10 ? pointY + 18 : pointY - 12;
    return `<g class="trend-node"><circle class="trend-point" cx="${x(index)}" cy="${pointY}" r="5">
      <title>${escapeHtml(`${row.competition_date}｜${row.competition}｜${row.time}`)}</title></circle>
      <text class="trend-value" x="${x(index)}" y="${valueY}" text-anchor="middle">${escapeHtml(row.time || '')}</text></g>`;
  }).join('');
  const [trendEvent, trendPoolType] = trendKeyParts(key);
  chart.innerHTML = `<div class="trend-scroll-hint">每個節點均顯示成績${series.length > 6 ? '，可左右滑動查看完整趨勢' : ''}</div><svg class="trend-chart" style="width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${trendEvent} ${trendPoolType} 成績趨勢圖`)}">
    <line class="trend-axis" x1="${padding.left}" x2="${width - padding.right}" y1="${height - padding.bottom}" y2="${height - padding.bottom}" />
    ${yGrid}<path class="trend-line" d="${line}" />${points}
    ${xLabels}
  </svg>`;
};

const activateTrend = key => {
  activeTrendKey = key;
  trendListKey = key;
  const [event] = trendKeyParts(key);
  competitionSelect.value = '';
  syncEventOptions();
  eventSelect.value = [...eventSelect.options].some(option => option.value === event) ? event : '';
  const url = new URL(location.href);
  url.searchParams.set('q', input.value.trim());
  url.searchParams.set('event', eventSelect.value);
  url.searchParams.delete('competition');
  history.replaceState(null, '', url);
  render(input.value, 1);
  list.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const renderInsights = (matches, query) => {
  const swimmerIds = uniqueSorted(matches.map(swimmerKey));
  if (!query || swimmerIds.length !== 1) {
    insightsPanel.hidden = true;
    insightsPanel.innerHTML = '';
    return;
  }
  const swimmerRows = rows.filter(row => swimmerKey(row) === swimmerIds[0]);
  buildTrendSeries(swimmerRows);
  const options = [...trendSeriesByKey.entries()]
    .filter(([, series]) => series.length > 0)
    .sort(([, a], [, b]) => String(b.at(-1).competition_date || '').localeCompare(String(a.at(-1).competition_date || '')));
  if (!options.length) {
    insightsPanel.hidden = true;
    return;
  }
  const selectedKey = options.some(([key]) => key === activeTrendKey) ? activeTrendKey : options[0][0];
  activeTrendKey = selectedKey;
  insightsPanel.hidden = false;
  insightsPanel.innerHTML = `<div class="insight-head">
    <div><div class="insight-title">${escapeHtml(swimmerRows[0]?.swimmer || '')}｜成績趨勢</div>
      <div class="insight-sub">選擇趨勢項目後，下方成績會同步切換為同項目、同池別的所有有效計時紀錄</div></div>
    <select id="trendSelect" class="trend-select" aria-label="選擇趨勢項目">${options.map(([key]) => `<option value="${escapeHtml(key)}">${escapeHtml(trendLabel(key))}</option>`).join('')}</select>
  </div><div id="trendChart"></div>`;
  document.getElementById('trendSelect').addEventListener('change', event => activateTrend(event.target.value));
  renderTrendChart(selectedKey);
};

const performanceMarkup = row => {
  const performance = performanceByResult.get(row.id);
  if (!performance) return '';
  if (performance.difference === null) return '<br><span class="delta">首筆有效計時成績</span>';
  if (performance.difference > 0) return `<br><span class="delta delta-faster">較前次快 ${escapeHtml(formatDifference(performance.difference))}</span>`;
  if (performance.difference < 0) return `<br><span class="delta delta-slower">較前次慢 ${escapeHtml(formatDifference(performance.difference))}</span>`;
  return '<br><span class="delta">與前次相同</span>';
};

const renderPagination = (total, page, query) => {
  const totalPages = Math.ceil(total / RESULTS_PER_PAGE);
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }
  const visiblePages = new Set([1, totalPages]);
  for (let number = page - 1; number <= page + 1; number += 1) {
    if (number >= 1 && number <= totalPages) visiblePages.add(number);
  }
  const buttons = [...visiblePages].sort((a, b) => a - b).map((number, index, numbers) => {
    const ellipsis = index && number - numbers[index - 1] > 1 ? '<span class="page-ellipsis" aria-hidden="true">…</span>' : '';
    return `${ellipsis}<button class="page-btn ${number === page ? 'active' : ''}" type="button" data-page="${number}" aria-label="第 ${number} 頁">${number}</button>`;
  }).join('');
  pagination.innerHTML = `<button class="page-btn" type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="上一頁">‹</button>${buttons}<button class="page-btn" type="button" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''} aria-label="下一頁">›</button>`;
  pagination.dataset.query = query;
  pagination.dataset.page = String(page);
};

const render = (query, requestedPage = 1) => {
  const q = query.trim();
  const competition = competitionSelect.value;
  const event = eventSelect.value;
  if (!q && !competition && !event) {
    renderInsights([], '');
    list.innerHTML = '<div class="empty">請輸入選手姓名，或選擇賽事／項目開始查詢。</div>';
    pagination.innerHTML = '';
    meta.textContent = `已同步 ${rows.length} 筆成績`;
    return;
  }

  const matches = rows
    .filter(row => !q || String(row.swimmer || '').includes(q))
    .filter(row => !competition || row.competition === competition)
    .filter(row => !event || row.event === event)
    .sort((a, b) => String(b.competition_date || '').localeCompare(String(a.competition_date || '')));
  if (!matches.length) {
    renderInsights([], '');
    list.innerHTML = '<div class="empty">目前沒有符合的同步資料。可調整姓名、賽事或項目後再試一次。</div>';
    pagination.innerHTML = '';
    return;
  }

  renderInsights(matches, q);
  const trendRows = trendListKey && q && uniqueSorted(matches.map(swimmerKey)).length === 1
    ? trendSeriesByKey.get(trendListKey) || []
    : [];
  const displayRows = trendRows.length ? [...trendRows].reverse() : matches;
  const summary = selectionSummary(competitionSelect.value, eventSelect.value);
  const trendSummary = trendRows.length ? `｜趨勢：${trendKeyParts(trendListKey)[1]}` : '';
  meta.textContent = `找到 ${displayRows.length} 筆成績${summary}${trendSummary}`;
  const totalPages = Math.ceil(displayRows.length / RESULTS_PER_PAGE);
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const pageRows = displayRows.slice((page - 1) * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE);

  list.innerHTML = pageRows.map(row => `
    <article class="row">
      <div class="date">${escapeHtml(row.competition_date || '')}</div>
      <div>
        <div class="title">${escapeHtml(row.swimmer)}｜${escapeHtml(row.event || '未列項目')}${performanceByResult.get(row.id)?.isPb ? '<span class="pb-badge">PB</span>' : ''}</div>
        <div class="sub">${escapeHtml(row.competition || '')}<br>
          ${escapeHtml(row.team || '')} · ${escapeHtml(row.age_group || '')} · ${escapeHtml(row.round || '')} · ${escapeHtml(formatRank(row.rank))}
          ${performanceMarkup(row)}</div>
      </div>
      <div class="time">${escapeHtml(row.time || '-')}</div>
    </article>
  `).join('');
  renderPagination(displayRows.length, page, q);
};

const search = (resetPage = true) => {
  activeTrendKey = '';
  trendListKey = '';
  const q = input.value.trim();
  const url = new URL(location.href);
  const filters = { q, competition: competitionSelect.value, event: eventSelect.value };
  Object.entries(filters).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  history.replaceState(null, '', url);
  clearButton.hidden = !q && !competitionSelect.value && !eventSelect.value;
  render(q, resetPage ? 1 : Number(pagination.dataset.page || 1));
};

button.addEventListener('click', () => search(true));
input.addEventListener('keydown', event => { if (event.key === 'Enter') search(); });
competitionSelect.addEventListener('change', () => { syncEventOptions(); search(); });
eventSelect.addEventListener('change', search);
clearButton.addEventListener('click', () => {
  input.value = '';
  competitionSelect.value = '';
  syncEventOptions();
  search();
  input.focus();
});
pagination.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (!pageButton || pageButton.disabled) return;
  const page = Number(pageButton.dataset.page);
  pagination.dataset.page = String(page);
  render(input.value, page);
  list.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
window.addEventListener('resize', () => {
  window.clearTimeout(trendResizeTimer);
  trendResizeTimer = window.setTimeout(() => {
    const selectedTrend = document.getElementById('trendSelect')?.value;
    if (selectedTrend) renderTrendChart(selectedTrend);
  }, 160);
});

Promise.all([
  fetch('data/swim-results.json').then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }),
  fetch('data/swim-results-meta.json').then(response => response.ok ? response.json() : null).catch(() => null)
])
  .then(([data, metadata]) => {
    rows = Array.isArray(data) ? data : [];
    buildPerformanceIndex(rows);
    const params = new URLSearchParams(location.search);
    const initialCompetition = params.get('competition') || '';
    const initialEvent = params.get('event') || '';
    setOptions(competitionSelect, newestCompetitionsFirst(rows), '全部賽事', initialCompetition);
    syncEventOptions();
    eventSelect.value = [...eventSelect.options].some(option => option.value === initialEvent) ? initialEvent : '';
    const fallbackTimestamp = rows.map(row => row.synced_at).filter(Boolean).sort().at(-1);
    updatedAt.textContent = formatUpdatedAt(metadata?.synced_at || fallbackTimestamp);
    input.value = params.get('q') || '';
    clearButton.hidden = !input.value && !competitionSelect.value && !eventSelect.value;
    render(input.value);
  })
  .catch(error => {
    meta.textContent = '資料載入失敗';
    updatedAt.textContent = '最後更新時間無法取得';
    list.innerHTML = `<div class="empty">無法載入成績資料：${escapeHtml(error.message)}</div>`;
  });
