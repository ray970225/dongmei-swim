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
const TREND_DISPLAY_LIMIT = 10;
let rows = [];
let performanceByResult = new Map();
let trendSeriesByKey = new Map();
let trendResizeTimer = null;
let activeTrendKey = '';
let trendListKey = '';
let syncedResultCount = 0;

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
const swimmerNameKey = row => String(row.swimmer || '').trim();
const swimmerNames = sourceRows => uniqueSorted(sourceRows.map(swimmerNameKey));
const performanceKey = row => [swimmerKey(row), row.event || '', row.pool_type || '未列池別'].join('|');
const trendKey = (event, poolType) => [event || '未列項目', poolType || '未列池別'].join('\u0001');
const trendKeyParts = key => String(key).split('\u0001');
const trendEventInfo = event => {
  const match = String(event || '').match(/^(\d+)\s*(?:公尺|米)?\s*(.*)$/u);
  return match
    ? { distance: Number(match[1]), distanceLabel: `${match[1]} 公尺`, stroke: match[2] || event }
    : { distance: Infinity, distanceLabel: '其他項目', stroke: String(event || '未列項目') };
};
const trendStrokeOrder = event => {
  const stroke = trendEventInfo(event).stroke;
  if (stroke.includes('蝶')) return 0;
  if (stroke.includes('仰')) return 1;
  if (stroke.includes('蛙')) return 2;
  if (stroke.includes('自由')) return 3;
  if (stroke.includes('混合')) return 4;
  if (stroke.includes('接力')) return 5;
  return 6;
};
const trendPoolLabel = poolType => ({
  '長池': '長池（50 公尺）',
  '短池': '短池（25 公尺）',
  '未列池別': '未標示池別'
}[poolType] || poolType || '未標示池別');
const trendPoolOrder = poolType => ({ '長池': 0, '短池': 1, '未列池別': 2 }[poolType] ?? 3);
const trendEventGroups = events => {
  const groups = new Map();
  uniqueSorted(events).forEach(event => {
    const { distanceLabel } = trendEventInfo(event);
    if (!groups.has(distanceLabel)) groups.set(distanceLabel, []);
    groups.get(distanceLabel).push(event);
  });
  return [...groups.entries()].sort(([aLabel, aEvents], [bLabel, bEvents]) => {
    const aDistance = trendEventInfo(aEvents[0]).distance;
    const bDistance = trendEventInfo(bEvents[0]).distance;
    return aDistance - bDistance || aLabel.localeCompare(bLabel, 'zh-Hant');
  }).map(([label, groupedEvents]) => [label, groupedEvents.sort((a, b) =>
    trendStrokeOrder(a) - trendStrokeOrder(b) || String(a).localeCompare(String(b), 'zh-Hant')
  )]);
};
const trendDisplayRows = series => series.length > TREND_DISPLAY_LIMIT
  ? series.slice(-TREND_DISPLAY_LIMIT)
  : series;

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
  const fullSeries = trendSeriesByKey.get(key) || [];
  const series = trendDisplayRows(fullSeries);
  const chart = document.getElementById('trendChart');
  if (!chart) return;
  const [selectedEvent, selectedPool] = trendKeyParts(key);
  const selectionSummary = document.getElementById('trendSelectionSummary');
  if (selectionSummary) {
    selectionSummary.innerHTML = `<span>目前趨勢</span><strong>${escapeHtml(trendEventInfo(selectedEvent).distanceLabel)} · ${escapeHtml(trendEventInfo(selectedEvent).stroke)}</strong><strong>${escapeHtml(trendPoolLabel(selectedPool))}</strong>`;
  }
  if (series.length < 2) {
    chart.innerHTML = '<div class="empty trend-empty"><strong>目前還沒有足夠紀錄形成趨勢圖</strong><span>這個項目與池別只有 1 筆有效計時成績；下方仍會列出該筆成績。</span></div>';
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
  const displayHint = fullSeries.length > series.length
    ? `顯示最近 ${series.length} 筆有效計時成績（共 ${fullSeries.length} 筆）`
    : `顯示全部 ${series.length} 筆有效計時成績`;
  chart.innerHTML = `<div class="trend-scroll-hint">${displayHint}，每個節點均標示成績${series.length > 6 ? '，可左右滑動查看' : ''}</div><svg class="trend-chart" style="width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${selectedEvent} ${trendPoolLabel(selectedPool)} 成績趨勢圖`)}">
    <line class="trend-axis" x1="${padding.left}" x2="${width - padding.right}" y1="${height - padding.bottom}" y2="${height - padding.bottom}" />
    ${yGrid}<path class="trend-line" d="${line}" />${points}
    ${xLabels}
  </svg>`;
};

const trendPoolsForEvent = event => [...trendSeriesByKey.keys()]
  .map(trendKeyParts)
  .filter(([candidateEvent]) => candidateEvent === event)
  .map(([, poolType]) => poolType)
  .sort((a, b) => trendPoolOrder(a) - trendPoolOrder(b) || String(a).localeCompare(String(b), 'zh-Hant'));

const latestPoolForEvent = event => {
  const latestEntry = [...trendSeriesByKey.entries()]
    .filter(([key]) => trendKeyParts(key)[0] === event)
    .sort(([, a], [, b]) => String(b.at(-1)?.competition_date || '').localeCompare(String(a.at(-1)?.competition_date || '')))[0];
  return latestEntry ? trendKeyParts(latestEntry[0])[1] : '';
};

const setTrendPoolOptions = (select, event, selectedPool = '') => {
  const pools = trendPoolsForEvent(event);
  select.innerHTML = pools.map(poolType =>
    `<option value="${escapeHtml(poolType)}">${escapeHtml(trendPoolLabel(poolType))}</option>`
  ).join('');
  select.value = pools.includes(selectedPool) ? selectedPool : pools[0] || '';
  select.disabled = pools.length === 0;
};

const renderTrendEventOptions = selectedEvent => trendEventGroups([...trendSeriesByKey.keys()].map(key => trendKeyParts(key)[0]))
  .map(([groupLabel, events]) => `<optgroup label="${escapeHtml(groupLabel)}">${events.map(event =>
    `<option value="${escapeHtml(event)}"${event === selectedEvent ? ' selected' : ''}>${escapeHtml(`${trendEventInfo(event).distanceLabel} · ${trendEventInfo(event).stroke}`)}</option>`
  ).join('')}</optgroup>`).join('');

const bindTrendControls = () => {
  const eventSelect = document.getElementById('trendEventSelect');
  const poolSelect = document.getElementById('trendPoolSelect');
  eventSelect.addEventListener('change', () => {
    const event = eventSelect.value;
    const availablePools = trendPoolsForEvent(event);
    const poolType = availablePools.includes(poolSelect.value) ? poolSelect.value : latestPoolForEvent(event);
    if (event && poolType) activateTrend(trendKey(event, poolType));
  });
  poolSelect.addEventListener('change', () => {
    if (eventSelect.value && poolSelect.value) activateTrend(trendKey(eventSelect.value, poolSelect.value));
  });
};

const renderTrendControls = (swimmerId, swimmerName, selectedKey) => {
  const [selectedEvent, selectedPool] = trendKeyParts(selectedKey);
  const needsMarkup = insightsPanel.dataset.swimmerId !== swimmerId || !document.getElementById('trendEventSelect');
  if (needsMarkup) {
    insightsPanel.innerHTML = `<div class="insight-head">
      <div class="insight-copy"><div class="insight-title">${escapeHtml(swimmerName)}｜成績趨勢</div>
        <div class="insight-sub">依距離分組選擇項目，再選長池或短池；圖表與下方成績會一起更新。</div></div>
      <div class="trend-controls" aria-label="成績趨勢篩選條件">
        <label class="trend-control"><span>項目（距離／泳式）</span><select id="trendEventSelect" aria-label="成績趨勢項目"></select></label>
        <label class="trend-control"><span>池別</span><select id="trendPoolSelect" aria-label="成績趨勢池別"></select></label>
      </div>
    </div><p id="trendSelectionSummary" class="trend-selection" aria-live="polite"></p><div id="trendChart"></div>`;
    insightsPanel.dataset.swimmerId = swimmerId;
    bindTrendControls();
  }
  const eventSelect = document.getElementById('trendEventSelect');
  const poolSelect = document.getElementById('trendPoolSelect');
  eventSelect.innerHTML = renderTrendEventOptions(selectedEvent);
  eventSelect.value = selectedEvent;
  setTrendPoolOptions(poolSelect, selectedEvent, selectedPool);
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
};

const renderInsights = (matches, query) => {
  const names = swimmerNames(matches);
  if (!query || names.length !== 1) {
    insightsPanel.hidden = true;
    insightsPanel.innerHTML = '';
    return;
  }
  // A source may assign multiple IDs to the same displayed swimmer across seasons or pools.
  // The name search is only treated as one swimmer when its visible result name is unambiguous.
  const swimmerName = names[0];
  const swimmerRows = rows.filter(row => swimmerNameKey(row) === swimmerName);
  buildTrendSeries(swimmerRows);
  const options = [...trendSeriesByKey.entries()]
    .filter(([, series]) => series.length > 0)
    .sort(([, a], [, b]) => String(b.at(-1).competition_date || '').localeCompare(String(a.at(-1).competition_date || '')));
  if (!options.length) {
    insightsPanel.hidden = true;
    return;
  }
  const selectedKey = options.some(([key]) => key === activeTrendKey)
    ? activeTrendKey
    : options.find(([key]) => trendKeyParts(key)[0] === eventSelect.value)?.[0] || options[0][0];
  activeTrendKey = selectedKey;
  trendListKey = selectedKey;
  insightsPanel.hidden = false;
  renderTrendControls(swimmerName, swimmerName, selectedKey);
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
  const trendRows = trendListKey && q && swimmerNames(matches).length === 1
    ? trendDisplayRows(trendSeriesByKey.get(trendListKey) || [])
    : null;
  const displayRows = trendRows?.length ? [...trendRows].reverse() : matches;
  const summary = selectionSummary(competitionSelect.value, eventSelect.value);
  const trendSummary = trendRows?.length ? `｜趨勢：${trendKeyParts(trendListKey).join(' · ')}` : '';
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
eventSelect.addEventListener('change', () => search());
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
    if (activeTrendKey) renderTrendChart(activeTrendKey);
  }, 160);
});

async function loadResultSource() {
  const [resultRows, metadata] = await Promise.all([
    fetch('data/swim-results.json', { cache: 'force-cache' }).then(response => {
      if (!response.ok) throw new Error(`成績資料 HTTP ${response.status}`);
      return response.json();
    }),
    fetch('data/swim-results-meta.json', { cache: 'force-cache' }).then(response => response.ok ? response.json() : null)
  ]);
  return { resultRows, metadata };
}

loadResultSource()
  .then(({ resultRows, metadata }) => {
    const params = new URLSearchParams(location.search);
    const initialCompetition = params.get('competition') || '';
    const initialEvent = params.get('event') || '';
    rows = Array.isArray(resultRows) ? resultRows : [];
    buildPerformanceIndex(rows);
    setOptions(competitionSelect, newestCompetitionsFirst(rows), '全部賽事', initialCompetition);
    setOptions(eventSelect, uniqueSorted(rows.map(row => row.event)), '全部項目', initialEvent);
    updatedAt.textContent = formatUpdatedAt(metadata?.synced_at);
    syncedResultCount = rows.length || Number(metadata?.result_count) || 0;
    input.value = params.get('q') || '';
    clearButton.hidden = !input.value && !competitionSelect.value && !eventSelect.value;
    meta.textContent = `${syncedResultCount.toLocaleString('zh-TW')} 筆成績已載入，可直接查詢或用賽事／項目篩選`;
    search();
  })
  .catch(error => {
    meta.textContent = '資料載入失敗';
    updatedAt.textContent = '最後更新時間無法取得';
    list.innerHTML = `<div class="empty">無法載入成績資料：${escapeHtml(error.message)}</div>`;
  });
