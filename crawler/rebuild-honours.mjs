import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAutomaticHonours, createPublicHonours } from './honours.mjs';

const ROOT = new URL('../', import.meta.url);
const DATA_FILE = new URL('./data/swim-results.json', ROOT);
const META_FILE = new URL('./data/swim-results-meta.json', ROOT);
const HONOURS_FILE = new URL('./data/swim-honours.json', ROOT);
const PUBLIC_HONOURS_FILE = new URL('./data/swim-honours-public.json', ROOT);

async function writeJsonAtomically(url, value, compact = false) {
  const target = fileURLToPath(url);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, compact ? JSON.stringify(value) : `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, target);
}

const results = JSON.parse(await readFile(DATA_FILE, 'utf8'));
const metadata = JSON.parse(await readFile(META_FILE, 'utf8'));
const honours = createAutomaticHonours(results, metadata.synced_at);
await mkdir(new URL('./data/', ROOT), { recursive: true });
await writeJsonAtomically(HONOURS_FILE, honours);
await writeJsonAtomically(PUBLIC_HONOURS_FILE, createPublicHonours(honours), true);
console.log(`榮譽殿堂資料完成：${honours.length} 張卡片（僅第 1～8 名）`);
