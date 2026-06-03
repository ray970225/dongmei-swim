import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const RESULTS_FILE = new URL('./output/results.json', import.meta.url);
const name = process.argv.slice(2).join(' ').trim();

if (!name) {
  console.log('用法：npm run swim:query -- 選手姓名');
  process.exit(0);
}

if (!existsSync(RESULTS_FILE)) {
  console.error('找不到 crawler/output/results.json。請先完成同步解析。');
  process.exit(1);
}

const rows = JSON.parse(await readFile(RESULTS_FILE, 'utf8'));
const matches = rows.filter(row => String(row.swimmer || row.name || '').includes(name));

if (!matches.length) {
  console.log(`找不到「${name}」的成績。`);
  process.exit(0);
}

console.log(JSON.stringify(matches, null, 2));
