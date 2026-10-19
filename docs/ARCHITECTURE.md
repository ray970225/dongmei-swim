# 東美游泳隊網站架構

更新日期：2026-10-19。這份說明網站現在怎麼運作；歷史過程以 Git 紀錄為準。

## 頁面與使用者

| 頁面 | 對象 | 資料來源 |
| --- | --- | --- |
| `index.html` 首頁 | 所有訪客 | HTML 本身；最新動態、榮譽、招生班別讀 Supabase 公開資料表；自動榮譽讀 `data/swim-honours-public.json` |
| `results.html` 成績查詢 | 所有訪客 | `data/` 靜態成績快照（見 [RESULTS_ARCHITECTURE.md](RESULTS_ARCHITECTURE.md)） |
| `athletes.html`、`athlete.html` 選手資料 | 所有訪客（`noindex`） | 與成績查詢相同的靜態快照：`swim-athletes.json` 與選手分區 |
| `education.html` 會員專區 | 登入的有效會員 | Supabase（文章、附件、重要日期），React 畫面 |
| `admin-v2.html` 教練工作台 | 有效管理員 | Supabase；建立／刪除會員走 `manage-member` Edge Function |
| `account-settings.html`、`forgot-password.html` | 會員與管理員 | Supabase Auth |

公開成績只有一份資料：`data/` 快照。成績頁與選手頁都讀它，所以筆數、PB 與分段永遠一致。Supabase 的 `results` 表是資料庫備份，不是前台顯示來源。

## 權限

- 真正的權限邊界是 Supabase RLS；畫面隱藏只是呈現。
- 會員文章標題、正文、附件索引與檔案只存在 Supabase 與私有 `education` bucket，附件用短效簽名網址開啟。
- 正式網站不放任何 API key：瀏覽器呼叫 `tmsc-api` Edge Function，由它在伺服器端加上 publishable key 並限制可用路徑與來源網站。只有 `localhost` 可用被 Git 忽略的 `assets/js/runtime-config.js` 直連。
- 公開註冊關閉；會員由管理員在工作台建立，首次登入必須改密碼。

## 更新成績

游泳成績通站長已同意本站以爬蟲更新成績。流程在本機人工執行：

```sh
npm run swim:login                                   # 第一次或 session 過期時登入
SWIM_SOURCE_AUTOMATION_AUTHORIZED=true npm run swim:sync
npm run swim:check
npm test && npm run build
```

`swim:sync` 只在全部請求成功後才覆寫 `data/`，並保留來源搜尋不到的歷史成績。核對後寫一則首頁「網站更新日誌」，再用 GitHub Desktop 推送。要同步到 Supabase 備份時，另外執行 `npm run supabase:import`（需要 service role key，只能在本機環境變數提供）。

## 建置與部署

- Vite 多頁建置，推送到 `main` 後由 GitHub Actions 執行 `npm test`、`npm run build` 並部署 GitHub Pages。
- 推送一律使用 GitHub Desktop（見 `AGENTS.md`）。
- `data/swim-results.json`、`swim-honours.json` 是同步來源，保留在 repository，但不進入發布檔。

## 不做的事

- 不加留言、論壇、聊天室、按讚、商城或聊天機器人。
- 成績分析只根據來源資料；沒有分段就不顯示分段，不自創能力分數。
