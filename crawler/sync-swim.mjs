import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAutomaticHonours } from './honours.mjs';

const ROOT = new URL('../', import.meta.url);
const STATE_FILE = new URL('./.auth/swim-state.json', import.meta.url);
const CONFIG_FILE = new URL('./swim-config.json', import.meta.url);
const DATA_FILE = new URL('./data/swim-results.json', ROOT);
const META_FILE = new URL('./data/swim-results-meta.json', ROOT);
const HONOURS_FILE = new URL('./data/swim-honours.json', ROOT);
const SYNC_STATUS_FILE = new URL('./data/swim-sync-status.json', ROOT);
const statePath = fileURLToPath(STATE_FILE);
const syncStartedAt = new Date();

if (process.env.SWIM_SOURCE_AUTOMATION_AUTHORIZED !== 'true') {
  throw new Error('成績來源尚未授權自動擷取；請勿執行 crawler，改用核准的匯出資料。');
}
const { chromium } = await import('playwright');

const DEFAULT_CONFIG = {
  searchTerms: ['高雄市新莊高中', '東美泳隊', '大仁國中'],
  teamKeywords: ['高雄市新莊高中', '新莊高中', '高市新莊', '新莊HCHS', '東美泳隊', '高雄市東美泳隊', '東美大仁', '大仁國中', '高雄市大仁國中'],
  pageSize: 100,
  requestDelayMs: 500
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const unique = values => [...new Set(values.filter(Boolean))];
const includesAny = (value, keywords) => {
  const text = Array.isArray(value) ? value.join(' ') : String(value || '');
  return keywords.some(keyword => text.includes(keyword));
};

async function loadConfig() {
  if (!existsSync(fileURLToPath(CONFIG_FILE))) return DEFAULT_CONFIG;
  const configured = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
  return {
    ...DEFAULT_CONFIG,
    ...configured,
    pageSize: Math.min(100, Math.max(1, Number(configured.pageSize || DEFAULT_CONFIG.pageSize))),
    requestDelayMs: Math.max(0, Number(configured.requestDelayMs ?? DEFAULT_CONFIG.requestDelayMs))
  };
}

async function writeJsonAtomically(url, value) {
  const target = fileURLToPath(url);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, target);
}

async function readJsonIfExists(url, fallback) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function restoreSessionFromEnvironment() {
  if (existsSync(statePath)) return;
  const encodedState = process.env.SWIM_STORAGE_STATE_BASE64;
  if (!encodedState) throw new Error('找不到登入 session。請先執行 npm run swim:login，或設定 SWIM_STORAGE_STATE_BASE64。');
  await mkdir(new URL('./.auth/', import.meta.url), { recursive: true });
  await writeFile(statePath, Buffer.from(encodedState, 'base64').toString('utf8'), 'utf8');
}

async function fetchAllPages(apiGet, path, pageSize, delayMs) {
  const records = [];
  let offset = 0;
  for (;;) {
    const separator = path.includes('?') ? '&' : '?';
    const payload = await apiGet(`${path}${separator}limit=${pageSize}&offset=${offset}`);
    const page = Array.isArray(payload.data) ? payload.data : [];
    records.push(...page);
    if (!payload.has_more || page.length === 0) break;
    offset += page.length;
    await sleep(delayMs);
  }
  return records;
}

const config = await loadConfig();
await restoreSessionFromEnvironment();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--disable-blink-features=AutomationControlled']
});

try {
  const context = await browser.newContext({ storageState: statePath, locale: 'zh-TW' });
  const page = await context.newPage();
  await page.goto('https://swim.orz.tw/search', { waitUntil: 'domcontentloaded' });

  async function apiGet(path) {
    const result = await page.evaluate(async url => {
      const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      return { ok: response.ok, status: response.status, text: await response.text() };
    }, `https://swim.orz.tw${path}`);
    if (!result.ok) throw new Error(`API ${path} failed: ${result.status} ${result.text.slice(0, 160)}`);
    return result.text ? JSON.parse(result.text) : {};
  }

  const swimmersById = new Map();
  for (const term of config.searchTerms) {
    console.log(`搜尋選手：${term}`);
    const swimmers = await fetchAllPages(apiGet, `/api/swimmers?q=${encodeURIComponent(term)}&region=TW`, config.pageSize, config.requestDelayMs);
    for (const swimmer of swimmers) {
      const relatedTeams = unique([swimmer.latest_team, ...(swimmer.recent_teams || [])]);
      if (!includesAny(relatedTeams, config.teamKeywords)) continue;
      const previous = swimmersById.get(swimmer.id) || {};
      swimmersById.set(swimmer.id, {
        ...previous,
        ...swimmer,
        matched_terms: unique([...(previous.matched_terms || []), term]),
        matched_teams: unique([...(previous.matched_teams || []), ...relatedTeams])
      });
    }
    await sleep(config.requestDelayMs);
  }

  const swimmers = [...swimmersById.values()].sort((a, b) => (b.results_count || 0) - (a.results_count || 0));
  const resultsById = new Map();
  for (const [index, swimmer] of swimmers.entries()) {
    console.log(`同步成績 ${index + 1}/${swimmers.length}：${swimmer.name}`);
    const sourceResults = await fetchAllPages(apiGet, `/api/results?swimmer_id=${encodeURIComponent(swimmer.id)}&sort=date_desc`, config.pageSize, config.requestDelayMs);
    for (const result of sourceResults) {
      if (!includesAny(result.team, config.teamKeywords)) continue;
      const id = result.id || `${swimmer.id}-${result.competition_date}-${result.event?.name || result.event_name}-${result.time}`;
      resultsById.set(id, {
        id, swimmer_id: swimmer.id, swimmer: swimmer.name, swimmer_en: swimmer.name_en || '',
        gender: swimmer.gender || '', birth_year: swimmer.birth_year || null, team: result.team || '',
        event: result.event?.name || result.event_name || '', competition: result.competition_name || '',
        competition_date: result.competition_date || '', rank: result.rank ?? null, time: result.time || '',
        time_milliseconds: result.time_milliseconds ?? null, pool_type: result.pool_type || '', round: result.round || '',
        age_group: result.age_group?.name || '', source: result.source || 'Swim Insights', source_file: result.source_file || ''
      });
    }
    await sleep(config.requestDelayMs);
  }

  const syncedAt = new Date().toISOString();
  const previousResults = await readJsonIfExists(DATA_FILE, []);
  const previousIds = new Set(Array.isArray(previousResults) ? previousResults.map(result => result.id) : []);
  const results = [...resultsById.values()].map(result => ({ ...result, synced_at: syncedAt }))
    .sort((a, b) => String(b.competition_date).localeCompare(String(a.competition_date)));
  const automaticHonours = createAutomaticHonours(results, syncedAt);
  const metadata = {
    version: 2, source: '游泳成績通', synced_at: syncedAt,
    swimmer_count: swimmers.length, result_count: results.length,
    automatic_honours_count: automaticHonours.length,
    search_terms: config.searchTerms, team_keywords: config.teamKeywords
  };
  const previousStatus = await readJsonIfExists(SYNC_STATUS_FILE, { history: [] });
  const summary = {
    status: 'success',
    synced_at: syncedAt,
    swimmer_count: swimmers.length,
    result_count: results.length,
    new_result_count: results.filter(result => !previousIds.has(result.id)).length,
    automatic_honours_count: automaticHonours.length,
    duration_seconds: Math.max(0, Math.round((Date.now() - syncStartedAt.getTime()) / 1000)),
    source: '游泳成績通'
  };
  const history = [summary, ...(Array.isArray(previousStatus.history) ? previousStatus.history : [])]
    .slice(0, 20);
  const syncStatus = {
    version: 1,
    last_success_at: syncedAt,
    ...summary,
    history
  };

  // 僅在所有 API 請求成功後才取代網站資料，避免失敗時把有效資料清空。
  await mkdir(new URL('./data/', ROOT), { recursive: true });
  await writeJsonAtomically(DATA_FILE, results);
  await writeJsonAtomically(HONOURS_FILE, automaticHonours);
  await writeJsonAtomically(META_FILE, metadata);
  await writeJsonAtomically(SYNC_STATUS_FILE, syncStatus);
  console.log(`完成：${swimmers.length} 位選手，${results.length} 筆成績，${automaticHonours.length} 張榮譽卡；更新時間 ${syncedAt}`);
} finally {
  await browser.close();
}
