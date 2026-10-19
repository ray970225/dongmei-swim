import { splitSegments, formatSplitTime } from './split-times.js';
import { decodeRows } from './result-data.js';
import { normalizeName, formatTime, compareEvents, poolOrder } from './swim-format.js';

// The profile reads the same public snapshot as the results page (one source of truth).
const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const requestedId = params.get('swimmer_id') || '';
const requestedName = params.get('name') || '';
const NO_POOL = '池別未列';
let selectedEvent = '';
let selectedPool = '';

const fetchJson = async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
};
const byDate = (a, b) => String(a.competition_date || '').localeCompare(String(b.competition_date || '')) || String(a.id).localeCompare(String(b.id));
const groupKey = (event, pool) => `${event}\u0001${pool}`;
const keyParts = key => key.split('\u0001');
const timeOf = row => row.time || formatTime(Number(row.time_milliseconds));
const meetOf = row => row.competition || '賽事名稱未列';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setState(title, detail) {
  $('#athleteState').hidden = false;
  $('#athleteState h1').textContent = title;
  $('#athleteState p:not(.eyebrow)').textContent = detail;
  $('#athleteContent').hidden = true;
}

// Same-name source IDs are merged: the source may split one swimmer across seasons.
async function loadRows() {
  const roster = await fetchJson('data/swim-athletes.json');
  const targetName = requestedName || roster.find(person => String(person.id) === requestedId)?.name || '';
  const people = roster.filter(person => normalizeName(person.name) === normalizeName(targetName));
  if (!people.length) return { name: '', rows: [] };
  const ids = new Set(people.map(person => String(person.id)));
  const shards = [...new Set(people.map(person => String(person.shard).padStart(2, '0')))];
  const payloads = await Promise.all(shards.map(shard => fetchJson(`data/swim-athlete-shards/${shard}.json`)));
  const rows = payloads.flatMap(decodeRows)
    .filter(row => ids.has(String(row.swimmer_id)) && normalizeName(row.swimmer) === normalizeName(targetName))
    .map(row => ({ ...row, pool_type: row.pool_type || NO_POOL }));
  return { name: String(people[0].name).trim(), rows };
}

function eventGroups(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const key = groupKey(row.event, row.pool_type);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  groups.forEach(list => list.sort(byDate));
  return groups;
}

const compareKeys = (a, b) => {
  const [eventA, poolA] = keyParts(a); const [eventB, poolB] = keyParts(b);
  return compareEvents(eventA, eventB) || poolOrder(poolA) - poolOrder(poolB);
};
const fastest = list => list.reduce((best, row) => Number(row.time_milliseconds) < Number(best.time_milliseconds) ? row : best);

function option(value, label = value) {
  const node = element('option', '', label); node.value = value; return node;
}

function fillFilters(groups) {
  const keys = [...groups.keys()].sort(compareKeys);
  const events = [...new Set(keys.map(key => keyParts(key)[0]))];
  if (!events.includes(selectedEvent)) selectedEvent = events[0] || '';
  $('#eventFilter').replaceChildren(...events.map(event => option(event)));
  $('#eventFilter').value = selectedEvent;
  const pools = keys.filter(key => keyParts(key)[0] === selectedEvent).map(key => keyParts(key)[1]);
  if (!pools.includes(selectedPool)) selectedPool = pools[0] || '';
  $('#poolFilter').replaceChildren(...pools.map(pool => option(pool)));
  $('#poolFilter').value = selectedPool;
}

function renderHeroBest(groups) {
  const rows = groups.get(groupKey(selectedEvent, selectedPool)) || [];
  if (!rows.length) return;
  $('#bestEvent').textContent = `${selectedEvent} · ${selectedPool}`;
  $('#bestTime').textContent = timeOf(fastest(rows));
  $('#bestLabel').textContent = '所選項目個人最佳';
}

function renderBests(groups, onSelect) {
  const host = $('#eventBests'); host.replaceChildren();
  [...groups.keys()].sort(compareKeys).forEach(key => {
    const [event, pool] = keyParts(key);
    const best = fastest(groups.get(key));
    const button = element('button', 'event-best');
    button.type = 'button';
    button.dataset.key = key;
    button.setAttribute('aria-label', `查看 ${event}、${pool} 趨勢，項目最佳 ${timeOf(best)}`);
    button.append(element('span', '', `${event} · ${pool}`), element('strong', '', timeOf(best)));
    button.addEventListener('click', () => onSelect(event, pool));
    host.append(button);
  });
}

function markSelectedBest() {
  document.querySelectorAll('.event-best').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.key === groupKey(selectedEvent, selectedPool)));
  });
}

function renderTrend(groups) {
  const rows = groups.get(groupKey(selectedEvent, selectedPool)) || [];
  const chart = $('#trendChart'); chart.replaceChildren();
  const summary = $('#progressSummary'); summary.replaceChildren();
  $('#trendHint').hidden = true;
  if (!rows.length) { chart.textContent = '目前沒有可繪製的計時成績。'; return; }
  if (rows.length === 1) {
    chart.append(element('p', 'single-point', `${timeOf(rows[0])} · ${rows[0].competition_date || ''}（只有 1 筆成績，尚無趨勢）`));
  } else {
    const mobile = matchMedia('(max-width: 700px)').matches;
    const width = Math.max(mobile ? 340 : 900, 210 + rows.length * (mobile ? 65 : 84));
    const height = mobile ? 260 : 330;
    const pad = { left: mobile ? 60 : 82, right: 28, top: 38, bottom: 45 };
    const times = rows.map(row => Number(row.time_milliseconds));
    const min = Math.min(...times); const max = Math.max(...times); const span = Math.max(max - min, 1000);
    const low = min - span * .24; const high = max + span * .24;
    const x = i => pad.left + i * (width - pad.left - pad.right) / (rows.length - 1);
    const y = value => pad.top + (high - value) * (height - pad.top - pad.bottom) / (high - low);
    const ns = 'http://www.w3.org/2000/svg';
    const svgNode = (tag, attrs, text) => {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': `${selectedEvent} ${selectedPool} 成績趨勢` });
    [0, .5, 1].forEach(ratio => {
      const value = high - (high - low) * ratio;
      svg.append(svgNode('line', { x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value), class: 'athlete-grid' }));
      svg.append(svgNode('text', { x: pad.left - 8, y: y(value) + 4, 'text-anchor': 'end', class: 'athlete-chart-label' }, formatTime(value)));
    });
    svg.append(svgNode('path', { class: 'athlete-trend-line', d: rows.map((row, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(Number(row.time_milliseconds))}`).join(' ') }));
    const bestTime = Math.min(...times);
    rows.forEach((row, i) => {
      const isBest = Number(row.time_milliseconds) === bestTime;
      const circle = svgNode('circle', { cx: x(i), cy: y(Number(row.time_milliseconds)), r: mobile ? 5 : 6, class: `athlete-point${isBest ? ' is-best' : ''}` });
      circle.append(svgNode('title', {}, `${row.competition_date || ''} · ${meetOf(row)} · ${timeOf(row)}`));
      svg.append(circle);
      svg.append(svgNode('text', { x: x(i), y: y(Number(row.time_milliseconds)) - 12, 'text-anchor': 'middle', class: 'athlete-point-value' }, timeOf(row)));
      svg.append(svgNode('text', { x: x(i), y: height - 12, 'text-anchor': 'middle', class: 'athlete-chart-label' }, String(row.competition_date || '').slice(2, 7).replace('-', '/')));
    });
    chart.append(svg);
    $('#trendHint').hidden = !mobile || width <= chart.clientWidth;
  }
  const bestByYear = new Map();
  rows.forEach(row => {
    const year = String(row.competition_date || '').slice(0, 4);
    if (!year) return;
    const old = bestByYear.get(year);
    if (!old || Number(row.time_milliseconds) < Number(old.time_milliseconds)) bestByYear.set(year, row);
  });
  const years = [...bestByYear.keys()].sort();
  if (years.length > 1) {
    const delta = Number(bestByYear.get(years.at(-1)).time_milliseconds) - Number(bestByYear.get(years[0]).time_milliseconds);
    const track = element('div', 'year-bests');
    years.forEach(year => track.append(element('span', '', `${year}  ${timeOf(bestByYear.get(year))}`)));
    summary.append(
      element('span', '', `${years[0]} → ${years.at(-1)} 年度最佳`),
      element('strong', delta <= 0 ? 'is-faster' : 'is-slower', `${delta <= 0 ? '快' : '慢'} ${formatTime(Math.abs(delta))}`),
      track
    );
  }
}

function listRow(date, info, value) {
  const item = element('div', 'recent-row');
  item.append(element('time', '', date), element('span', '', info), element('strong', '', value));
  return item;
}

function renderRecent(rows) {
  const newest = [...rows].sort((a, b) => byDate(b, a));
  const comparable = newest.filter(row => row.event === selectedEvent && row.pool_type === selectedPool).slice(0, 5);
  const average = comparable.length ? comparable.reduce((sum, row) => sum + Number(row.time_milliseconds), 0) / comparable.length : null;
  $('#recentAverage').textContent = average ? `${selectedEvent} · 最近 ${comparable.length} 筆平均 ${formatTime(average)}` : '';
  $('#recentResults').replaceChildren(...newest.slice(0, 5).map(row =>
    listRow(row.competition_date || '', `${row.event} · ${row.pool_type} · ${meetOf(row)}`, timeOf(row))));
}

function renderMeetHistory(rows) {
  const meets = new Map();
  rows.forEach(row => {
    const key = `${row.competition_date || ''}|${meetOf(row)}`;
    meets.set(key, (meets.get(key) || 0) + 1);
  });
  $('#meetHistory').replaceChildren(...[...meets.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, total]) => listRow(key.split('|')[0], key.split('|')[1], `${total} 項成績`)));
}

function renderSplits(rows) {
  const visible = rows.filter(row => splitSegments(row.splits, row.time_milliseconds).length > 1)
    .sort((a, b) => byDate(b, a)).slice(0, 12);
  if (!visible.length) return;
  $('#splitSection').hidden = false;
  const host = $('#splitChart'); host.replaceChildren();
  visible.forEach(row => {
    const item = element('details', 'split-row');
    const grid = element('div', 'athlete-split-grid');
    const heading = element('div', 'athlete-split-heading');
    ['距離', '累計', '單段'].forEach(label => heading.append(element('span', '', label)));
    grid.append(heading);
    splitSegments(row.splits, row.time_milliseconds).forEach(point => {
      const line = element('div', 'athlete-split-line');
      line.append(element('span', '', `${point.distance}m`), element('strong', '', formatSplitTime(point.milliseconds)), element('span', '', formatSplitTime(point.segmentMilliseconds)));
      grid.append(line);
    });
    item.append(element('summary', '', `${row.competition_date || ''} · ${row.event || ''} · ${meetOf(row)}`), grid);
    host.append(item);
  });
}

async function start() {
  if (!requestedId && !requestedName) { setState('請從選手名單選擇選手', '此頁顯示公開比賽成績整理出的個人紀錄。'); return; }
  const { name, rows: allRows } = await loadRows();
  if (!name) { setState('找不到選手資料', '此選手尚無公開成績。'); return; }
  const rows = allRows.filter(row => Number(row.time_milliseconds) > 0);
  if (!rows.length) { setState('目前沒有可用的計時成績', '紀錄中沒有有效計時資料，暫時無法整理個人最佳與趨勢。'); return; }

  document.title = `${name}｜選手紀錄｜東美游泳隊`;
  $('#athleteState').hidden = true; $('#athleteContent').hidden = false;
  $('#athleteName').textContent = name;
  const newest = [...rows].sort((a, b) => byDate(b, a));
  const firstYear = String(newest.at(-1).competition_date || '').slice(0, 4);
  const lastYear = String(newest[0].competition_date || '').slice(0, 4);
  $('#athleteMeta').textContent = [newest[0].team, firstYear && (firstYear === lastYear ? `${firstYear} 年出賽` : `${firstYear}–${lastYear} 年出賽`)].filter(Boolean).join(' · ');
  $('#resultCount').textContent = `${rows.length} 筆有效紀錄`;
  const resultsLink = $('#athleteResultsLink');
  if (resultsLink) resultsLink.href = `results.html?q=${encodeURIComponent(name)}`;

  const groups = eventGroups(rows);
  selectedEvent = newest[0].event;
  selectedPool = newest[0].pool_type;
  const refresh = () => { fillFilters(groups); markSelectedBest(); renderHeroBest(groups); renderTrend(groups); renderRecent(rows); };
  renderBests(groups, (event, pool) => {
    selectedEvent = event; selectedPool = pool; refresh();
    $('#trendChart').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  });
  refresh();
  renderMeetHistory(rows);
  renderSplits(rows);
  $('#eventFilter').addEventListener('change', () => { selectedEvent = $('#eventFilter').value; selectedPool = ''; refresh(); });
  $('#poolFilter').addEventListener('change', () => { selectedPool = $('#poolFilter').value; refresh(); });
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => renderTrend(groups), 160); });
}

void start().catch(error => { console.error(error); setState('選手資料載入失敗', '請重新整理後再試。'); });
