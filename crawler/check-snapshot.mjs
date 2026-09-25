import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dataDirectory = process.env.TMSC_DATA_DIR || new URL('../data/', import.meta.url);
const readJson = filename => readFile(typeof dataDirectory === 'string'
  ? join(dataDirectory, filename)
  : new URL(`../data/${filename}`, import.meta.url), 'utf8').then(JSON.parse);
const [results, metadata, honours, syncStatus] = await Promise.all([
  readJson('swim-results.json'), readJson('swim-results-meta.json'),
  readJson('swim-honours.json'), readJson('swim-sync-status.json')
]);

if (!Array.isArray(results) || (results.length === 0 && metadata.visibility_filtered !== true)) {
  throw new Error('同步結果為空，停止發布。');
}
if (!metadata.synced_at || Number.isNaN(Date.parse(metadata.synced_at))) throw new Error('缺少有效的同步時間。');
if (metadata.result_count !== results.length) throw new Error(`筆數不一致：metadata=${metadata.result_count}，data=${results.length}`);
if (!Array.isArray(honours)) throw new Error('榮譽殿堂資料格式錯誤。');
if (honours.some(honour => !Number.isInteger(honour.best_rank) || honour.best_rank < 1 || honour.best_rank > 8)) {
  throw new Error('榮譽殿堂包含非前八名資料。');
}
if (metadata.automatic_honours_count != null && metadata.automatic_honours_count !== honours.length) {
  throw new Error(`榮譽資料筆數不一致：metadata=${metadata.automatic_honours_count}，data=${honours.length}`);
}
if (syncStatus.status !== 'success' || syncStatus.last_success_at !== metadata.synced_at) {
  throw new Error('同步狀態與成績資料更新時間不一致。');
}
console.log(`資料檢查通過：${results.length} 筆成績、${honours.length} 張前八名榮譽卡，${metadata.synced_at}`);
