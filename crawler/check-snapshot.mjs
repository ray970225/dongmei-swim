import { readFile } from 'node:fs/promises';

const results = JSON.parse(await readFile(new URL('../data/swim-results.json', import.meta.url), 'utf8'));
const metadata = JSON.parse(await readFile(new URL('../data/swim-results-meta.json', import.meta.url), 'utf8'));

if (!Array.isArray(results) || results.length === 0) throw new Error('同步結果為空，停止發布。');
if (!metadata.synced_at || Number.isNaN(Date.parse(metadata.synced_at))) throw new Error('缺少有效的同步時間。');
if (metadata.result_count !== results.length) throw new Error(`筆數不一致：metadata=${metadata.result_count}，data=${results.length}`);
console.log(`資料檢查通過：${results.length} 筆，${metadata.synced_at}`);
