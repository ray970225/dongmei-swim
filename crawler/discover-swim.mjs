import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STATE_FILE = new URL('./.auth/swim-state.json', import.meta.url);
const OUT_DIR = new URL('./output/discovery/', import.meta.url);
const statePath = fileURLToPath(STATE_FILE);

const TERMS = [
  '高雄市新莊高中',
  '東美泳隊',
  '大仁國中'
];

if (!existsSync(statePath)) {
  console.error('找不到登入 session。請先執行：npm run swim:login');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: [
    '--disable-blink-features=AutomationControlled'
  ]
});
const context = await browser.newContext({
  storageState: statePath,
  viewport: { width: 1280, height: 900 },
  locale: 'zh-TW'
});

const page = await context.newPage();

for (const term of TERMS) {
  const safe = term.replace(/[^\p{L}\p{N}]+/gu, '_');
  const jsonResponses = [];

  page.removeAllListeners('response');
  page.on('response', async response => {
    const url = response.url();
    const type = response.headers()['content-type'] || '';
    if (!type.includes('json') && !url.includes('/api/') && !url.includes('supabase')) return;

    try {
      const text = await response.text();
      jsonResponses.push({
        url,
        status: response.status(),
        contentType: type,
        bodyPreview: text.slice(0, 3000),
        body: text
      });
    } catch {
      jsonResponses.push({
        url,
        status: response.status(),
        contentType: type,
        error: 'Unable to read response body'
      });
    }
  });

  const url = `https://swim.orz.tw/search?q=${encodeURIComponent(term)}`;
  console.log(`搜尋：${term}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  const snapshot = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: document.body.innerText,
    links: [...document.querySelectorAll('a[href]')].map(a => ({
      text: a.textContent.trim(),
      href: a.href
    })).filter(x => x.text || x.href)
  }));

  await writeFile(
    new URL(`${safe}.page.json`, OUT_DIR),
    JSON.stringify(snapshot, null, 2),
    'utf8'
  );
  await writeFile(
    new URL(`${safe}.responses.json`, OUT_DIR),
    JSON.stringify(jsonResponses, null, 2),
    'utf8'
  );

  console.log(`已保存：crawler/output/discovery/${safe}.*.json`);
}

await browser.close();
console.log('探索完成。');
