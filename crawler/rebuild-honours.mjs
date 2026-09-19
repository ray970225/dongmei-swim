import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAutomaticHonours } from './honours.mjs';

const ROOT = new URL('../', import.meta.url);
const DATA_FILE = new URL('./data/swim-results.json', ROOT);
const META_FILE = new URL('./data/swim-results-meta.json', ROOT);
const HONOURS_FILE = new URL('./data/swim-honours.json', ROOT);

async function writeJsonAtomically(url, value) {
  const target = fileURLToPath(url);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, target);
}

const results = JSON.parse(await readFile(DATA_FILE, 'utf8'));
const metadata = JSON.parse(await readFile(META_FILE, 'utf8'));
const honours = createAutomaticHonours(results, metadata.synced_at);
await mkdir(new URL('./data/', ROOT), { recursive: true });
await writeJsonAtomically(HONOURS_FILE, honours);
console.log(`榮譽殿堂資料完成：${honours.length} 張卡片（僅第 1～8 名）`);
