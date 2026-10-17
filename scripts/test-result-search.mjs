import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeRows } from '../assets/js/result-data.js';
import { planNameSearch } from '../assets/js/result-search.js';

const data = name => new URL(`../data/${name}`, import.meta.url);
const full = decodeRows(JSON.parse(await readFile(data('swim-results-public.json'), 'utf8')));
const roster = JSON.parse(await readFile(data('swim-athletes.json'), 'utf8'));
const shardCache = new Map();
const ids = rows => rows.map(row => row.id).sort();

assert.equal(planNameSearch('李', roster), null, 'A broad one-character search uses the full snapshot');
const queries = new Set(roster.flatMap(person => {
  const name = String(person.name || '');
  return [name, ...Array.from({ length: Math.max(0, name.length - 1) }, (_, index) => name.slice(index, index + 2))];
}));
for (const query of queries) {
  const plan = planNameSearch(query, roster);
  if (!plan) continue;
  const shardRows = (await Promise.all(plan.shards.map(async shard => {
    if (!shardCache.has(shard)) {
      shardCache.set(shard, readFile(data(`swim-athlete-shards/${shard}.json`), 'utf8')
        .then(text => decodeRows(JSON.parse(text))));
    }
    return shardCache.get(shard);
  }))).flat();
  const selected = shardRows.filter(row => plan.ids.has(String(row.swimmer_id)) && row.swimmer.includes(query));
  assert.deepEqual(ids(selected), ids(full.filter(row => row.swimmer.includes(query))), `Name search mismatch: ${query}`);
}

console.log('Public name search matches the complete result snapshot.');
