# 539 尾數觀察站：管理者 SOP

只給管理者看。這份文件不含密碼，密碼只存在 Apps Script 的「指令碼屬性」。

## 重要網址與位置

| 項目 | 位置 |
| --- | --- |
| app | https://bailixiao.github.io/539-app/app/ |
| 程式碼（GitHub，公開） | https://github.com/bailixiao/539-app |
| 資料 /exec 網址 | https://script.google.com/macros/s/AKfycby_Za-SJp2fteT4vLspntfLjBp_GrRQpeihMLbOnnDDCgN05NzkqDXCb6wDAtK50LNH/exec |
| 開獎資料 | Google 試算表「539 開獎資料」，工作表 draws |
| 後端程式 | 試算表 → 擴充功能 → Apps Script（專案「539 開獎資料 後端」） |
| 管理密碼 | Apps Script → 專案設定（齒輪）→ 指令碼屬性 → ADMIN_PASSWORD |

## 日常：什麼都不用做

每週一到週六晚上 9–10 點，觸發器會自動執行 dailyUpdate：

1. 抓 pilio、lotto-8 兩個網站
2. 兩邊號碼一樣就寫入試算表
3. 不一樣或只有一邊有，就查台彩官方，寫入官方號碼
4. 漏掉的期數會一起補（兩個網站只列最近約 23 期，所以最多補約 4 週）

只要偶爾打開 app 看頂端「資料更新到 幾月幾日」是不是最新的。

## 登入管理者模式

1. app 頁尾按「管理者登入」
2. 輸入管理密碼 → 底部出現「資料」鍵
3. 密碼會記在這支手機；不用時按「資料」頁最下面的「登出管理者」

## 每隔幾個月：匯入台彩官方 CSV 校正

1. 到台灣彩券官網下載當年度的「今彩539_年份.csv」
2. app →「資料」→「匯入官方 CSV」→ 選擇檔案
3. 確認畫面顯示的期數和日期範圍合理（例如 2026 年到 9/30 是 237 期）
4. 按「匯入 N 期」
5. 結果會顯示「新增 X、更正 Y、相同 Z」
   - 「更正」大於 0：代表之前自動抓的號碼有錯，已經用官方版本改正

## 發現某一期號碼錯了

- 最好的做法：匯入官方 CSV，會自動更正
- 官方 CSV 還沒有那一期時：「資料」→「最近資料」→ 該期按「刪除」。當晚自動抓號會重新抓。想馬上補：到 Apps Script 手動執行 dailyUpdate

## app 頂端出現紅色提醒（好幾天沒更新）

1. 到 Apps Script 左邊「執行項目」，看最近幾次 dailyUpdate 的記錄
2. 函式選 testParse → 執行，看記錄裡兩個網站各抓到幾期
   - 有網站「抓到 0 期」：那個網站可能改版了，截圖給 Claude 修抓號規則
   - 兩站都正常：手動執行 dailyUpdate 試試看
3. 左邊「觸發條件」確認 dailyUpdate 的每日觸發器還在
4. 過年停開期間出現提醒是正常的，不用處理

## 更換管理密碼

1. Apps Script → 專案設定 → 指令碼屬性 → 編輯 ADMIN_PASSWORD → 儲存
2. 舊密碼登入的手機會在下次操作時自動登出，重新登入即可

## 請 Claude 改程式時

- 專案資料夾：D:\Projects\539，規則寫在 CLAUDE.md，計畫在「539 尾數觀察站 App 計畫書.md」
- 前端改完會自動上傳 GitHub，1–2 分鐘後網站更新；手機把 app 完全關掉再開就會換新版
- 後端 Code.gs 由 Claude 用 clasp 上傳，影響網址行為的改動要更新部署版本（網址不變）
