// GitHub Pages 只負責把舊網址轉到正式網站，保留路徑、查詢參數與錨點。
import { mkdir, readdir, writeFile } from 'node:fs/promises';

const TARGET = 'https://dongmei-swim.pages.dev';
const OLD_BASE = '/dongmei-swim';
const output = new URL('../redirect-dist/', import.meta.url);

const page = file => `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<title>東美游泳隊已搬到新網址</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${TARGET}/${file === 'index.html' ? '' : file}">
<meta http-equiv="refresh" content="0; url=${TARGET}/${file === 'index.html' ? '' : file}">
<script>
  var path = location.pathname.replace(${JSON.stringify(OLD_BASE)}, '') || '/';
  location.replace(${JSON.stringify(TARGET)} + path + location.search + location.hash);
</script>
</head>
<body><p>東美游泳隊網站已搬到 <a href="${TARGET}/">${TARGET.replace('https://', '')}</a>。</p></body>
</html>
`;

await mkdir(output, { recursive: true });
const pages = (await readdir(new URL('../', import.meta.url))).filter(file => file.endsWith('.html') && !file.startsWith('google'));
for (const file of [...pages, '404.html']) await writeFile(new URL(file, output), page(file), 'utf8');
console.log(`已產生 ${pages.length + 1} 個轉址頁 → ${TARGET}`);
