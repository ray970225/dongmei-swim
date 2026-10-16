import { getSupabase, isSupabaseConfigured } from './supabase-client.js';

const host = document.querySelector('#athleteDirectory');
const search = document.querySelector('#athleteSearch');
let athletes = [];

function normalizeName(value) {
  return String(value || '').normalize('NFKC').replace(/[\s　]+/g, '').trim();
}

function isNetworkUnavailable(error) {
  const detail = [error?.name, error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase();
  return error instanceof TypeError || /typeerror|failed to fetch|fetch failed|networkerror|network error|load failed|timeout/.test(detail);
}

function mergeAthletes(rows) {
  const groups = new Map();
  rows.filter(athlete => athlete.source_swimmer_id || athlete.id).forEach(athlete => {
    const key = normalizeName(athlete.full_name || athlete.name);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...athlete, source_swimmer_id: athlete.source_swimmer_id || athlete.id });
  });
  return [...groups.values()].map(group => {
    return {
      full_name: String(group[0].full_name || group[0].name || '').trim(),
      athlete_ids: group.map(athlete => athlete.id).filter(Boolean)
    };
  }).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'zh-Hant'));
}

function render() {
  const query = search.value.trim().toLocaleLowerCase();
  const matches = athletes.filter(athlete => athlete.full_name.toLocaleLowerCase().includes(query));
  document.querySelector('#athleteCount').textContent = query ? `找到 ${matches.length} 位選手` : `共 ${matches.length} 位選手`;
  host.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement('p'); empty.className = 'empty';
    empty.textContent = '目前沒有符合的公開選手資料。'; host.append(empty); return;
  }
  matches.forEach((athlete, index) => {
    const link = document.createElement('a'); link.className = 'athlete-directory-row';
    link.href = `athlete.html?name=${encodeURIComponent(athlete.full_name)}`;
    const number = document.createElement('span'); number.className = 'directory-index'; number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span'); name.className = 'directory-name'; name.textContent = athlete.full_name;
    const meta = document.createElement('span'); meta.className = 'directory-meta';
    meta.textContent = '公開成績與個人趨勢';
    const arrow = document.createElement('span'); arrow.className = 'directory-arrow'; arrow.textContent = '↗';
    link.append(number, name, meta, arrow); host.append(link);
  });
}

async function load() {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.from('athletes')
        .select('id,source_swimmer_id,full_name,active').eq('active', true).order('full_name');
      if (error) throw error;
      athletes = mergeAthletes(data || []);
      render();
      return;
    } catch (error) {
      // The static roster contains only the same public records published with the site.
      // Use it only when the proxy is unreachable; keep authorization and query errors visible.
      if (!isNetworkUnavailable(error)) throw error;
      console.warn('選手名單使用公開快照：資料庫代理暫時無法連線。');
    }
  }
  const response = await fetch('data/swim-athletes.json');
  if (!response.ok) throw new Error('公開成績資料載入失敗。');
  const roster = await response.json();
  athletes = mergeAthletes((Array.isArray(roster) ? roster : []).map(person => ({
    id: person.id,
    source_swimmer_id: person.id,
    full_name: person.name
  })));
  render();
}

search.addEventListener('input', render);
void load().catch(error => {
  console.error(error); host.replaceChildren();
  const message = document.createElement('p'); message.className = 'empty'; message.textContent = '選手資料暫時無法載入，請稍後再試。'; host.append(message);
});
