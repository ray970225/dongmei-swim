import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dataDirectory = process.env.TMSC_DATA_DIR || new URL('../data/', import.meta.url);
const readJson = filename => readFile(typeof dataDirectory === 'string'
  ? join(dataDirectory, filename)
  : new URL(`../data/${filename}`, import.meta.url), 'utf8').then(JSON.parse);
const [results, metadata, honours, syncStatus, facets] = await Promise.all([
  readJson('swim-results.json'), readJson('swim-results-meta.json'),
  readJson('swim-honours.json'), readJson('swim-sync-status.json'), readJson('swim-search-facets.json')
]);

if (!Array.isArray(results) || (results.length === 0 && metadata.visibility_filtered !== true)) {
  throw new Error('同步結果為空，停止發布。');
}
const privateResultFields = ['swimmer_en', 'gender', 'birth_year', 'source', 'source_file', 'synced_at'];
const leakedFields = new Set(results.flatMap(row => privateResultFields.filter(field => Object.hasOwn(row, field))));
if (leakedFields.size) throw new Error(`公開成績快照包含不必要欄位：${[...leakedFields].join(', ')}`);
const requiredResultFields = ['id', 'swimmer_id', 'swimmer', 'event', 'competition', 'competition_date', 'rank', 'time', 'time_milliseconds'];
if (results.some(row => requiredResultFields.some(field => !Object.hasOwn(row, field)))) {
  throw new Error('公開成績快照缺少查詢或圖表所需欄位。');
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
if (!Array.isArray(facets.competitions) || !Array.isArray(facets.events) || !facets.generated_at) {
  throw new Error('搜尋索引資料格式錯誤。');
}
console.log(`資料檢查通過：${results.length} 筆成績、${honours.length} 張前八名榮譽卡，${metadata.synced_at}`);
