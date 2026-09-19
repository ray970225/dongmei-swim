# 東美游泳隊成績同步

## 日常同步

1. 第一次或登入失效時，執行 `npm run swim:login`，在瀏覽器完成游泳成績通登入。
2. 執行 `npm run swim:sync`。爬蟲會完整走訪所有結果分頁，成功後才一次更新成績、同步資訊，以及 `data/swim-honours.json`。
3. 每次同步會自動將名次第 1～8 名整理到榮譽殿堂；同一選手同一賽事的多個前八名項目會合併在同一張卡片。需要以既有成績重新建立榮譽資料時，可執行 `npm run swim:honours`。
4. 執行 `npm run swim:check` 驗證資料筆數、前八名規則與最後更新時間。

`crawler/swim-config.json` 管理要納入的隊名、搜尋字詞、每頁筆數與請求間隔；需要新增隊名時直接編輯這個檔案。登入 session 存在 `crawler/.auth/`，已由 `.gitignore` 排除，請勿提交。

網站的成績查詢頁會讀取 `swim-results-meta.json`，並以台灣時間顯示最後一次成功同步的時間。

## 自動排程的前置條件

來源網站的 API 使用登入 session。若要在雲端每日自動同步，需將登入後的 Playwright storage state 以受保護密鑰提供給排程環境；session 過期時必須重新登入並更新密鑰。請先確認程式庫與部署平台，才建立會自動提交／部署的排程。
