import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSearchFacets } from './search-facets.mjs';

const root = new URL('../', import.meta.url);
const resultsFile = new URL('./data/swim-results.json', root);
const metadataFile = new URL('./data/swim-results-meta.json', root);
const facetsFile = new URL('./data/swim-search-facets.json', root);
const rows = JSON.parse(await readFile(resultsFile, 'utf8'));
const metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
const temporary = `${fileURLToPath(facetsFile)}.${process.pid}.tmp`;

await writeFile(temporary, `${JSON.stringify(createSearchFacets(rows, metadata.synced_at), null, 2)}\n`, 'utf8');
await rename(temporary, facetsFile);
console.log(`已建立搜尋索引：${rows.length} 筆成績、${createSearchFacets(rows).competitions.length} 場賽事。`);
