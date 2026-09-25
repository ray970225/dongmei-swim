import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createAutomaticHonours } from './honours.mjs';

const root = new URL('../', import.meta.url);
const dataDirectory = process.env.TMSC_DATA_DIR || fileURLToPath(new URL('./data/', root));
const resultsPath = join(dataDirectory, 'swim-results.json');
const metadataPath = join(dataDirectory, 'swim-results-meta.json');
const honoursPath = join(dataDirectory, 'swim-honours.json');
const syncStatusPath = join(dataDirectory, 'swim-sync-status.json');
const endpoint = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const batchSize = 200;

if (!endpoint || !serviceKey) {
  throw new Error('請設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY；不可將 service role key 放入前端。');
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json'
};
async function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}
const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);

async function request(path, options = {}) {
  const response = await fetch(`${endpoint}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status} ${path}: ${body.slice(0, 700)}`);
  return body ? JSON.parse(body) : [];
}

async function chunks(items, operation) {
  for (let offset = 0; offset < items.length; offset += batchSize) {
    await operation(items.slice(offset, offset + batchSize));
  }
}

async function upsert(table, rows, conflictColumn) {
  if (!rows.length) return [];
  const query = new URLSearchParams({ on_conflict: conflictColumn });
  return request(`${table}?${query}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows)
  });
}

const sourceRows = JSON.parse(await readFile(resultsPath, 'utf8'));
if (!Array.isArray(sourceRows) || sourceRows.length === 0) throw new Error('成績快照是空的，停止匯入。');
const uniqueRows = new Map();
let duplicateCount = 0;
for (const row of sourceRows) {
  if (!row.id || !row.swimmer_id || !row.swimmer || !row.event) {
    throw new Error(`缺少必要欄位：${JSON.stringify(row).slice(0, 300)}`);
  }
  if (uniqueRows.has(String(row.id))) duplicateCount += 1;
  uniqueRows.set(String(row.id), row);
}

const athleteRows = new Map();
const meetRows = new Map();
for (const row of uniqueRows.values()) {
  const swimmerId = String(row.swimmer_id);
  athleteRows.set(swimmerId, {
    source_swimmer_id: swimmerId,
    full_name: row.swimmer,
    english_name: row.swimmer_en || null,
    gender: row.gender || null,
    birth_year: row.birth_year !== null && row.birth_year !== '' && Number.isInteger(Number(row.birth_year))
      ? Number(row.birth_year) : null
  });
  const meetKey = `${row.competition || '未命名賽事'}|${row.competition_date || ''}`;
  meetRows.set(meetKey, {
    source_key: meetKey,
    name: row.competition || '未命名賽事',
    start_date: validDate(row.competition_date),
    end_date: validDate(row.competition_date)
  });
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : null;
}

const athleteIdBySource = new Map();
const athleteVisibilityById = new Map();
await chunks([...athleteRows.values()], async batch => {
  for (const record of await upsert('athletes', batch, 'source_swimmer_id')) {
    athleteIdBySource.set(String(record.source_swimmer_id), record.id);
    athleteVisibilityById.set(record.id, record.visibility);
  }
});
if (athleteIdBySource.size !== athleteRows.size) throw new Error(`選手匯入不完整：${athleteIdBySource.size}/${athleteRows.size}`);

const meetIdBySource = new Map();
await chunks([...meetRows.values()], async batch => {
  for (const record of await upsert('meets', batch, 'source_key')) {
    meetIdBySource.set(record.source_key, record.id);
  }
});
if (meetIdBySource.size !== meetRows.size) throw new Error(`賽事匯入不完整：${meetIdBySource.size}/${meetRows.size}`);

const resultRows = [...uniqueRows.values()].map(row => {
  const meetKey = `${row.competition || '未命名賽事'}|${row.competition_date || ''}`;
  const sourceRecord = { ...row };
  delete sourceRecord.synced_at;
  return {
    id: String(row.id),
    athlete_id: athleteIdBySource.get(String(row.swimmer_id)),
    meet_id: meetIdBySource.get(meetKey),
    event_name: row.event,
    competition_date: validDate(row.competition_date),
    team_name: row.team || null,
    rank: Number.isInteger(Number(row.rank)) && Number(row.rank) > 0 ? Number(row.rank) : null,
    time_text: row.time || null,
    time_milliseconds: row.time_milliseconds !== null && row.time_milliseconds !== '' && Number.isInteger(Number(row.time_milliseconds)) && Number(row.time_milliseconds) > 0
      ? Number(row.time_milliseconds) : null,
    pool_type: row.pool_type || null,
    round_name: row.round || null,
    age_group: row.age_group || null,
    source_name: row.source || null,
    source_file: row.source_file || null,
    synced_at: row.synced_at || null,
    raw_source: sourceRecord
  };
});

const counts = { inserted: 0, updated: 0, duplicates: duplicateCount, affectedAthletes: 0 };
const changedAthletes = new Set();
await chunks(resultRows, async batch => {
  const ids = batch.map(row => row.id);
  const filter = encodeURIComponent(`in.(${ids.join(',')})`);
  const existing = await request(`results?select=id,raw_source&id=${filter}`);
  const existingById = new Map(existing.map(row => [row.id, row]));
  const changed = [];
  for (const row of batch) {
    const old = existingById.get(row.id);
    if (!old) {
      counts.inserted += 1;
      changed.push(row);
      changedAthletes.add(row.athlete_id);
    } else if (canonical(old.raw_source || {}) !== canonical(row.raw_source || {})) {
      counts.updated += 1;
      changed.push(row);
      changedAthletes.add(row.athlete_id);
    } else {
      counts.duplicates += 1;
    }
  }
  if (changed.length) await upsert('results', changed, 'id');
});
counts.affectedAthletes = changedAthletes.size;
const importedAt = new Date().toISOString();
await upsert('sync_state', [{ singleton: true, last_success_at: importedAt, source_name: '游泳成績通', updated_at: importedAt }], 'singleton');

// Keep the legacy GitHub Pages snapshot safe after visibility is managed in Supabase.
// Unknown or private values are excluded so a missing visibility column can never leak data.
const publicResultIds = new Set();
for (const batch of chunksToArray(resultRows, batchSize)) {
  const ids = batch.map(row => row.id);
  const filter = encodeURIComponent(`in.(${ids.join(',')})`);
  const storedResults = await request(`results?select=id,athlete_id,visibility&id=${filter}`);
  for (const result of storedResults) {
    if (result.visibility === 'public' && athleteVisibilityById.get(result.athlete_id) === 'public') {
      publicResultIds.add(result.id);
    }
  }
}
const publicRows = [...uniqueRows.values()].filter(row => publicResultIds.has(String(row.id)));
const publicHonours = createAutomaticHonours(publicRows, importedAt);
const [metadata, syncStatus] = await Promise.all([
  readFile(metadataPath, 'utf8').then(JSON.parse),
  readFile(syncStatusPath, 'utf8').then(JSON.parse)
]);
const publicSwimmerCount = new Set(publicRows.map(row => String(row.swimmer_id))).size;
const publicMetadata = {
  ...metadata,
  synced_at: importedAt,
  result_count: publicRows.length,
  swimmer_count: publicSwimmerCount,
  automatic_honours_count: publicHonours.length,
  visibility_filtered: true
};
const publicSummary = {
  ...(syncStatus.history?.[0] || syncStatus),
  status: 'success',
  synced_at: importedAt,
  result_count: publicRows.length,
  swimmer_count: publicSwimmerCount,
  automatic_honours_count: publicHonours.length
};
const publicSyncStatus = {
  ...syncStatus,
  last_success_at: importedAt,
  result_count: publicRows.length,
  swimmer_count: publicSwimmerCount,
  automatic_honours_count: publicHonours.length,
  history: [publicSummary, ...(Array.isArray(syncStatus.history) ? syncStatus.history.slice(1) : [])]
};
await Promise.all([
  writeJsonAtomically(resultsPath, publicRows),
  writeJsonAtomically(metadataPath, publicMetadata),
  writeJsonAtomically(honoursPath, publicHonours),
  writeJsonAtomically(syncStatusPath, publicSyncStatus)
]);

if (process.env.SWIM_SYNC_JOB_ID) {
  await request(`sync_jobs?id=eq.${encodeURIComponent(process.env.SWIM_SYNC_JOB_ID)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'success', finished_at: importedAt,
      inserted_count: counts.inserted, updated_count: counts.updated,
      duplicate_count: counts.duplicates, affected_athlete_count: counts.affectedAthletes,
      error_count: 0,
      summary: { sourceRows: sourceRows.length, uniqueResults: resultRows.length, athletes: athleteRows.size, meets: meetRows.size }
    })
  });
}

console.log(JSON.stringify({
  sourceRows: sourceRows.length,
  uniqueResults: resultRows.length,
  athletes: athleteRows.size,
  meets: meetRows.size,
  ...counts,
  publicSnapshotResults: publicRows.length
}, null, 2));

function chunksToArray(items, size) {
  const batches = [];
  for (let offset = 0; offset < items.length; offset += size) batches.push(items.slice(offset, offset + size));
  return batches;
}
