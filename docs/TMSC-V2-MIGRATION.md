# 東美游泳隊網站 V2：現況、原則與遷移計畫

更新日期：2026-09-25
網站程式目錄：`/Users/ray/Documents/GitHub/dongmei-swim`

## 先確定要解決什麼

網站同時服務公開訪客、隊內會員與教練。三種使用者需要不同資料，因此設計要先回答「誰可以讀取哪一筆資料」，再決定畫面怎麼呈現。隱藏按鈕或網址不構成權限；資料庫必須在每次讀取時實際拒絕不合資格的請求。

成績分析也要從可驗證的資料開始。每個 PB、趨勢和進步幅度都必須能追溯到成績紀錄；來源沒有分段就不做分段分析，沒有可信標準就不自創能力分數。

同步的目標是讓教練少做事，不是讓流程變複雜：核准資料來源後，由管理員按一次同步；系統去重、更新並回報結果。同步失敗時保留最後一份有效資料，不能把前台清空或把會員資料送進公開檔案。

## 現有程式與資料：已檢查到的事實

- 真正的網站 repository 是上述 Git 目錄。ChatGPT 專案鏡像只有參考檔，`sources/` 依專案規則唯讀，沒有修改。
- 網站使用手寫 HTML、CSS、JavaScript，部署目標是 GitHub Pages，沒有前端框架或正式 build pipeline。
- 首頁原本已包含隊伍介紹、教練、榮譽、招生與 Firebase 最新消息。依後續修正，首頁與成績查詢的原有 UI 保持不動；新增的選手資料頁才有自己的資料分析版面，並沿用原站海軍藍、水藍、白色與金色。
- `data/swim-results.json` 目前有 9,908 筆成績、354 位選手；可辨認出 197 場賽事。資料包含來源識別碼、選手、項目、賽事、日期、名次、時間、池別、回合、組別及來源欄位，也有 CSV 匯入資料。現有資料沒有分段欄位。
- `crawler/sync-swim.mjs` 使用 Playwright 和已登入的 session 開啟 Swim Insights，呼叫選手及成績 API，依隊名搜尋和過濾後重寫 JSON。舊 GitHub Actions 設有每日排程及手動執行，登入 session 由 `SWIM_STORAGE_STATE_BASE64` 提供。
- [Swim Insights 服務條款](https://swim.orz.tw/terms) 第 11 節禁止使用自動化工具、爬蟲、機器人或腳本大量存取或擷取服務資料。`robots.txt` 無法透過目前檢查方式讀取。本機新版工作流程已移除排程，且 GitHub Actions 與 crawler 本身都檢查授權旗標，避免直接執行時繞過保護；沒有明確來源授權前，不應設定該旗標。改用核准的官方資料來源或匯出檔較合適。
- 已按帳戶持有人指示發布網站 V2 前端及手動同步工作流程；GitHub Pages 更新後仍需實際登入測試。`tmsc-api` 已部署；`manage-member` 與 `dispatch-swim-sync` 尚待管理員登入測試後部署。
- 憑證掃描沒有找到 Supabase 專案 key、service-role／secret key、GitHub token 或來源登入 session。Firebase 設定已移出受 Git 追蹤的 JavaScript，改由被忽略的本機 runtime 設定提供；Firebase Web key 是公開專案識別碼，不是資料權限。目前 Firebase API 限制與 Firestore Security Rules 不在 repository，尚未驗證。
- 舊教練後台使用 Firebase Email／Password 與 Firestore 管理公開消息、榮譽和招生。Firebase 規則不在 repository，無法從本機完整稽核。
- Firebase 帳戶目前列有兩個專案：`dongmei-swim` 與 `ScoreManager`。網站本機 runtime 設定指向 `dongmei-swim`；其 Firestore `honours` 集合有 7 筆手動榮譽，`news` 集合目前無資料。`ScoreManager` 的 Firestore 尚未建立、Realtime Database 根節點為空、預設 Hosting 網址顯示 Site Not Found，但專案仍註冊「東美成績查詢平台」網頁應用程式；Authentication、Storage、Functions 等用途尚未核對，因此仍不能直接刪除。
- 已將 `dongmei-swim` 的 7 筆手動榮譽匯入 Supabase `site_honours`，以 Firebase 文件 ID 保留遷移對照；首頁原本寫在 HTML 的 4 個招生班別也已匯入 `recruitment_classes`。`site_news` 現有 0 筆，與舊 Firestore 沒有 `news` 文件相符。新版教練管理台已有最新動態、榮譽及招生資料的管理入口。

## 由需求推導出的架構

### 讀取權限必須由資料層執行

公開成績由匿名訪客讀取；會員資料須先登入且帳號有效；管理操作只允許有效管理員。Supabase Row Level Security（資料列層級安全規則）是權限邊界，前端判斷只改善操作體驗。

升學文章的標題、摘要、正文、附件資料與檔案都屬於隊內資訊。因此這些資料只存 Supabase 資料表和私有 Storage bucket；公開頁面不預載標題或檔案網址。附件經權限檢查後才發短效簽名網址。

### 資料模型要表達實際關係

- `profiles`：登入使用者、角色、啟用狀態；角色至少有 `member`、`admin`。未登入訪客是公開讀取角色，不建立公開帳號。
- `member_invites`：由管理員建立邀請名單；不在名單內建立的帳號保持未啟用。正式專案仍須關閉公開註冊。
- `athletes`、`profile_athletes`：選手資料及預留的會員與選手關聯，供未來「我的成績」使用。
- `meets`、`results`、`splits`：賽事、成績及來源確實提供時才會有的分段。匯入用穩定來源識別碼去重，並保留來源欄位和 CSV 出處。
- `categories`、`tags`、`articles`、`deadlines`、`attachments`：隊內文章、分類、標籤、重要日期與私有附件索引。
- `sync_jobs`、`sync_state`：同步工作狀態、結果摘要及最近成功時間。

選手和成績各自有 `public`、`member`、`admin` 可見度。查詢成績時同時檢查選手與成績權限，防止公開成績意外帶出隱藏選手。

### 前台與同步需要明確失敗邊界

GitHub Pages 保留靜態網站；資料與會員認證由 Supabase 免費方案承接。資料搬移前保留現有 JSON 查詢作回復途徑。連上 Supabase 後，公開 JSON 快照只保留選手和成績都明確設為公開的紀錄。

管理員同步由伺服器函式驗證身分，再要求 GitHub Actions 執行匯入。service-role key、GitHub token 和來源登入憑證只放在伺服器密鑰管理處。資料來源目前有自動擷取限制；取得授權或改用核准來源前，同步不能啟用。

公開 repository 不保存實際部署設定或私密憑證；`.env`、Supabase 本機設定及 `assets/js/runtime-config.js` 已加入忽略清單。靜態頁面載入這個設定檔後，瀏覽器仍看得到其中的 client key；如果要求 client key 也不能對瀏覽器公開，就必須先將資料查詢與登入改由伺服器 API 代理。

## 分階段遷移與目前狀態

1. **已完成：**盤點 repository、工作流程和資料；建立資料表、RLS、私有 Storage 規則與可重複執行的快照匯入。
2. **已完成 Supabase 基礎建置：**免費專案位於首爾；已關閉公開註冊、套用基礎 migration 與 service-role 權限 migration；15 張資料表皆有 RLS，文章與附件資料沒有匿名 SELECT policy，`education` bucket 為 private。
3. **已完成首次資料匯入：**新資料庫新增 9,908 筆成績、354 位選手及 197 場賽事；第一次匯入沒有重複資料。舊 Firebase 7 筆手動榮譽和首頁 4 個招生班別也已匯入 Supabase；本機首頁讀取公開榮譽與招生資料成功，沒有動態資料時顯示空狀態。
4. **已完成匿名保護檢查：**以 publishable key 直接匿名請求文章、附件、分類、標籤與日期資料時，Supabase 回覆權限拒絕；無法讀到任何文章資料。登入會員與停用帳號的端對端測試仍待第一位管理員帳號。
5. **首位管理員已完成邀請確認：**資料庫確認信箱已驗證，角色為啟用中的 admin。待實測隊內登入、升學閱讀、附件預覽、文章管理及會員管理；同步功能仍受來源授權與 GitHub 派送設定限制。
6. **已完成程式骨架，待資料來源核准：**管理員同步入口、工作鎖、15 分鐘冷卻、結果摘要與 GitHub Actions 派送。舊爬蟲受授權旗標保護；應先接核准來源，再完成端對端測試。
7. **已完成本機：**選手資料名單與個人頁，採網站既有配色；入口放在登入後的隊內功能。首頁與成績查詢 UI 保持原樣。
8. **待管理員端對端驗證、client key 使用決策及正式發布：**確認新後台 CRUD 與登入後再將舊 Firebase 後台入口導向新版。新版公開內容已有本機與匿名讀取驗證；正式網站切換後保留 JSON／舊專案回復路徑一段時間。
9. **Firebase 專案尚未退役：**`dongmei-swim` 仍被目前網站設定引用；`ScoreManager` 的預設 Hosting 網址顯示 Site Not Found、Firestore 尚未建立、Realtime Database 為空，但仍有註冊中的網站應用程式，Authentication、Storage、Functions 等用途未完成盤點。不得在資料、正式網站與服務依賴未核對前刪除專案。

## 完成遷移的判準

- 匿名請求拿不到文章標題、正文、附件索引或私有檔案。
- 已邀請會員只讀得到已發布文章；停用帳號立即失去隊內權限；管理操作必須由有效管理員執行。
- Supabase 的成績筆數、選手數、來源識別碼與現有快照核對一致；重跑匯入不會重複新增。
- 公開頁不暴露會員專屬的選手或成績；未核准的來源不會被自動存取。
- 管理員可從一個入口觸發一次核准的同步，並看到新增、更新、重複、錯誤、影響選手數與最後成功時間。
- 替代流程驗證完成前，現有網站資料仍有回復路徑。

## 需要外部提供的條件

本機程式不能替使用者建立 Supabase 帳號、核准第三方資料使用或寫入 GitHub／Supabase 密鑰。部署設定不得提交到公開 Git；service-role、GitHub 和資料來源憑證必須在各自的密鑰管理器設定，不能放進程式碼或對話。瀏覽器直接連 Supabase 時，publishable key 本來就不是密碼，但仍會被瀏覽器看到；如需連它也不公開，必須改採伺服器 API 代理後再接線。

Supabase 專案已建立於 `xsmbubwgtkbtsyiskivf`（首爾、Free），專案網址為 `https://xsmbubwgtkbtsyiskivf.supabase.co`。這些識別資訊不含任何 key。首位管理員已完成邀請確認，`tmsc-api` 已部署並通過匿名及拒絕規則檢查；管理函式、有效會員登入和私有附件仍待端對端驗證。
