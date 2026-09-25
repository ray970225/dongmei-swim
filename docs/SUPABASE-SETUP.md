# Supabase 建置與上線前檢查

本文件說明如何把本機已準備好的會員、資料庫和私有檔案功能接到實際 Supabase 專案。repository 不保存任何真實憑證。

## 先分清楚哪些資料可以放在哪裡

- 專案網址和 Edge Function 代理網址是公開端點識別資訊，不是金鑰。此專案依帳戶持有人要求，正式網頁不直接連 Supabase，也不包含任何 API key。正式前端只呼叫 `tmsc-api`，由 function 在伺服器端加入 publishable key；使用者 JWT 照常轉送，資料仍由 RLS 判斷。
- 正式前端的預設端點已設定在 `assets/js/supabase-client.js`，沒有金鑰。只有 `localhost` 可讀取被 Git 忽略的 `assets/js/runtime-config.js` 並直接連 Supabase，以方便本機預覽；即使設定了 key，GitHub Pages 網域也不會啟用直連。本機設定範例（只用於 `localhost`；勿複製到公開部署）：

   ```js
   globalThis.TMSC_SUPABASE_CONFIG = {
     url: 'https://<project-ref>.supabase.co',
     publishableKey: '<local-preview-key>'
   };
   ```

- Firebase 設定已從受 Git 追蹤的首頁與舊後台程式移出；正式頁不再直連 Firebase。
- service-role key 可以繞過 RLS，只能給匯入程式、GitHub Actions 或伺服器函式使用，不能放在前端、Git 或對話。
- GitHub dispatch token 和成績來源憑證也只放在各自的伺服器密鑰管理器。
- 成績來源目前禁止大量自動擷取。沒有來源明確授權前，不可啟用舊爬蟲；須先取得授權，或把工作流程改接核准的官方 feed／匯出檔。

## 建立專案與套用資料規則

1. **已完成：**已建立 Free 專案 `xsmbubwgtkbtsyiskivf`（首爾，Project URL：`https://xsmbubwgtkbtsyiskivf.supabase.co`）。key 不記錄在文件或公開 repository。
2. **已完成：**在 Authentication 關閉公開註冊，並新增下列允許的登入連結：
   - `https://ray970225.github.io/dongmei-swim/education.html`
   - 本機預覽才需要：`http://localhost:8000/education.html`
3. **已完成：**在 SQL Editor 執行 [`supabase/migrations/202609250001_tmsc_v2_foundation.sql`](../supabase/migrations/202609250001_tmsc_v2_foundation.sql) 和 [`supabase/migrations/202609250002_service_role_grants.sql`](../supabase/migrations/202609250002_service_role_grants.sql)。15 張資料表均啟用 RLS；文章及附件資料沒有匿名讀取政策。
4. **已完成：**`education` bucket 的 Public 狀態為關閉。會員閱讀需有效登入並透過短效 signed URL 取得附件。
5. **已完成 live 核對：**成績 9,908 筆、選手 354 位、賽事 197 場；匿名 REST 請求讀取文章、附件、分類、標籤與日期時遭資料庫權限拒絕。
6. **已完成：**已由 Supabase Auth 寄出首位教練邀請，並將該帳號設為啟用中的 `admin`。收件人須完成邀請信中的帳號設定；後續會員由管理台邀請。

## 匯入舊成績，再切換前台

匯入必須先於前端設定。這樣 importer 才能先依資料庫可見權限重建公開 JSON，避免舊快照在正式切換後仍包含非公開資料。

1. **已完成首次匯入：**本機暫存設定執行後已清除，repository 不保存 service-role key。一般重跑需在可信任的本機環境或 GitHub Actions secrets 設定 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`：

   ```sh
   npm run supabase:import
   ```

2. importer 以穩定來源 ID 匯入選手、賽事與成績。它會保留來源欄位和 CSV 出處；重跑時只更新必要資料，並統計新增、更新、重複及受影響選手。
3. 匯入完成後，核對資料表結果：基準快照為 9,908 筆成績、354 位選手、約 197 場賽事。另抽查 CSV 紀錄、成績 ID、榮譽資料及數個公開查詢結果。
4. 確認 importer 重建的公開 JSON 只包含選手與成績都設為 `public` 的資料。正式網站預設經 `tmsc-api` function 連線，瀏覽器不取得 API key；本機預覽的直接連線只在 `localhost` 生效。公開端點 URL 不具資料權限，所有讀寫權限由 RLS 和 Edge Function 身分檢查決定。
5. GitHub Actions 設定若只填了 `SUPABASE_URL` 或只填了 service-role key，工作流程會停止，以免意外用未篩選的 JSON 發布資料。

## 部署管理函式與設定密鑰

部署 `tmsc-api`、`manage-member` 和 `dispatch-swim-sync` Edge Functions。`tmsc-api` 的 Gateway JWT 檢查關閉，以便接受匿名公開讀取和登入請求；function 自己限制可呼叫的服務路徑與網站來源，固定在伺服器端注入 Supabase publishable key，且不接受匿名註冊。受保護資料仍由 RLS 執行權限檢查。會員附件先經管理員權限檢查取得限時上傳網址，再透過受限代理上傳；瀏覽器不取得 API key。可使用 Supabase CLI，並先登入與連結正確專案：

```sh
supabase functions deploy tmsc-api
supabase functions deploy manage-member
supabase functions deploy dispatch-swim-sync
```

- 會員忘記密碼時，由 `forgot-password.html` 呼叫 `resetPasswordForEmail()`，並指定返回已允許的 `education.html`；重設連結驗證後才可更新密碼。Supabase Auth 的預設 Site URL 仍是首頁，因此從 Dashboard 直接寄送的重設信會回到首頁；會員應從網站登入頁的「忘記密碼？」重新寄送。

Supabase 會為 Edge Functions 提供專案 URL、anon key 與 service-role key。另在 Supabase Edge Function secrets 設定：

- `GITHUB_DISPATCH_TOKEN`：限用於 `ray970225/dongmei-swim` 的 GitHub token，需能派送 Actions workflow。
- `GITHUB_REPOSITORY`：`ray970225/dongmei-swim`。
- `PUBLIC_SITE_URL`：`https://ray970225.github.io/dongmei-swim/education.html`。
- `SWIM_SOURCE_AUTOMATION_AUTHORIZED=true`：只有在 Swim Insights 明確授權本隊自動擷取時才可設定。未獲授權前保持未設定，並先把 workflow 改接核准來源。

GitHub repository Actions secrets 設定：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- 只有經核准來源要求時才設定相應來源憑證。
- 若使用原爬蟲，還須有 `SWIM_STORAGE_STATE_BASE64`；但目前服務條款不允許大量自動擷取，因此不可因為已有登入 session 就自行啟用。

workflow 僅接受管理台經授權後的手動派送，不設每日自動爬取；來源未獲授權時會停止同步。資料來源授權、GitHub Actions 必要密鑰和管理函式驗證未完成前，不應啟用成績同步。

## 上線前要逐一驗證的權限

以下測試應以真實匿名、會員、停用會員和管理員 session 執行；只看前端畫面不足以證明安全。

- 未登入者查詢 `articles`、`categories`、`deadlines`、`attachments` 時拿不到任何文章標題、正文或附件中繼資料；直接讀取私有物件也失敗。
- 透過網站管理台邀請的有效會員只能讀取已發布文章及其附件；不能新增或修改文章、選手、成績、會員或同步工作。
- 不在邀請名單建立的帳號為停用狀態。停用會員下一次請求就失去文章及檔案存取權。
- 管理員可編輯文章和附件、邀請或停用一般會員；同步 RPC 拒絕非管理員、重複工作與冷卻時間內的工作。
- 選手或成績設為非公開時，匿名查詢及靜態公開 JSON 都不可取得；會員查詢遵守兩者中較嚴格的權限。
- 靜態 HTML、JavaScript、JSON 與公開 repository 內沒有會員限定文章標題、正文、附件路徑或 signed URL。

## 完成切換的條件

只有資料核對與以上權限測試都通過，才能讓網站改以 Supabase 為正式資料來源、停用舊 Firebase 路徑或關閉舊排程。保留匯出快照作回復方案。服務帳號密鑰不可貼在對話，也不可提交到 Git。
