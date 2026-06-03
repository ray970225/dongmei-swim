import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STATE_FILE = new URL('./.auth/swim-state.json', import.meta.url);
const OUT_DIR = new URL('./output/', import.meta.url);
const statePath = fileURLToPath(STATE_FILE);

const TARGET_TERMS = ['高雄市新莊高中', '東美泳隊', '大仁國中'];
const TARGET_TEAM_KEYWORDS = [
  '高雄市新莊高中',
  '新莊高中',
  '高市新莊',
  '新莊HCHS',
  '東美泳隊',
  '高雄市東美泳隊',
  '東美大仁',
  '大仁國中',
  '高雄市大仁國中'
];

const PAGE_LIMIT = 50;
const RESULT_LIMIT = 20;
const REQUEST_DELAY_MS = 450;

if (!existsSync(statePath)) {
  console.error('找不到登入 session。請先執行：npm run swim:login');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--disable-blink-features=AutomationControlled']
});

const context = await browser.newContext({
  storageState: statePath,
  locale: 'zh-TW'
});
const page = await context.newPage();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const includesAny = (value, keywords) => {
  const text = Array.isArray(value) ? value.join(' ') : String(value || '');
  return keywords.some(keyword => text.includes(keyword));
};

async function apiGet(path) {
  const result = await page.evaluate(async url => {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text
    };
  }, `https://swim.orz.tw${path}`);

  if (!result.ok) {
    throw new Error(`API ${path} failed: ${result.status} ${result.text.slice(0, 160)}`);
  }
  return result.text ? JSON.parse(result.text) : {};
}

await page.goto('https://swim.orz.tw/search', { waitUntil: 'domcontentloaded' });

const swimmersById = new Map();

for (const term of TARGET_TERMS) {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const query = `/api/swimmers?q=${encodeURIComponent(term)}&limit=${PAGE_LIMIT}&offset=${offset}&region=TW`;
    console.log(`同步選手：${term} offset=${offset}`);
    const payload = await apiGet(query);
    const swimmers = payload.data || [];

    for (const swimmer of swimmers) {
      const relatedTeams = [
        swimmer.latest_team,
        ...(swimmer.recent_teams || [])
      ];
      if (includesAny(relatedTeams, TARGET_TEAM_KEYWORDS)) {
        const existing = swimmersById.get(swimmer.id) || {};
        swimmersById.set(swimmer.id, {
          ...existing,
          ...swimmer,
          matched_terms: [...new Set([...(existing.matched_terms || []), term])],
          matched_teams: [...new Set([...(existing.matched_teams || []), ...relatedTeams.filter(Boolean)])]
        });
      }
    }

    hasMore = Boolean(payload.has_more) && swimmers.length > 0;
    offset += PAGE_LIMIT;
    await sleep(REQUEST_DELAY_MS);
  }
}

const swimmers = [...swimmersById.values()]
  .sort((a, b) => (b.results_count || 0) - (a.results_count || 0));

const results = [];
for (const [index, swimmer] of swimmers.entries()) {
  console.log(`同步成績 ${index + 1}/${swimmers.length}：${swimmer.name}`);
  const payload = await apiGet(`/api/results?swimmer_id=${encodeURIComponent(swimmer.id)}&limit=${RESULT_LIMIT}&offset=0&sort=date_desc`);
  for (const result of payload.data || []) {
    if (!includesAny(result.team, TARGET_TEAM_KEYWORDS)) continue;
    results.push({
      id: result.id,
      swimmer_id: swimmer.id,
      swimmer: swimmer.name,
      swimmer_en: swimmer.name_en,
      gender: swimmer.gender,
      birth_year: swimmer.birth_year,
      team: result.team,
      event: result.event?.name || result.event_name || '',
      competition: result.competition_name,
      competition_date: result.competition_date,
      rank: result.rank,
      time: result.time,
      time_milliseconds: result.time_milliseconds,
      pool_type: result.pool_type,
      round: result.round,
      age_group: result.age_group?.name || '',
      source: result.source || 'Swim Insights',
      source_file: result.source_file || '',
      synced_at: new Date().toISOString()
    });
  }
  await sleep(REQUEST_DELAY_MS);
}

const snapshot = {
  version: 1,
  source: 'Swim Insights / 游泳成績通',
  synced_at: new Date().toISOString(),
  target_terms: TARGET_TERMS,
  target_team_keywords: TARGET_TEAM_KEYWORDS,
  swimmer_count: swimmers.length,
  result_count: results.length,
  swimmers,
  results
};

await writeFile(new URL('./swimmers.json', OUT_DIR), JSON.stringify(swimmers, null, 2), 'utf8');
await writeFile(new URL('./results.json', OUT_DIR), JSON.stringify(results, null, 2), 'utf8');
await writeFile(new URL('./snapshot.json', OUT_DIR), JSON.stringify(snapshot, null, 2), 'utf8');

await browser.close();

console.log(`完成：${swimmers.length} 位選手，${results.length} 筆近期成績。`);
