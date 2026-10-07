/**
 * 539 尾數觀察站：Google Apps Script 後端
 *
 * 貼在 Google Sheet「539 開獎資料」的 Apps Script 編輯器裡。
 * 工作表 draws：第 1 列是標題，A 欄日期（純文字 yyyy-MM-dd），B–F 欄 5 個號碼。
 *
 * 函式：
 *   doGet()       有人打開 /exec 網址時執行，回傳全部開獎號碼（JSON）
 *   dailyUpdate() 觸發器每晚執行：抓兩個網站，一致就寫入；不一致或只有一邊有，以台彩官方為準
 *   doPost()      管理者用：匯入台彩官方 CSV、刪除一期（要密碼）
 *   testParse()   手動執行：在記錄裡顯示兩個網站和台彩官方各抓到幾期、最新三期，不寫入
 *
 * 管理密碼放在「專案設定 → 指令碼屬性」，名稱 ADMIN_PASSWORD，不寫在程式裡。
 */

const SHEET = 'draws';
const SITES = [
  { name: 'pilio',   url: 'https://www.pilio.idv.tw/lto539/list.asp',  parse: parsePilio },
  { name: 'lotto-8', url: 'https://www.lotto-8.com/listlto539.asp',    parse: parseLotto8 },
];
// 台彩官方查詢（一次查一個月），month 格式 yyyy-MM
const OFFICIAL_API = 'https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result?period&month=%s&pageNum=1&pageSize=50';


// ===== 給前端讀資料 =====

// GET /exec → {"draws":[{"d":"2024-01-01","n":[3,9,27,30,33]}, ...]}，由舊到新
function doGet() {
  const draws = readSheet_().map(r => ({ d: r.d, n: r.n.split(' ').map(Number) }));
  return json_({ draws });
}


// ===== 每晚自動抓號 =====

function dailyUpdate() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const rows = readSheet_();
    const have = new Set(rows.map(r => r.d));
    const first = rows.length ? rows[0].d : '2024-01-01';

    const [a, b] = SITES.map(s => fetchSite_(s));
    const dates = [...new Set([...a.keys(), ...b.keys()])]
      .filter(d => d >= first && !have.has(d))
      .sort();

    const added = [];
    const skipped = [];
    const official = {};  // 依月份暫存台彩官方資料，同一個月只查一次
    dates.forEach(d => {
      let nums, from;
      if (a.has(d) && a.get(d) === b.get(d)) {
        nums = a.get(d);
        from = '兩站一致';
      } else {
        const month = d.slice(0, 7);
        if (!(month in official)) official[month] = fetchOfficial_(month);
        nums = official[month] && official[month].get(d);
        from = '台彩官方';
        if (!nums) {
          skipped.push(`${d}（pilio：${a.get(d) || '無'}／lotto-8：${b.get(d) || '無'}／台彩官方：查不到）`);
          return;
        }
      }
      added.push({ d, nums, from });
    });

    if (added.length) {
      appendRows_(added.map(x => [x.d, ...x.nums.split(' ').map(Number)]));
      sortSheet_();
    }
    console.log(added.length
      ? '新增 ' + added.length + ' 期：' + added.map(x => `${x.d} ${x.nums}（${x.from}）`).join('、')
      : '沒有新資料');
    if (skipped.length) console.warn('沒寫入（號碼對不上又查不到官方資料）：' + skipped.join('、'));
    if (!a.size || !b.size) console.warn(`有網站沒抓到資料：pilio ${a.size} 期、lotto-8 ${b.size} 期，可能改版了`);
  } finally {
    lock.releaseLock();
  }
}


// ===== 管理者：匯入官方 CSV、刪除一期 =====

/**
 * POST /exec，內容是 JSON 文字：
 *   {"password":"…","action":"check"}                       只檢查密碼
 *   {"password":"…","action":"import","csv":"CSV 全文"}      匯入台彩官方「今彩539_年份.csv」
 *   {"password":"…","action":"delete","date":"2026-10-06"}  刪除一期
 * 回傳 {"ok":true/false,"msg":"…"}
 */
function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, msg: '資料格式錯誤' });
  }

  const pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!pw) return json_({ ok: false, msg: '尚未設定 ADMIN_PASSWORD' });
  if (req.password !== pw) {
    Utilities.sleep(1500);  // 放慢亂猜密碼的速度
    return json_({ ok: false, msg: '密碼錯誤' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (req.action === 'check') return json_({ ok: true, msg: '密碼正確' });
    if (req.action === 'import') return json_(importCsv_(req.csv || ''));
    if (req.action === 'delete') return json_(deleteDraw_(req.date || ''));
    return json_({ ok: false, msg: '不認得的動作：' + req.action });
  } finally {
    lock.releaseLock();
  }
}

// 匯入官方 CSV：同一天以官方為準覆蓋，沒有的新增
function importCsv_(csv) {
  const incoming = parseOfficialCsv(csv);
  if (!incoming.size) return { ok: false, msg: 'CSV 裡沒有讀到今彩539的開獎資料，請確認是台彩官網下載的「今彩539_年份.csv」' };

  const sh = sheet_();
  const rows = readSheet_();
  const index = new Map(rows.map((r, i) => [r.d, i]));
  let updated = 0, same = 0;
  const fresh = [];

  incoming.forEach((nums, d) => {
    if (!index.has(d)) { fresh.push([d, ...nums.split(' ').map(Number)]); return; }
    const r = rows[index.get(d)];
    if (r.n === nums) { same++; return; }
    sh.getRange(index.get(d) + 2, 2, 1, 5).setValues([nums.split(' ').map(Number)]);
    updated++;
  });

  if (fresh.length) appendRows_(fresh);
  if (fresh.length || updated) sortSheet_();
  const msg = `讀到 ${incoming.size} 期：新增 ${fresh.length}、更正 ${updated}、相同 ${same}`;
  console.log('匯入官方 CSV，' + msg);
  return { ok: true, msg };
}

function deleteDraw_(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, msg: '日期格式要是 yyyy-MM-dd' };
  const i = readSheet_().findIndex(r => r.d === date);
  if (i < 0) return { ok: false, msg: '找不到 ' + date };
  sheet_().deleteRow(i + 2);
  console.log('刪除 ' + date);
  return { ok: true, msg: '已刪除 ' + date };
}


// ===== 測試用：看抓號規則對不對（不會寫入） =====

function testParse() {
  const have = new Set(readSheet_().map(r => r.d));
  SITES.forEach(s => {
    const m = fetchSite_(s);
    const latest = [...m.keys()].sort().reverse().slice(0, 3);
    const missing = [...m.keys()].filter(d => !have.has(d)).length;
    console.log(`${s.name}：抓到 ${m.size} 期，最新三期 ${latest.map(d => d + ' ' + m.get(d)).join('、') || '（無）'}；試算表裡還沒有的 ${missing} 期`);
  });
  const month = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM');
  const off = fetchOfficial_(month);
  if (off) {
    const latest = [...off.keys()].sort().reverse().slice(0, 3);
    console.log(`台彩官方（${month}）：抓到 ${off.size} 期，最新三期 ${latest.map(d => d + ' ' + off.get(d)).join('、') || '（無）'}`);
  } else {
    console.log(`台彩官方（${month}）：查詢失敗`);
  }
  console.log(`試算表目前 ${have.size} 期`);
}


// ===== 解析各網站（回傳 Map：日期 yyyy-MM-dd → "n1 n2 n3 n4 n5"，號碼由小到大） =====

// pilio：<td class="date-cell">10/07<br>26(三)</td> <td class="number-cell">05,&nbsp;11,&nbsp;14,&nbsp;18,&nbsp;19</td>
function parsePilio(html) {
  const text = stripTags_(html);
  const re = /(\d\d)\/(\d\d)\s+(\d\d)\s*\([^)]*\)\s+(\d\d?(?:\s*,\s*\d\d?){4})/g;
  const out = new Map();
  for (const m of text.matchAll(re)) put_(out, `20${m[3]}-${m[1]}-${m[2]}`, m[4].match(/\d+/g));
  return out;
}

// lotto-8：<span>2026/10/07</span> 後面接 5 個 <span id="ltonoN">05</span>
function parseLotto8(html) {
  const text = stripTags_(html);
  const re = /(20\d\d)\/(\d\d)\/(\d\d)\s+(\d\d?)\s+(\d\d?)\s+(\d\d?)\s+(\d\d?)\s+(\d\d?)(?!\d)/g;
  const out = new Map();
  for (const m of text.matchAll(re)) put_(out, `${m[1]}-${m[2]}-${m[3]}`, m.slice(4, 9));
  return out;
}

// 台彩官方 API 回傳的 JSON
function parseOfficialJson(body) {
  const out = new Map();
  const list = (JSON.parse(body).content || {}).daily539Res || [];
  list.forEach(x => put_(out, String(x.lotteryDate).slice(0, 10), x.drawNumberSize));
  return out;
}

// 台彩官網下載的 CSV：遊戲名稱,期別,開獎日期,銷售總額,銷售注數,總獎金,獎號1,…,獎號5
function parseOfficialCsv(csv) {
  const lines = String(csv).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const out = new Map();
  if (!lines.length) return out;
  const head = lines[0].split(',').map(s => s.trim());
  const iDate = head.indexOf('開獎日期');
  const iNum = head.indexOf('獎號1');
  const iGame = head.indexOf('遊戲名稱');
  if (iDate < 0 || iNum < 0) return out;
  lines.slice(1).forEach(l => {
    const c = l.split(',').map(s => s.trim());
    if (iGame >= 0 && c[iGame] !== '今彩539') return;
    const dm = (c[iDate] || '').match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!dm) return;
    put_(out, `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`, c.slice(iNum, iNum + 5));
  });
  return out;
}

// 檢查 5 個號碼都在 1–39、沒有重複，才放進結果
function put_(out, date, nums) {
  const n = (nums || []).map(Number).sort((x, y) => x - y);
  const ok = n.length === 5 && new Set(n).size === 5 && n.every(v => Number.isInteger(v) && v >= 1 && v <= 39);
  if (ok && /^\d{4}-\d{2}-\d{2}$/.test(date)) out.set(date, n.join(' '));
}

function stripTags_(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ');
}


// ===== 抓網頁 =====

function fetchSite_(site) {
  try {
    const res = UrlFetchApp.fetch(site.url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.getResponseCode() !== 200) {
      console.warn(`${site.name} 回應 ${res.getResponseCode()}`);
      return new Map();
    }
    return site.parse(res.getContentText('UTF-8'));
  } catch (err) {
    console.warn(`${site.name} 抓取失敗：${err}`);
    return new Map();
  }
}

// 查詢失敗回傳 null
function fetchOfficial_(month) {
  try {
    const res = UrlFetchApp.fetch(Utilities.formatString(OFFICIAL_API, month), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      console.warn(`台彩官方回應 ${res.getResponseCode()}`);
      return null;
    }
    return parseOfficialJson(res.getContentText('UTF-8'));
  } catch (err) {
    console.warn(`台彩官方查詢失敗：${err}`);
    return null;
  }
}


// ===== 試算表 =====

function sheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  if (!sh) throw new Error('找不到工作表「' + SHEET + '」，請確認工作表名稱');
  return sh;
}

// 回傳 [{d:'2024-01-01', n:'3 9 27 30 33'}, …]，跳過標題列和空白列
function readSheet_() {
  const sh = sheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues()
    .filter(r => r[0])
    .map(r => ({ d: r[0].trim(), n: r.slice(1, 6).map(Number).sort((x, y) => x - y).join(' ') }));
}

// A 欄先設成純文字，避免日期被自動轉格式
function appendRows_(rows) {
  const sh = sheet_();
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, 1).setNumberFormat('@');
  sh.getRange(start, 1, rows.length, 6).setValues(rows);
}

function sortSheet_() {
  const sh = sheet_();
  if (sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, 6).sort(1);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
