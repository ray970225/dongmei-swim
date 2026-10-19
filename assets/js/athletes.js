import { normalizeName } from './swim-format.js';

// The roster is generated from the same public snapshot as the results page,
// so both pages always show the same swimmers and record counts.
const host = document.querySelector('#athleteDirectory');
const search = document.querySelector('#athleteSearch');
const count = document.querySelector('#athleteCount');
const sortButtons = [...document.querySelectorAll('[data-sort]')];
let athletes = [];
let sortMode = 'recent';

// One person can appear under several source IDs (e.g. different seasons); show one row per name.
function mergeByName(roster) {
  const groups = new Map();
  roster.forEach(person => {
    const key = normalizeName(person.name);
    if (!key) return;
    const current = groups.get(key) || { name: String(person.name).trim(), resultCount: 0, latestDate: '' };
    current.resultCount += Number(person.result_count) || 0;
    if (String(person.latest_date || '') > current.latestDate) current.latestDate = String(person.latest_date);
    groups.set(key, current);
  });
  return [...groups.values()];
}

function sorted(list) {
  return [...list].sort(sortMode === 'recent'
    ? (a, b) => b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name, 'zh-Hant')
    : (a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
}

function render() {
  const query = normalizeName(search.value).toLocaleLowerCase();
  const matches = sorted(athletes.filter(athlete => normalizeName(athlete.name).toLocaleLowerCase().includes(query)));
  count.textContent = query ? `找到 ${matches.length} 位選手` : `共 ${matches.length} 位選手`;
  host.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('p'); empty.className = 'empty';
    empty.textContent = '目前沒有符合的選手。'; host.append(empty); return;
  }
  const fragment = document.createDocumentFragment();
  matches.forEach((athlete, index) => {
    const link = document.createElement('a'); link.className = 'athlete-directory-row';
    link.href = `athlete.html?name=${encodeURIComponent(athlete.name)}`;
    const number = document.createElement('span'); number.className = 'directory-index'; number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span'); name.className = 'directory-name'; name.textContent = athlete.name;
    const meta = document.createElement('span'); meta.className = 'directory-meta';
    meta.textContent = [athlete.latestDate && `最近出賽 ${athlete.latestDate}`, `${athlete.resultCount} 筆成績`].filter(Boolean).join(' · ');
    const arrow = document.createElement('span'); arrow.className = 'directory-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '↗';
    link.append(number, name, meta, arrow); fragment.append(link);
  });
  host.append(fragment);
}

sortButtons.forEach(button => button.addEventListener('click', () => {
  sortMode = button.dataset.sort;
  sortButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  render();
}));
search.addEventListener('input', render);

fetch('data/swim-athletes.json')
  .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
  .then(roster => { athletes = mergeByName(Array.isArray(roster) ? roster : []); render(); })
  .catch(error => {
    console.error(error); host.replaceChildren();
    const message = document.createElement('p'); message.className = 'empty'; message.textContent = '選手資料暫時無法載入，請稍後再試。'; host.append(message);
  });
