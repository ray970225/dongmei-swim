import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DATA_DIR = new URL('../data/', import.meta.url);
const SHARD_DIR = new URL('../data/swim-athlete-shards/', import.meta.url);
const SHARD_COUNT = 32;

export const RESULT_FIELDS = [
  'id', 'swimmer_id', 'swimmer', 'team', 'event', 'competition', 'competition_date',
  'rank', 'time', 'time_milliseconds', 'pool_type', 'round', 'age_group', 'splits'
];

const asTuple = row => RESULT_FIELDS.map(field => row[field] ?? null);
const newestFirst = (a, b) => String(b.competition_date || '').localeCompare(String(a.competition_date || ''))
  || String(a.id || '').localeCompare(String(b.id || ''));
const performanceKey = row => [row.swimmer_id || row.swimmer || '', row.event || '', row.pool_type || '未列池別'].join('|');

function shardFor(sourceId) {
  let hash = 2166136261;
  for (const character of String(sourceId || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % SHARD_COUNT;
}

async function writeJsonAtomically(url, value) {
  const target = fileURLToPath(url);
  await mkdir(new URL('.', url), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value)}\n`, 'utf8');
  await rename(temp, target);
}

export async function writePublicResultData(sourceRows) {
  const rows = [...(Array.isArray(sourceRows) ? sourceRows : [])].sort(newestFirst);
  const groupedResults = new Map();
  rows.forEach(row => {
    if (!Number.isFinite(Number(row.time_milliseconds)) || Number(row.time_milliseconds) <= 0) return;
    const key = performanceKey(row);
    if (!groupedResults.has(key)) groupedResults.set(key, []);
    groupedResults.get(key).push(row);
  });

  const performanceHints = new Map();
  groupedResults.forEach(group => {
    group.sort((a, b) => String(a.competition_date || '').localeCompare(String(b.competition_date || ''))
      || String(a.id || '').localeCompare(String(b.id || '')));
    let best = Infinity;
    let previous = null;
    group.forEach(row => {
      const time = Number(row.time_milliseconds);
      performanceHints.set(row.id, {
        is_pb: time <= best,
        previous_time_milliseconds: previous
      });
      best = Math.min(best, time);
      previous = time;
    });
  });

  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(SHARD_DIR, { recursive: true });
  await writeJsonAtomically(new URL('swim-results-public.json', DATA_DIR), rows.map(asTuple));
  await writeJsonAtomically(new URL('swim-results-recent.json', DATA_DIR), rows.slice(0, 24).map(row => {
    const hint = performanceHints.get(row.id) || { is_pb: false, previous_time_milliseconds: null };
    return [...asTuple(row), hint.is_pb, hint.previous_time_milliseconds];
  }));

  const athletesById = new Map();
  const rowsByShard = Array.from({ length: SHARD_COUNT }, () => []);
  rows.forEach(row => {
    const id = String(row.swimmer_id || '').trim();
    if (!id) return;
    const shard = shardFor(id);
    if (!athletesById.has(id)) {
      athletesById.set(id, { id, name: String(row.swimmer || '').trim(), shard: String(shard).padStart(2, '0') });
    }
    rowsByShard[shard].push(row);
  });

  const roster = [...athletesById.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant') || a.id.localeCompare(b.id));
  await writeJsonAtomically(new URL('swim-athletes.json', DATA_DIR), roster);
  await Promise.all(rowsByShard.map((shardRows, index) => writeJsonAtomically(
    new URL(`${String(index).padStart(2, '0')}.json`, SHARD_DIR),
    shardRows.map(asTuple)
  )));

  return {
    resultCount: rows.length,
    athleteCount: roster.length,
    shardCount: SHARD_COUNT,
    recentCount: Math.min(rows.length, 24)
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const source = JSON.parse(await readFile(new URL('swim-results.json', DATA_DIR), 'utf8'));
  const summary = await writePublicResultData(source);
  console.log(`公開資料完成：${summary.resultCount} 筆成績、${summary.athleteCount} 位選手、${summary.shardCount} 個按需載入分區。`);
}
