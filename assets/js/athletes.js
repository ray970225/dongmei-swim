import { getSupabase, isSupabaseConfigured } from './supabase-client.js';

const host = document.querySelector('#athleteDirectory');
const search = document.querySelector('#athleteSearch');
let athletes = [];

function normalizeName(value) {
  return String(value || '').normalize('NFKC').replace(/[\s　]+/g, '').trim();
}

function mergeAthletes(rows) {
  const groups = new Map();
  rows.filter(athlete => athlete.source_swimmer_id).forEach(athlete => {
    const key = normalizeName(athlete.full_name);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(athlete);
  });
  return [...groups.values()].map(group => {
    const distinct = field => [...new Set(group.map(athlete => String(athlete[field] || '').trim()).filter(Boolean))];
    const years = distinct('birth_year');
    const englishNames = distinct('english_name');
    const genders = distinct('gender');
    return {
      full_name: group[0].full_name.trim(),
      english_name: englishNames.length === 1 ? englishNames[0] : '',
      gender: genders.length === 1 ? genders[0] : '',
      birth_year: years.length === 1 ? years[0] : '',
      birth_year_conflict: years.length > 1,
      source_swimmer_ids: group.map(athlete => athlete.source_swimmer_id),
      athlete_ids: group.map(athlete => athlete.id).filter(Boolean)
    };
  }).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'zh-Hant'));
}

function render() {
  const query = search.value.trim().toLocaleLowerCase();
  const matches = athletes.filter(athlete => `${athlete.full_name} ${athlete.english_name || ''}`.toLocaleLowerCase().includes(query));
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
    meta.textContent = [athlete.english_name, athlete.gender, athlete.birth_year_conflict ? '出生年份來源不一致' : (athlete.birth_year ? `${athlete.birth_year} 年生` : '')].filter(Boolean).join(' · ');
    const arrow = document.createElement('span'); arrow.className = 'directory-arrow'; arrow.textContent = '↗';
    link.append(number, name, meta, arrow); host.append(link);
  });
}

async function load() {
  if (isSupabaseConfigured()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.from('athletes')
      .select('id,source_swimmer_id,full_name,english_name,gender,birth_year').eq('active', true).order('full_name');
    if (error) throw error;
    athletes = mergeAthletes(data || []);
  } else {
    const response = await fetch('data/swim-results.json');
    if (!response.ok) throw new Error('公開成績資料載入失敗。');
    const rows = await response.json();
    const unique = new Map();
    rows.forEach(row => {
      if (!row.swimmer_id || unique.has(row.swimmer_id)) return;
      unique.set(row.swimmer_id, {
        id: row.swimmer_id,
        source_swimmer_id: row.swimmer_id,
        full_name: row.swimmer,
        english_name: row.swimmer_en,
        gender: row.gender,
        birth_year: row.birth_year
      });
    });
    athletes = mergeAthletes([...unique.values()]);
  }
  render();
}

search.addEventListener('input', render);
void load().catch(error => {
  console.error(error); host.replaceChildren();
  const message = document.createElement('p'); message.className = 'empty'; message.textContent = '選手資料暫時無法載入，請稍後再試。'; host.append(message);
});
