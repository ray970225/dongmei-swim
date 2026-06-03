import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';

const AUTH_DIR = new URL('./.auth/', import.meta.url);
const STATE_FILE = new URL('./.auth/swim-state.json', import.meta.url);
const statePath = fileURLToPath(STATE_FILE);

await mkdir(AUTH_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  slowMo: 60,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: [
    '--disable-blink-features=AutomationControlled'
  ]
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 820 },
  locale: 'zh-TW'
});

const page = await context.newPage();
await page.goto('https://swim.orz.tw/login?redirect=%2Fsearch', {
  waitUntil: 'domcontentloaded'
});

console.log('');
console.log('請在開啟的瀏覽器視窗登入游泳通。');
console.log('登入完成並確認可以進入搜尋頁後，回到這個終端按 Enter。');
console.log('帳號密碼不會被寫入檔案，只會保存登入後 session。');
console.log('');

const rl = createInterface({ input, output });
await rl.question('登入完成後按 Enter 保存 session...');
rl.close();

await context.storageState({ path: statePath });
await browser.close();

console.log(`已保存 session：${statePath}`);
