/**
 * 香港六合彩：資料後端（2026/10/11 新增）
 *
 * 工作表 marksix：第 1 列是標題，
 *   A 欄日期（純文字 yyyy-MM-dd）、B 欄期號（例如 26/108）、C–H 欄 6 個號碼（由小到大）、I 欄特別號、
 *   J–P 欄頭獎到七獎每注（10 元）派彩（2026/10/11 加入；沒人中或還沒公布是 0）。
 * 資料來源：香港賽馬會官方（info.cld.hkjc.com 的 GraphQL），這是官方資料，所以只用一個來源。
 *
 * 函式：
 *   importMarkSixHistory()  手動執行一次：從 2024/1/1 起抓全部歷史，寫入工作表 marksix（會先清空）
 *   dailyMarkSix()          每晚觸發器執行：抓最近 10 期，試算表沒有的補進去
 *   testMarkSix()           手動執行：在記錄裡顯示抓到幾期、最新三期，不寫入
 *   doGet(?game=m6)         由 Code.gs 的 doGet 轉過來，回傳六合彩資料
 */

const M6_SHEET = 'marksix';
const M6_START = '2024-01-01';
const M6_API = 'https://info.cld.hkjc.com/graphql/base/';
// 賽馬會只接受跟它網站一模一樣的查詢文字（換行、空白都要一樣），不能改動
const M6_QUERY = `query marksixResult($lastNDraw: Int, $startDate: String, $endDate: String, $drawType: LotteryDrawType) {
  lotteryDraws(
    lastNDraw: $lastNDraw
    startDate: $startDate
    endDate: $endDate
    drawType: $drawType
  ) {
    ...lotteryDrawsFragment
  }
}

fragment lotteryDrawsFragment on LotteryDraw {
  id
  year
  no
  openDate
  closeDate
  drawDate
  status
  snowballCode
  snowballName_en
  snowballName_ch
  lotteryPool {
    sell
    status
    totalInvestment
    jackpot
    unitBet
    estimatedPrize
    derivedFirstPrizeDiv
    lotteryPrizes {
      type
      winningUnit
      dividend
    }
  }
  drawResult {
    drawnNo
    xDrawnNo
  }
}`;


// ===== 給前端讀資料 =====

// GET /exec?game=m6 → {"draws":[{"d":"2024-01-02","no":"24/001","n":[...6 個],"s":特別號,"p":[頭獎…七獎派彩]}, ...]}，由舊到新
function doGetMarkSix_() {
  const draws = readMarkSix_().map(r => ({ d: r.d, no: r.no, n: r.n, s: r.s, p: r.p }));
  return json_({ draws });
}


// ===== 抓資料 =====

// 回傳 [{d, no, n:[6 個由小到大], s}]（由舊到新）；查詢失敗回傳 null
function fetchMarkSix_(variables) {
  try {
    const res = UrlFetchApp.fetch(M6_API, {
      method: 'post',
      contentType: 'application/json',
      headers: { Origin: 'https://bet.hkjc.com', Referer: 'https://bet.hkjc.com/' },
      payload: JSON.stringify({ operationName: 'marksixResult', variables, query: M6_QUERY }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) { console.warn('賽馬會回應 ' + res.getResponseCode()); return null; }
    const body = JSON.parse(res.getContentText('UTF-8'));
    if (body.errors) { console.warn('賽馬會回應錯誤：' + JSON.stringify(body.errors).slice(0, 200)); return null; }
    return parseMarkSix((body.data && body.data.lotteryDraws) || []);
  } catch (err) {
    console.warn('賽馬會查詢失敗：' + err);
    return null;
  }
}

// 只留已開獎、號碼正確（6 個 1–49 不重複，特別號也在 1–49 且不重複）的期數
function parseMarkSix(list) {
  const out = [];
  list.forEach(x => {
    const r = x.drawResult || {};
    const n = (r.drawnNo || []).map(Number).sort((a, b) => a - b), s = Number(r.xDrawnNo);
    const ok = n.length === 6 && new Set(n.concat([s])).size === 7 && n.concat([s]).every(v => Number.isInteger(v) && v >= 1 && v <= 49);
    const d = String(x.drawDate || '').slice(0, 10);
    if (!ok || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const p = [1, 2, 3, 4, 5, 6, 7].map(t => { const z = ((x.lotteryPool || {}).lotteryPrizes || []).find(q => +q.type === t); return z ? Number(z.dividend) || 0 : 0; });
    out.push({ d, no: String(x.year).slice(2) + '/' + String(x.no).padStart(3, '0'), n, s, p });
  });
  return out.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
}

const ymd8_ = d => d.replace(/-/g, '');


// ===== 匯入歷史（手動執行一次） =====

function importMarkSixHistory() {
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const all = new Map();
  // 一次查一季，避免一次要太多
  let y = +M6_START.slice(0, 4), q = 0;
  while (true) {
    const from = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    if (from > today) break;
    const toDate = new Date(Date.UTC(y, q * 3 + 3, 0));
    const to = Utilities.formatDate(toDate, 'UTC', 'yyyy-MM-dd');
    const got = fetchMarkSix_({ lastNDraw: null, startDate: ymd8_(from), endDate: ymd8_(to), drawType: 'All' });
    if (!got) throw new Error(`抓 ${from} ~ ${to} 失敗，請看上面的記錄`);
    got.forEach(r => all.set(r.d, r));
    console.log(`${from} ~ ${to}：${got.length} 期`);
    q++; if (q === 4) { q = 0; y++; }
  }
  const rows = [...all.values()].sort((a, b) => a.d < b.d ? -1 : 1);
  const sh = m6Sheet_(true);
  sh.clear();
  sh.getRange(1, 1, rows.length + 1, 2).setNumberFormat('@');
  sh.getRange(1, 1, 1, 16).setValues([['日期', '期號', '號1', '號2', '號3', '號4', '號5', '號6', '特別號', '頭獎', '二獎', '三獎', '四獎', '五獎', '六獎', '七獎']]);
  if (rows.length) sh.getRange(2, 1, rows.length, 16).setValues(rows.map(r => [r.d, r.no, ...r.n, r.s, ...r.p]));
  console.log(`匯入完成：共 ${rows.length} 期，${rows[0].d}（${rows[0].no}）到 ${rows[rows.length - 1].d}（${rows[rows.length - 1].no}）`);
}


// ===== 每晚自動抓號 =====

function dailyMarkSix() {
  // 第一次（還沒有工作表或是空的）先自動匯入歷史
  if (!readMarkSix_().length) { importMarkSixHistory(); return; }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const got = fetchMarkSix_({ lastNDraw: 10, startDate: null, endDate: null, drawType: 'All' });
    if (!got) { console.warn('六合彩：這次沒抓到資料'); return; }
    const rows = readMarkSix_(), at = new Map(rows.map((r, i) => [r.d, i]));
    const sh = m6Sheet_();
    // 派彩可能開獎後才公布：已經有的期數，派彩不一樣就更新
    let fixed = 0;
    got.forEach(r => { if (at.has(r.d) && rows[at.get(r.d)].p.join() !== r.p.join()) { sh.getRange(at.get(r.d) + 2, 10, 1, 7).setValues([r.p]); fixed++; } });
    const add = got.filter(r => r.d >= M6_START && !at.has(r.d));
    if (add.length) {
      const start = sh.getLastRow() + 1;
      sh.getRange(start, 1, add.length, 2).setNumberFormat('@');
      sh.getRange(start, 1, add.length, 16).setValues(add.map(r => [r.d, r.no, ...r.n, r.s, ...r.p]));
      if (sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, 16).sort(1);
    }
    if (fixed) console.log('六合彩更新派彩 ' + fixed + ' 期');
    console.log(add.length ? '六合彩新增 ' + add.length + ' 期：' + add.map(r => `${r.d}（${r.no}）${r.n.join(' ')} 特 ${r.s}`).join('、') : '六合彩沒有新資料');
  } finally {
    lock.releaseLock();
  }
}


// ===== 測試用（不會寫入） =====

function testMarkSix() {
  const got = fetchMarkSix_({ lastNDraw: 10, startDate: null, endDate: null, drawType: 'All' });
  if (!got) { console.log('六合彩：查詢失敗（可能是 Google 的伺服器連不到賽馬會）'); return; }
  const latest = got.slice(-3).reverse();
  console.log(`六合彩：抓到 ${got.length} 期，最新三期 ${latest.map(r => `${r.d}（${r.no}）${r.n.join(' ')} 特 ${r.s}`).join('、')}`);
  const have = readMarkSix_();
  console.log(`試算表 marksix 目前 ${have.length} 期`);
}


// ===== 試算表 =====

function m6Sheet_(create) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(M6_SHEET);
  if (!sh && create) sh = ss.insertSheet(M6_SHEET);
  if (!sh) throw new Error('找不到工作表「' + M6_SHEET + '」，請先執行 importMarkSixHistory');
  return sh;
}

function readMarkSix_() {
  const ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(M6_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues()
    .filter(r => r[0])
    .map(r => ({ d: String(r[0]).trim(), no: String(r[1]).trim(), n: r.slice(2, 8).map(Number), s: Number(r[8]), p: r.slice(9, 16).map(v => Number(v) || 0) }));
}
