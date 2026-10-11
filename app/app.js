/* 539 尾數觀察站：載入資料、切換分頁、畫畫面
 * 畫面從 reference/539-tail.html 搬過來；統計計算在 stats.js。
 */
(function(){
const API = "https://script.google.com/macros/s/AKfycby_Za-SJp2fteT4vLspntfLjBp_GrRQpeihMLbOnnDDCgN05NzkqDXCb6wDAtK50LNH/exec";
const LS_KEY = "t539_draws_v2";

// 底部導覽 4 組，每組上方再用切換鈕換頁
const GROUPS = {
  tail: [["dist","分布"],["gap","遺漏"],["trend","走勢"],["cross","交叉比對"]],
  num:  [["num","單號冷熱"],["ngap","單號遺漏"],["rep","連莊"],["combo","組合特徵"]],
  hist: [["hist","歷史"]],
  test: [["test","選號回測"],["ev","期望值"],["sig","6中3訊號"]],
  help: [["howto","使用教學"],["faq","常見問題"]],
  data: [["data","資料"]]
};
const APP_URL = "https://bailixiao.github.io/539-app/app/";
const NAV_KEY = "t539_nav";
const ADMIN_KEY = "t539_admin";  // 管理者密碼只存在這支手機，按「登出」就清掉

const S = {
  group: "tail", tab: "dist", last: {}, range: 100, draws: [], source: "loading", fetchedAt: 0,
  randomPick: null, test: null, ev: null, evPer: 1,
  btWin: 150, sigW: 150, histN: 100, admin: "", csv: null, msg: "", msgErr: false, busy: false, refreshing: false
};
try{ S.admin = localStorage.getItem(ADMIN_KEY) || ""; }catch(e){}

/* ---------- 資料存取 ---------- */
function sortDraws(a){ return a.slice().sort((x,y)=>x.d<y.d?-1:x.d>y.d?1:0); }
function valid(x){ return x && /^\d{4}-\d{2}-\d{2}$/.test(x.d) && Array.isArray(x.n) && x.n.length===5 && x.n.every(v=>v>=1&&v<=39); }

function readCache(){
  try{ const r = JSON.parse(localStorage.getItem(LS_KEY)); return r && Array.isArray(r.draws) && r.draws.length ? r : null; }
  catch(e){ return null; }
}
function writeCache(draws, at){
  try{ localStorage.setItem(LS_KEY, JSON.stringify({draws, at})); }catch(e){}
}

// 先顯示手機裡存的上一份資料，再向 Apps Script 拿最新的；拿不到就繼續用存的
async function loadDraws(){
  const cached = readCache();
  if(cached){ S.draws = cached.draws; S.fetchedAt = cached.at; S.source = "checking"; render(); }
  await fetchLatest();
}
async function fetchLatest(){
  try{
    const res = await fetch(API, {cache: "no-store"});
    if(!res.ok) throw new Error("HTTP " + res.status);
    const list = sortDraws(((await res.json()).draws || []).filter(valid));
    if(!list.length) throw new Error("沒有資料");
    S.draws = list; S.fetchedAt = Date.now(); S.source = "online";
    writeCache(list, S.fetchedAt);
  }catch(e){
    S.source = S.draws.length ? "cache" : "error";
  }
  S.test = null; S.ev = null; S.sig = null;
  if(typeof S.sigTest!=="number") S.sigTest = null;
  render();
}

// 管理者動作：送到 Apps Script 的 doPost。用 text/plain 送，瀏覽器才不會多做一次跨網域檢查
async function adminPost(body){
  const res = await fetch(API, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify(body)});
  if(!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

/* ---------- 開獎日與更新提醒（台灣時間） ---------- */
const WEEK = ["日","一","二","三","四","五","六"];
const twNow = () => new Date(Date.now() + 8*3600e3);  // 用 getUTC* 讀，就是台灣時間
const ymd = d => d.toISOString().slice(0,10);
// 最後一期之後，有幾個開獎日（週一到週六）已經過了晚上 10 點、卻還沒有資料
function missedDraws(last){
  const now = twNow(), today = ymd(now), d = new Date(last + "T00:00:00Z");
  let n = 0;
  for(let i=0; i<400; i++){
    d.setUTCDate(d.getUTCDate()+1);
    const s = ymd(d);
    if(s > today || (s === today && now.getUTCHours() < 22)) break;
    if(d.getUTCDay() !== 0) n++;
  }
  return n;
}
function dateLabel(s){ const d=new Date(s+"T00:00:00Z"); return `${d.getUTCMonth()+1}/${d.getUTCDate()}（${WEEK[d.getUTCDay()]}）`; }

/* ---------- 畫面 ---------- */
const $ = s => document.querySelector(s);
const pad2 = v => String(v).padStart(2,"0");
function ballHTML(v){ return `<span class="gball">${pad2(v)}</span>`; }
const sballHTML = v => `<span class="gball sm">${pad2(v)}</span>`;
const sballs = a => `<span class="sballs">${a.map(sballHTML).join("")}</span>`;
function gballHTML(v){ return `<span class="gball">${pad2(v)}</span>`; }
// 期別 = 民國年 × 1,000,000 + 當年第幾期（資料從 2024/1/1 起完整，所以可以照順序算）
const PERIODS=new WeakMap();
function periods(L){
  let p=PERIODS.get(L); if(p) return p;
  p=[]; let y="", k=0;
  L.forEach(x=>{ const yy=x.d.slice(0,4); if(yy!==y){ y=yy; k=0; } k++; p.push(String((+yy-1911)*1000000+k)); });
  PERIODS.set(L,p); return p;
}
function recent(){ return S.range==="all" ? S.draws : S.draws.slice(-S.range); }
function fmtTime(t){ const d=new Date(t); return `${d.getMonth()+1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function rangeHTML(){
  const opts=[[10,"近 10 期"],[15,"近 15 期"],[20,"近 20 期"],[25,"近 25 期"],[30,"近 30 期"],[40,"近 40 期"],[100,"近 100 期"],[200,"近 200 期"],[300,"近 300 期"],["all","全部"]];
  return `<div class="range">統計範圍 <select id="rangeSel">${opts.map(([v,t])=>`<option value="${v}" ${String(S.range)===String(v)?"selected":""}>${t}</option>`).join("")}</select></div>`;
}
function emptyHTML(){
  if(S.source==="loading") return `<div class="panel empty">讀取資料中…</div>`;
  return `<div class="panel empty">讀不到開獎資料。<br>請確認網路連線，再重新整理頁面。</div>`;
}

function viewDist(){
  const L=recent(); if(!L.length) return emptyHTML();
  const {c, exp, chi}=tailDist(L);
  const max=Math.max(...c, ...exp)*1.08;
  const rows=c.map((o,d)=>{
    const dev=(o-exp[d])/exp[d]*100, cls=dev>10?"hot":dev<-10?"cold":"";
    return `<div class="row"><div class="digit">${d}</div>
      <div class="track"><div class="fill ${cls}" style="width:${o/max*100}%"></div><div class="exp" style="left:${exp[d]/max*100}%"></div></div>
      <div class="val">${o} 次<span>${dev>=0?"+":""}${dev.toFixed(0)}%</span></div></div>`;
  }).join("");
  const ok=chi<16.92;
  return `<div class="panel"><h2>各尾數出現次數</h2>
    <p class="note">黑色直線是理論期望值。尾 0 只有 10、20、30 三個號碼，期望值本來就比較低。</p>
    ${rangeHTML()}<div class="rows">${rows}</div>
    <div class="verdict ${ok?"":"warn"}">卡方值 ${chi.toFixed(1)}（門檻 16.9）。${ok?"目前的高低差距，落在純隨機就會出現的範圍內。":"差距超過一般隨機波動，可能是資料量少或資料有誤，值得檢查一下資料。"}</div>
    <p class="note">卡方檢定用來判斷「實際次數和理論值的差距，是不是運氣就能解釋」。低於門檻代表運氣就能解釋。</p></div>${coldHTML()}`;
}
function viewCross(){ return S.draws.length ? crossHTML() : emptyHTML(); }

function coldHTML(){
  const rows=coldTails(S.draws);
  if(!rows.length) return "";
  const digits=[...Array(10).keys()];
  const all=digits.filter(d=>rows.length===SHORT_RANGES.length&&rows.every(r=>r.groups.some(g=>g.tails.includes(d))));
  let cells=`<div class="r">尾數</div>`+digits.map(d=>`<div class="h${all.includes(d)?" mark":""}">${d}</div>`).join("");
  rows.forEach(r=>{
    const c=tailCounts(S.draws.slice(-r.n));
    const lv=d=>{ const i=r.groups.findIndex(g=>g.tails.includes(d)); return i<0?"":` k${i+1}`; };
    cells+=`<div class="r">近 ${r.n} 期</div>`+digits.map(d=>`<div class="c${lv(d)}">${c[d]}</div>`).join("");
  });
  return `<div class="panel"><h2>近 10–30 期最少出的尾數</h2>
    <p class="note">格子裡是各尾數的實際出現次數。每一列各自排名，藍色是最少的 3 名，藍色越濃越少；一樣冷的尾數同色。排名已校正尾 0 只有 3 個號碼，所以尾 0 次數本來就偏低，不一定會被標藍。</p>
    <div class="cgrid">${cells}</div>
    <div class="legend"><span><i style="background:var(--cold)"></i>最少</span><span><i style="background:color-mix(in srgb,var(--cold) 60%,var(--soft))"></i>第 2 少</span><span><i style="background:color-mix(in srgb,var(--cold) 30%,var(--soft))"></i>第 3 少</span></div>
    <div class="verdict">${all.length?`${all.map(d=>`尾 ${d}`).join("、")} 在五個區間都排進最少 3 名（最上面的尾數標成藍色）。`:"沒有尾數在五個區間都排進最少 3 名。"}這幾個區間互相包含（近 10 期也在近 30 期裡），所以常常會看到同一個尾數重複出現，這不代表它下一期比較容易開出。</div></div>`;
}

function crossHTML(){
  const L=S.draws, rows=crossTable(L);
  if(!rows) return `<div class="panel"><h2>近 30 × 近 100 交叉比對</h2><p class="note">至少要 100 期資料才能比對，目前 ${L.length} 期。</p></div>`;
  const zf=v=>`${v>=0?"+":"−"}${Math.abs(v).toFixed(1)}`;
  const zc=v=>v<=-2?' style="color:var(--cold);font-weight:700"':v>=2?' style="color:var(--hot);font-weight:700"':"";
  const both=rows.filter(isDualCold).map(r=>`尾 ${r.d}`);
  const tr=rows.map(r=>{
    const tag=isDualCold(r)?'<span class="tag" style="background:var(--cold);color:#fff">雙冷</span>'
      :isDualHot(r)?'<span class="tag" style="background:var(--hot);color:#fff">雙熱</span>':"";
    return `<tr><td class="d">${r.d}</td><td><span class="n">${r.a.o}</span> <small${zc(r.a.z)}>z ${zf(r.a.z)}</small></td>
      <td><span class="n">${r.b.o}</span> <small${zc(r.b.z)}>z ${zf(r.b.z)}</small></td><td><span class="n">${r.sum}</span></td><td>${tag}</td></tr>`;
  }).join("");
  return `<div class="panel"><h2>近 30 × 近 100 交叉比對</h2>
    <p class="note">兩個區間各自依 z 分數排名，1 = 最冷。z 分數 = 跟理論值的差距 ÷ 正常會晃動的幅度，已同時校正尾 0 只有 3 個號碼、以及期望值小時波動看起來比較大的問題。z 在 ±2 以內算正常晃動，超過才標顏色。合計名次越小，代表短期和中期都偏少。兩邊都在最冷 3 名內，標為「雙冷」。</p>
    <div class="scroll"><table><thead><tr><th>尾數</th><th>近 30 期</th><th>近 100 期</th><th>合計名次</th><th></th></tr></thead><tbody>${tr}</tbody></table></div>
    <div class="verdict">${both.length?`目前雙冷：${both.join("、")}。`:"目前沒有尾數同時在兩個區間都排最冷 3 名。"}注意近 30 期本來就包含在近 100 期裡，所以兩邊會有一部分重疊，不算兩個獨立證據。「雙冷」是不是真的比較會出，可以到「選號回測」看結果。</div></div>`;
}

function viewGap(){
  if(!S.draws.length) return emptyHTML();
  const g=gaps(S.draws);
  const rows=g.map(x=>{
    const prob=Math.pow(1-x.p,x.cur)*100;
    return `<tr><td class="d">${x.d}</td><td><span class="n">${x.cur}</span></td><td><span class="n">${x.longest}</span></td>
      <td><span class="n">${((1-x.p)/x.p).toFixed(1)}</span></td><td><span class="n">${x.cur?prob.toFixed(prob<1?2:1)+"%":"—"}</span></td></tr>`;
  }).join("");
  return `<div class="panel"><h2>遺漏期數</h2>
    <p class="note">目前遺漏：從最新一期往回算，連續幾期沒開出這個尾數。統計全部 ${S.draws.length} 期。</p>
    <div class="scroll"><table><thead><tr><th>尾數</th><th>目前遺漏</th><th>歷史最長</th><th>平均遺漏</th><th>連續遺漏機率</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="verdict">「連續遺漏機率」是指連續這麼多期都沒開出的機率。就算遺漏很久，下一期開出的機率仍然固定：尾 0 約 34.5%，其他尾數約 43.6%，不會因為「很久沒出」而變高。</div></div>`;
}

function viewTrend(){
  if(!S.draws.length) return emptyHTML();
  const L=S.draws.slice(-60), n=L.length;
  let cells="";
  for(let d=0; d<10; d++){
    cells+=`<div class="lab">${d}</div>`;
    L.forEach(x=>{ const k=x.n.filter(v=>v%10===d).length; cells+=`<div class="c ${k>=2?"l2":k===1?"l1":""}" title="${x.d}"></div>`; });
  }
  const w=S.draws.slice(-20), c=tailCounts(w).map((v,d)=>({d,r:v/(w.length*5*K(d)/39)}));
  const s=c.slice().sort((a,b)=>b.r-a.r);
  const tag=a=>a.map(o=>`尾 ${o.d}`).join("、");
  return `<div class="panel"><h2>近 ${n} 期熱冷走勢</h2>
    <p class="note">每一欄是一期，越右邊越新。可以左右滑動。</p>
    <div class="scroll"><div class="heat" style="grid-template-columns:16px repeat(${n},12px)">${cells}</div></div>
    <div class="legend"><span><i style="background:var(--soft)"></i>沒開出</span><span><i style="background:color-mix(in srgb,var(--hot) 45%,var(--soft))"></i>1 個</span><span><i style="background:var(--hot)"></i>2 個以上</span></div>
    <div class="verdict">近 20 期相對最熱：${tag(s.slice(0,3))}；相對最冷：${tag(s.slice(-3).reverse())}。已依各尾數的號碼數量校正。冷熱會一直輪替，到「選號回測」可以看追熱、追冷到底有沒有用。</div></div>`;
}

function viewTest(){
  const rp=S.randomPick;
  let html=`<div class="panel"><h2>隨機選號</h2>
    <p class="note">任何一組號碼中頭獎的機率都是 1/575,757，用統計選和隨機選一樣。</p>
    <div class="picked">${rp?rp.map(ballHTML).join(""):""}</div>
    <div class="btns"><button class="btn" data-act="rand">產生一組號碼</button></div></div>`;
  if(!S.draws.length) return html+emptyHTML();
  const t=S.test;
  html+=`<div class="panel"><h2>策略回測</h2>
    <p class="note">每一期只用「那一期之前」的資料選 5 個號碼，再對當期開獎，從第 101 期一路跑到最新一期。</p>
    <p class="note">追熱尾／追冷尾：前 20 期最熱／最冷的 5 個尾數各挑 1 號。雙冷尾：近 30 × 近 100 交叉比對最冷的 5 個尾數。追熱號／追冷號：前 30 期出現最多／最少的 5 個號碼。追遺漏號：當時最久沒開的 5 個號碼。連莊：直接買上一期的 5 個號碼。隨機：亂數。</p>`;
  if(!t){ html+=`<div class="btns"><button class="btn" data-act="test">開始回測</button></div></div>`; return html; }
  if(t==="few"){ html+=`<p class="msg err">資料至少要 130 期才能回測。</p></div>`; return html; }
  const row=(name,s)=>`<tr><td>${name}</td><td><span class="n">${(s.h/t.n).toFixed(3)}</span></td><td><span class="n">${(s.h2/t.n*100).toFixed(1)}%</span></td><td><span class="n">${(s.h3/t.n*100).toFixed(2)}%</span></td><td><span class="n">${(s.pay/(t.n*50)*100).toFixed(0)}%</span></td></tr>`;
  html+=`<div class="scroll"><table><thead><tr><th>策略</th><th>平均中幾號</th><th>中 2+</th><th>中 3+</th><th>回收率</th></tr></thead><tbody>
    ${STRATS.map(([k,name])=>row(name,t.st[k])).join("")}
    <tr class="theo"><td>理論值</td><td><span class="n">0.641</span></td><td><span class="n">11.4%</span></td><td><span class="n">1.00%</span></td><td><span class="n">56%</span></td></tr></tbody></table></div>
    <div class="verdict">共回測 ${t.n} 期，每期每種策略買一注 50 元。所有策略如果都在理論值附近上下跳動，就代表用歷史資料選號沒有比亂數厲害。回收率波動很大，因為只要剛好中一次貳獎（2 萬元）就會拉高好幾十 %，這是運氣不是策略。</div>
    <div class="btns"><button class="btn ghost" data-act="test">重新回測</button></div></div>`;
  return html;
}

function viewNum(){
  const L=recent(); if(!L.length) return emptyHTML();
  const {E, arr, chi}=numStats(L);
  const gaps=numGaps(S.draws), latest=S.draws[S.draws.length-1].n;
  const maxO=Math.max(...arr.map(x=>x.o)), maxG=Math.max(...gaps.map(x=>x.cur));
  const cells=arr.map((x,i)=>{
    const g=gaps[i].cur;
    return `<div class="hc${latest.includes(x.v)?" new":""}"><div class="gbox">${gballHTML(x.v)}</div>
      <div class="hn"><span class="ho${x.o===maxO?" mx":""}">${x.o}</span><span class="hg${g===maxG?" mx":""}">${g}</span></div></div>`;
  }).join("");
  const s=arr.slice().sort((a,b)=>b.z-a.z);
  const li=a=>a.map(x=>`<div class="it">${sballHTML(x.v)}<span>${x.o} 次</span><span class="n">z ${x.z>=0?"+":"−"}${Math.abs(x.z).toFixed(1)}</span></div>`).join("");
  const ok=chi<53.4, n=L.length;
  return `<div class="panel"><h2>單號冷熱</h2>
    ${rangeHTML()}
    <div class="hlegend"><span><b class="ho">紅色</b>：近 ${n} 期開出次數（平均 ${E.toFixed(1)} 次）</span><span><b class="hg">藍色</b>：已經幾期沒開（平均 ${((1-P_NUM)/P_NUM).toFixed(1)} 期）</span></div>
    <div class="hgrid">${cells}</div>
    <p class="note">框起來的是最新一期（${dateLabel(S.draws[S.draws.length-1].d)}）開出的號碼；紅底是開出最多次，藍底是最久沒開。「幾期沒開」不受統計範圍影響，一律從最新一期往回算。</p></div>
    <div class="panel"><div class="two"><div><h2>最熱 5 號</h2><div class="list">${li(s.slice(0,5))}</div></div>
    <div><h2>最冷 5 號</h2><div class="list">${li(s.slice(-5).reverse())}</div></div></div>
    <div class="verdict ${ok?"":"warn"}">39 個號碼的卡方值 ${chi.toFixed(1)}（門檻 53.4）。${ok?"冷熱差距在純隨機的範圍內。":"差距超過一般隨機波動，可以檢查資料，或是資料期數太少。"}單號切得比尾數細，每格的樣本更少，所以看起來會比尾數更「冷熱分明」，但那多半是雜訊。</div></div>`;
}

function viewHist(){
  const L=S.draws; if(!L.length) return emptyHTML();
  const P=periods(L), n=S.histN==="all"?L.length:Math.min(S.histN, L.length);
  const opts=[[10,"最近 10 期"],[20,"最近 20 期"],[30,"最近 30 期"],[40,"最近 40 期"],[100,"最近 100 期"],[200,"最近 200 期"],["all","全部"]];
  const rows=[];
  for(let i=L.length-1;i>=L.length-n;i--){
    const d=new Date(L[i].d+"T00:00:00Z");
    rows.push(`<div class="hrow"><div class="hmeta"><span>${P[i]}</span><span>${L[i].d}（${WEEK[d.getUTCDay()]}）</span></div><div class="hballs">${L[i].n.map(gballHTML).join("")}</div></div>`);
  }
  return `<div class="panel hpanel"><div class="hhead"><h2>開獎歷史</h2>
    <select id="histSel">${opts.map(([v,t])=>`<option value="${v}" ${String(S.histN)===String(v)?"selected":""}>${t}</option>`).join("")}</select></div>
    <p class="note" style="padding:0 16px">號碼依大小排列。共 ${L.length} 期，從 ${L[0].d} 開始。</p>
    <div class="hlist">${rows.join("")}</div></div>`;
}

function viewNgap(){
  const L=S.draws; if(!L.length) return emptyHTML();
  const g=numGaps(L).sort((a,b)=>b.cur-a.cur||a.v-b.v);
  const avg=(1-P_NUM)/P_NUM;
  // 尾數遺漏：超過該尾數平均遺漏 3 倍算「尾數也很久沒開」（尾 0 平均約 1.9 期，其他約 1.3 期）
  const tg=gaps(L), tailLong=d=>tg[d].cur>=3*(1-tg[d].p)/tg[d].p;
  const both=x=>x.cur>=avg*3 && tailLong(x.v%10);
  const md=s=>s?`${+s.slice(5,7)}/${+s.slice(8,10)}`:"—";
  const rows=g.map(x=>{
    const pct=x.prob*100, strong=x.cur>=avg*3;
    return `<tr><td class="d"><div class="dcell">${sballHTML(x.v)}${both(x)?'<span class="tag dtag">雙遺漏</span>':""}</div></td><td><span class="n"${strong?' style="color:var(--cold);font-weight:700"':""}>${x.cur}</span></td><td><span class="n">${x.longest}</span></td>
      <td><span class="n">${md(x.last)}</span></td><td><span class="n">${x.cur?pct.toFixed(pct<1?2:1)+"%":"—"}</span></td></tr>`;
  }).join("");
  const top=g[0], dual=g.filter(both);
  const tailLine=tg.map(t=>`<span style="white-space:nowrap${tailLong(t.d)?";color:var(--cold);font-weight:700":""}">尾 ${t.d}：${t.cur}</span>`).join("、");
  const crossPanel=`<div class="panel"><h2>號碼 × 尾數 遺漏比對</h2>
    <p class="note">把「單號遺漏」和「尾數遺漏」放在一起看：號碼本身超過 ${Math.round(avg*3)} 期沒開，而且它的尾數也超過平均 3 倍沒開（尾 0 是 6 期以上，其他尾數 4 期以上），標為「雙遺漏」。</p>
    <p class="note">各尾數目前遺漏（期）：${tailLine}</p>
    <div class="verdict">${dual.length?`目前雙遺漏：${dual.map(x=>`${sballHTML(x.v)}（${x.cur} 期，尾 ${x.v%10} 已 ${tg[x.v%10].cur} 期）`).join("、")}。`:`目前沒有雙遺漏的號碼。`}這只是觀察：號碼和尾數遺漏多久，下一期開出的機率都不變。「追遺漏號」到底有沒有用，可以到「選號回測」看實際結果。</div></div>`;
  return crossPanel+`<div class="panel"><h2>單號遺漏</h2>
    <p class="note">「遺漏」是每個號碼從最新一期往回算，連續幾期沒開出，最久沒開的排最前面。「最長」是統計全部 ${L.length} 期（從 ${L[0].d} 開始）裡，最久連續幾期沒開。「遺漏機率」是連續這麼多期都沒開的機率。平均每個號碼約 ${avg.toFixed(1)} 期會開出一次，目前遺漏超過 ${Math.round(avg*3)} 期的標成藍色。</p>
    <div class="scroll"><table><thead><tr><th>號碼</th><th>遺漏</th><th>最長</th><th>最後開出</th><th>遺漏機率</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="verdict">目前最久沒開的是 ${sballHTML(top.v)}，已經 ${top.cur} 期。單看一個號碼，連續 ${top.cur} 期沒開的機率只有 ${(top.prob*100).toFixed(top.prob<0.01?2:1)}%，但一共有 39 個號碼，總會有某個號碼剛好拖很久，這很常見。不管遺漏多久，每個號碼下一期開出的機率都一樣是 ${(P_NUM*100).toFixed(1)}%，不會因為「很久沒出」而變高。</div>
    <p class="note">「冷熱」看的是一段期間總共開幾次，「遺漏」看的是最近連續幾期沒開，兩個是不同的數字。例如一個號碼近 100 期開了 10 次，但如果全都集中在前面，最近還是可能很久沒開。</p></div>`;
}

function viewRep(){
  const L=S.draws; if(L.length<2) return emptyHTML();
  const {ks, n, mean}=repeatStats(L);
  const maxP=Math.max(...ks.map(k=>k/n),...REP_THEO)*1.08;
  const rows=ks.map((k,j)=>`<div class="row wide"><div class="lbl">${j} 個</div>
    <div class="track"><div class="fill" style="width:${k/n/maxP*100}%"></div><div class="exp" style="left:${REP_THEO[j]/maxP*100}%"></div></div>
    <div class="val">${(k/n*100).toFixed(1)}%<span>理論 ${(REP_THEO[j]*100).toFixed(REP_THEO[j]<0.01?2:1)}%</span></div></div>`).join("");
  const last=L[L.length-1], prev=L[L.length-2];
  const rep=last.n.filter(v=>prev.n.includes(v));
  return `<div class="panel"><h2>連莊統計</h2>
    <p class="note">每一期跟上一期比，有幾個號碼重複開出。統計全部 ${n} 組相鄰兩期，白線／黑線是理論值。</p>
    <div class="rows">${rows}</div>
    <div class="verdict">實際平均每期連莊 ${mean.toFixed(3)} 個，理論值 0.641 個。最新一期 ${last.d} ${rep.length?`連莊了 ${sballs(rep)}`:"沒有連莊號碼"}。「上期開過的號碼這期比較容易再出」如果是真的，實際值會明顯高於理論值；兩者接近，就代表上一期對這一期沒有影響。</div></div>`;
}

function featBlock(title,note,labels,theo,act,N){
  const maxP=Math.max(...act.map(a=>a/N),...theo)*1.08;
  const best=theo.indexOf(Math.max(...theo));
  return `<div class="panel"><h2>${title}</h2><p class="note">${note}</p><div class="rows">${labels.map((l,j)=>`<div class="row wide"><div class="lbl">${l}</div>
    <div class="track"><div class="fill" style="width:${act[j]/N/maxP*100}%"></div><div class="exp" style="left:${theo[j]/maxP*100}%"></div></div>
    <div class="val">${(act[j]/N*100).toFixed(1)}%<span>理論 ${(theo[j]*100).toFixed(1)}%</span></div></div>`).join("")}</div>
    <p class="note">理論上最常見的是「${labels[best]}」，有 ${Math.round(theo[best]*575757).toLocaleString()} 組號碼屬於這一類。</p></div>`;
}
function viewCombo(){
  const L=recent(); if(!L.length) return emptyHTML();
  const T=theory(), N=L.length, A=comboCounts(L);
  const ratio=[0,1,2,3,4,5].map(k=>`${k}:${5-k}`);
  return `<div class="panel"><h2>組合特徵</h2>
    <p class="note">把每期開出的 5 個號碼，依和值、奇偶、大小、連號分類，看實際出現比例跟理論值差多少。理論值是把全部 575,757 種組合一一算出來的。</p>${rangeHTML()}</div>
    ${featBlock("和值","5 個號碼加起來的總和，平均是 100。",SUM_LABELS,T.sum,A.sum,N)}
    ${featBlock("奇偶比（奇:偶）","1–39 有 20 個奇數、19 個偶數。",ratio,T.odd,A.odd,N)}
    ${featBlock("大小比（大:小）","大號 20–39 共 20 個，小號 1–19 共 19 個。",ratio,T.big,A.big,N)}
    ${featBlock("連號","相鄰號碼（例如 12、13）算一組連號。",["無連號","1 組","2 組以上"],T.cons,A.cons,N)}
    <div class="panel"><div class="verdict">這頁最重要的觀念：「3:2 最常出」「和值 80–119 最常見」都是真的，但原因只是這些類別包含的號碼組合比較多。你買的永遠是「一組」號碼，任何一組中頭獎的機率都是 1/575,757，不管它是 3:2 還是 5:0。</div></div>`;
}

function viewEV(){
  const {rows:pr, pre}=evTable();
  const rows=pr.map(x=>`<tr><td>${x.name}</td><td>${x.cond}</td><td><span class="n">1/${Math.round(575757/x.c).toLocaleString()}</span></td><td><span class="n">${x.p.toLocaleString()}</span></td><td><span class="n">${x.e.toFixed(2)}</span></td></tr>`).join("");
  const per=S.evPer, yr=312, cost=per*50*yr;
  let html=`<div class="panel"><h2>每注期望值</h2>
    <p class="note">期望值 = 每個獎項的「中獎機率 × 獎金」加起來，代表長期平均每買一注能拿回多少錢。</p>
    <div class="scroll"><table><thead><tr><th>獎項</th><th>條件</th><th>機率</th><th>獎金</th><th>期望值</th></tr></thead><tbody>${rows}
    <tr class="theo"><td colspan="4">合計（稅前）</td><td><span class="n">${pre.toFixed(2)}</span></td></tr></tbody></table></div>
    <div class="verdict warn">每注 50 元，平均只拿回 ${pre.toFixed(1)} 元，回收率約 ${(pre/50*100).toFixed(0)}%。也就是說，長期每買 100 元，平均會虧掉約 ${(100-pre/50*100).toFixed(0)} 元。</div>
    <p class="note">以上都是稅前金額。頭獎若同期超過 3 注中獎，總額 2,400 萬由大家均分，實際期望值還會再低一點。</p></div>`;
  html+=`<div class="panel"><h2>一年會花多少</h2>
    <div class="range">每期買 <select id="evPer">${[1,2,5,10].map(v=>`<option value="${v}" ${v===per?"selected":""}>${v} 注</option>`).join("")}</select>，一年約 ${yr} 期</div>
    <div class="kpis"><div><span>一年花費</span><b>${cost.toLocaleString()}</b></div><div><span>平均拿回（稅前）</span><b>${Math.round(per*yr*pre).toLocaleString()}</b></div><div><span>平均淨虧</span><b class="neg">${Math.round(cost-per*yr*pre).toLocaleString()}</b></div></div></div>`;
  const ev=S.ev;
  html+=`<div class="panel"><h2>用真實開獎資料模擬</h2>
    <p class="note">假設有 1,000 個人，每個人在過去 ${S.draws.length} 期每期都買一注隨機號碼，看最後各賺賠多少。</p>`;
  if(S.draws.length<10) return html+`<p class="note">資料不足。</p></div>`;
  if(!ev) return html+`<div class="btns"><button class="btn" data-act="ev">開始模擬</button></div></div>`;
  html+=`<div class="kpis"><div><span>每人花費</span><b>${ev.cost.toLocaleString()}</b></div><div><span>中位數回收率</span><b>${((ev.med+ev.cost)/ev.cost*100).toFixed(0)}%</b></div><div><span>最後賺錢的人</span><b>${ev.win} / 1000</b></div></div>
    <div class="kpis"><div><span>最好的人</span><b>${ev.best>=0?"+":""}${ev.best.toLocaleString()}</b></div><div><span>中位數</span><b class="neg">${ev.med.toLocaleString()}</b></div><div><span>最差的人</span><b class="neg">${ev.worst.toLocaleString()}</b></div></div>
    <div class="verdict">1,000 人全部加起來平均回收率是 ${(ev.avg*100).toFixed(0)}%${ev.jack?`（其中 ${ev.jack} 人中過頭獎，把平均拉高很多）`:""}，但「一般人」看中位數：只拿回 ${((ev.med+ev.cost)/ev.cost*100).toFixed(0)}%。${ev.win?`賺錢的 ${ev.win} 人，都是中過頭獎或至少兩次貳獎。`:"沒有任何人賺錢。"}<br>這是彩券最反直覺的地方：56% 的期望值，大部分是靠極少數人中大獎撐起來的。沒中大獎的人，只靠參獎、肆獎，回收率大約只有 16%。</div>
    <div class="btns"><button class="btn ghost" data-act="ev">再模擬一次</button></div></div>`;
  return html;
}

/* ---------- 說明：使用教學、常見問題 ---------- */
const ICON_SHARE = `<svg class="ico" viewBox="0 0 24 24" aria-label="分享鈕"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M6 11H5v10h14V11h-1"/></svg>`;
const ICON_ADD = `<svg class="ico" viewBox="0 0 24 24" aria-label="加入主畫面圖示"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>`;
const ICON_MORE = `<svg class="ico" viewBox="0 0 24 24" aria-label="選單鈕"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>`;
const goBtn = (g,t,label) => `<button class="btn ghost" data-go="${g}:${t}">${label}</button>`;
const shot = (src,alt) => `<img class="shot" src="help/${src}" alt="${alt}" loading="lazy">`;

function viewHowto(){
  return `<div class="panel"><h2>1. 打開 app</h2>
    <p class="note">用手機瀏覽器打開下面的網址，或用相機掃 QR code。不用註冊、不用登入。</p>
    <p class="url">${APP_URL}</p>
    <img class="qr" src="help/qrcode.png" alt="app 網址的 QR code" loading="lazy"></div>

  <div class="panel"><h2>2. 加到主畫面（變成 app）</h2>
    <p class="note">加到主畫面後，就像一般 app 一樣從圖示打開，全螢幕、沒網路也打得開。</p>
    <h3>iPhone（一定要用 Safari）</h3>
    <ol class="steps">
      <li>用 <b>Safari</b> 打開網址（從 LINE 點開的話，先按右上或右下角的選單，選「用 Safari 開啟」或「用預設瀏覽器開啟」）</li>
      <li>按畫面下方的分享鈕 ${ICON_SHARE}</li>
      <li>往下滑，按「加入主畫面」${ICON_ADD}</li>
      <li>右上角按「加入」</li>
    </ol>
    <h3>Android（用 Chrome）</h3>
    <ol class="steps">
      <li>用 <b>Chrome</b> 打開網址</li>
      <li>按右上角的 ${ICON_MORE}</li>
      <li>按「安裝應用程式」或「加到主畫面」</li>
      <li>按「安裝」或「新增」</li>
    </ol>
    <p class="note">完成後，主畫面會出現深色底、寫著「539」的圖示。</p></div>

  <div class="panel"><h2>3. 畫面怎麼看</h2>
    <ol class="steps">
      <li>最上面是「資料更新到哪一天」和最新一期的 5 個號碼</li>
      <li>最下面有 5 個鍵：<b>尾數、號碼、歷史、回測、說明</b></li>
      <li>每個鍵按下去，上方還有小按鈕可以切換頁面</li>
      <li>有些頁面可以選「統計範圍」，從近 10 期到近 200、300 期或全部</li>
    </ol>
    ${shot("home.png","尾數分布頁的畫面")}</div>

  <div class="panel"><h2>4. 各頁在看什麼</h2>
    <h3>尾數 › 分布</h3>
    <p class="note">0–9 每個尾數開出幾次，黑線是理論上該有的次數。下面的方格表列出近 10–30 期最少出的尾數。</p>
    <h3>尾數 › 遺漏、走勢、交叉比對</h3>
    <p class="note">遺漏：每個尾數幾期沒開了。走勢：近 60 期的熱冷圖。交叉比對：近 30 期和近 100 期都偏少的尾數，標為「雙冷」。</p>
    ${shot("cross.png","交叉比對頁的畫面")}
    <h3>號碼 › 單號冷熱、單號遺漏、連莊、組合特徵</h3>
    <p class="note">單號冷熱用金色號碼球顯示，每顆球下面紅字是開出幾次、藍字是已經幾期沒開，框起來的是最新一期開出的號碼。另外還有每個號碼已經幾期沒開的排行、每期跟上期重複幾個、和值與奇偶大小比例。「單號遺漏」最上面會比對號碼和尾數的遺漏，兩個都很久沒開的號碼標為「雙遺漏」。</p>
    ${shot("num.png","單號冷熱頁的畫面")}
    <h3>歷史</h3>
    <p class="note">每一期的期別、日期、星期和 5 個號碼，可以選看最近 10、20、30、40、100、200 期或全部。</p>
    ${shot("hist.png","開獎歷史頁的畫面")}
    <h3>回測 › 選號回測、期望值、6中3訊號</h3>
    <p class="note">用過去的資料試 8 種選號方法（包括追熱、追冷、追遺漏），看有沒有比亂選厲害；以及每買一注平均能拿回多少錢。「6中3訊號」照網路影片的 KD 方法算出 6 個號碼（兩組三球；找規律可切換用近 30、60、150 期，各列出中 1、2、3 個的次數，另列前 10 名候選組合），並用最近 30 期、150 期回測它有沒有用（另有依波峰預測的第二版）。</p>
    ${shot("ev.png","期望值頁的畫面")}
    <div class="btns">${goBtn("tail","dist","去看尾數")}${goBtn("num","num","去看號碼")}${goBtn("hist","hist","去看歷史")}${goBtn("test","test","去看回測")}</div></div>

  <div class="panel"><h2>5. 資料更新</h2>
    <ol class="steps">
      <li>每週一到週六晚上 9–10 點自動更新，不用做任何事</li>
      <li>想馬上看最新資料：在畫面最上面<b>往下拉再放開</b></li>
      <li>頂端出現紅色提醒，代表好幾天沒更新，告訴管理者就好</li>
      <li>沒網路時也打得開，頂端會標「離線資料」，顯示上次的資料</li>
    </ol></div>

  <div class="panel"><div class="verdict warn">每一期開獎都是獨立事件，過去的統計無法預測下一期。這個 app 只用來觀察數據，不能提高中獎率。</div></div>`;
}

const FAQ = [
  ["這個 app 可以幫我選號、提高中獎率嗎？", `不行。每一期開獎都是獨立的，上一期開什麼不會影響下一期。「回測」頁用過去 700 多期實際試過 8 種選號方法，結果都跟亂選差不多。這個 app 是用來看數據、了解機率，不是選號工具。`],
  ["冷門的尾數或號碼，下一期比較容易開嗎？", `不會。就算某個尾數很久沒開，下一期開出的機率還是一樣（尾 0 約 34.5%，其他尾數約 43.6%）。「很久沒出所以快出了」是很常見的錯覺。`],
  ["資料多久更新？今天的號碼什麼時候會出現？", `每週一到週六晚上 9–10 點自動抓號，通常晚上 10 點後就看得到當天號碼。在畫面最上面往下拉再放開，可以馬上重新讀取。`],
  ["頂端出現紅色提醒是什麼意思？", `代表已經有 2 個以上的開獎日沒有新資料，可能是自動抓號出了問題。統計還是可以看，只是少了最近幾期。告訴管理者處理就好。過年停開期間也會出現這個提醒，屬於正常。`],
  ["頂端寫「離線資料」是什麼意思？", `手機現在連不上網路，顯示的是上次存在手機裡的資料。連上網路後往下拉重新整理就會更新。`],
  ["打開後一直顯示「讀取資料中」或「更新中…」？", `資料放在 Google 的伺服器，閒置一陣子後第一次讀取比較慢，大約要等 5 秒。如果超過 30 秒，請確認網路，再往下拉重新整理。`],
  ["畫面跟別人的不一樣、新功能沒出現？", `app 更新後，手機可能還在用舊版。把 app 完全關掉（從背景滑掉）再打開一次，就會換成新版。`],
  ["iPhone 找不到「加入主畫面」？", `要用 Safari 打開才有這個選項。從 LINE 點開的話，先按 LINE 畫面右上或右下角的選單，選「用 Safari 開啟」或「用預設瀏覽器開啟」，再按分享鈕。`],
  ["「冷熱」和「遺漏」有什麼不同？", `冷熱看的是一段期間「總共開幾次」，遺漏看的是從最新一期往回數「連續幾期沒開」。例如某個號碼近 100 期開了 10 次，但如果都集中在前面，最近可能已經 40 幾期沒開。「號碼 › 單號遺漏」看每個號碼，「尾數 › 遺漏」看每個尾數。`],
  ["「雙遺漏」是什麼？要特別買嗎？", `號碼本身超過 20 期沒開，而且它的尾數也超過平均 3 倍沒開（尾 0 是 6 期以上，其他尾數 4 期以上），就標為「雙遺漏」。這只是觀察，不代表比較會開。「回測」裡的「追遺漏號」策略就是每期買最久沒開的 5 個號碼，用過去 700 多期實際跑的結果，跟亂選差不多。`],
  ["「6中3訊號」準嗎？可以照著買嗎？", `不準。這一頁是把網路影片「用 KD 線找支撐位反彈」的方法照做一遍，再用最近 30 期、150 期實際回測（包括第一版和「波峰預測」第二版）：兩版開出 6 中 3 的機率都沒有比隨機挑 6 個號碼高。KD 是股票的技術指標，樂透每期獨立抽球，沒有趨勢可言。隨便挑 6 個號碼，平均每 52 期本來就會遇到一次 6 中 3。`],
  ["為什麼尾 0 的次數特別少？", `尾 0 只有 10、20、30 三個號碼，其他尾數都有 4 個（例如尾 1 是 1、11、21、31），所以尾 0 本來就比較少出現。app 裡的排名和「雙冷」都已經校正過這一點。`],
  ["「卡方值」是什麼？", `用來判斷「實際次數跟理論值的差距，是不是運氣就能解釋」。低於門檻（尾數 16.9、單號 53.4）代表差距在正常範圍內，純屬運氣。`],
  ["「z 分數」和「雙冷」是什麼？", `z 分數 = 跟理論值差多少 ÷ 正常會晃動的幅度。z 在 ±2 以內算正常晃動。「雙冷」是近 30 期和近 100 期都排在最冷 3 名的尾數。因為近 30 期本來就包含在近 100 期裡，雙冷不代表下一期比較會開。`],
  ["「期望值 27.92 元」是什麼意思？", `每注 50 元，長期平均只能拿回大約 27.92 元（稅前），也就是每買 100 元平均虧掉約 44 元。這是彩券的設計，不管怎麼選號都一樣。`],
  ["要登入嗎？會收集我的資料嗎？", `不用登入，也不會收集任何個人資料。手機裡只會存開獎號碼和你上次看的頁面，方便下次打開。`],
  ["發現號碼錯了怎麼辦？", `截圖告訴管理者。管理者可以刪除錯誤的期數，或匯入台灣彩券官方的資料來更正。這個 app 不提供手動輸入號碼，避免打錯。`],
  ["怎麼分享給別人？", `把網址 ${APP_URL} 傳給對方，或讓對方掃「使用教學」裡的 QR code。`],
];
function viewFaq(){
  return `<div class="panel"><h2>常見問題</h2><p class="note">點問題就會展開答案。</p>
    <div class="faq">${FAQ.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>
    <div class="btns">${goBtn("help","howto","看使用教學")}</div></div>`;
}

function msgHTML(){ return S.msg ? `<p class="msg ${S.msgErr?"err":""}">${S.msg}</p>` : ""; }

function viewLogin(){
  return `<div class="panel"><h2>管理者登入</h2>
    <p class="note">輸入管理密碼後，會多出「資料」分頁，可以匯入台彩官方 CSV、刪除錯誤的期數。一般使用者不需要登入。</p>
    <form id="loginForm" class="btns" autocomplete="off">
      <input type="password" id="pwIn" placeholder="管理密碼" autocomplete="current-password" style="flex:1;min-width:0">
      <button class="btn" ${S.busy?"disabled":""}>${S.busy?"確認中…":"登入"}</button>
    </form>${msgHTML()}</div>`;
}

/* ---------- 6 中 3 訊號 ---------- */
// 上半：遺漏期數（幾期沒命中）；下半：K（藍）、D（紅），紅圈 = 命中
function sigChart(series){
  const W=320, n=series.length, x=i=>4+i*(W-8)/Math.max(n-1,1);
  const gmax=Math.max(...series.map(s=>s.gap),1);
  const gy=v=>62-v/gmax*52, ky=v=>140-v*0.6;
  const line=(f,col)=>`<polyline fill="none" stroke="${col}" stroke-width="1.4" points="${series.map((s,i)=>`${x(i).toFixed(1)},${f(s).toFixed(1)}`).join(" ")}"/>`;
  const hits=series.map((s,i)=>s.hit?`<circle cx="${x(i).toFixed(1)}" cy="${ky(s.K).toFixed(1)}" r="3.2" fill="none" stroke="var(--hot)" stroke-width="1.3"/>`:"").join("");
  const last=series[n-1];
  return `<svg class="sigc" viewBox="0 0 ${W} 150" role="img" aria-label="遺漏與 KD 走勢圖">
    <text x="4" y="9" class="lab">遺漏期數（最高 ${gmax}）</text>
    <line x1="4" x2="${W-4}" y1="62" y2="62" class="ax"/>
    ${line(s=>gy(s.gap),"var(--cold)")}
    <text x="4" y="78" class="lab">KD（K 藍、D 紅，虛線 = 20，紅圈 = 命中）</text>
    <line x1="4" x2="${W-4}" y1="128" y2="128" class="ax dash"/>
    <line x1="4" x2="${W-4}" y1="140" y2="140" class="ax"/>
    ${line(s=>ky(s.D),"var(--hot)")}${line(s=>ky(s.K),"var(--cold)")}${hits}
    <circle cx="${x(n-1).toFixed(1)}" cy="${ky(last.K).toFixed(1)}" r="3.5" fill="var(--cold)"/>
  </svg>`;
}
function sinceLastHit(L, nums, need){
  for(let i=L.length-1;i>=0;i--) if(nums.filter(v=>L[i].n.includes(v)).length>=need) return {ago:L.length-1-i, d:L[i].d};
  return null;
}
function viewSig(){
  const L=S.draws, W=S.sigW; if(L.length<SIG_W+30) return emptyHTML();
  if(!S.sig) S.sig={};
  if(!S.sig[W]) S.sig[W]=signalAt(L, L.length, W)||"none";
  const s=S.sig[W], last=L[L.length-1];
  let html=`<div class="panel"><h2>6 中 3 訊號</h2>
    <p class="note">照 YouTube「樂透統計學」影片的概念做的：在 9,139 組三球組合裡，找近 ${W} 期「3 中 2」命中間隔最規律、而且目前在低點的兩組，配成 6 個號碼。這一頁是用來<b>驗證</b>這個方法，請看最下面的回測結果。</p>
    <div class="range">找規律用</div>
    <div class="seg">${SIG_WS.map(x=>`<button data-sigw="${x}" aria-pressed="${x===W}">近 ${x} 期</button>`).join("")}</div>
    ${W<60?`<p class="note">近 30 期很短：三個號碼平均約 26 期才「3 中 2」一次，30 期內中 4 次以上本身就是少見的巧合，挑出來的組合很容易只是運氣。</p>`:""}`;
  if(s==="none") return html+`<div class="verdict">用近 ${W} 期、到 ${dateLabel(last.d)} 的資料，目前沒有符合條件的組合。</div></div>`+sigMethodHTML(W)+sigTestHTML();
  const since6=sinceLastHit(L, s.six, 3);
  html+=`<p class="note">用到 ${dateLabel(last.d)} 為止的資料算出：</p>
    <div class="latest sixb">${s.six.map(ballHTML).join("")}</div>
    <p class="note">這 6 個號碼上一次「開出其中 3 個以上」：${since6?`${since6.ago} 期前（${dateLabel(since6.d)}）`:`近 ${L.length} 期都沒有`}。隨機挑 6 個號碼，平均每 ${Math.round(1/P_6IN3)} 期就會遇到一次。</p>
    ${sigChart(hitSeries(L, s.six, 3, Math.max(W,60)))}</div>`;
  const grp=(name,g)=>{
    const since=sinceLastHit(L, g.t, 2);
    return `<div class="panel"><h2 class="gh">${name}${sballs(g.t)}</h2>
      <div class="kpis"><div><span>近 ${W} 期 3 中 2</span><b>${g.m} 次</b></div><div><span>平均間隔</span><b>${g.mean.toFixed(1)} 期</b></div><div><span>已幾期沒中</span><b>${g.g} 期</b></div></div>
      <p class="note">間隔穩定度 ${g.cv.toFixed(2)}（越小越規律）、K 值 ${g.K.toFixed(1)}。上次 3 中 2：${since?dateLabel(since.d):"—"}。</p>
      ${triDistHTML(L, g.t)}
      ${sigChart(hitSeries(L, g.t, 2, Math.max(W,60)))}</div>`;
  };
  html+=grp("組 A", s.a)+grp("組 B", s.b)+topHTML(s, W);
  return html+sigMethodHTML(W)+sigTestHTML();
}
// 三個號碼近 30／60／150 期各中 1／2／3 個幾次，跟隨機的平均次數比
function triDistHTML(L, t){
  const rows=SIG_WS.map(w=>{ const n=Math.min(w, L.length), c=hitDist(L, t, n);
    return `<tr><td>近 ${n} 期</td>${[1,2,3].map(k=>`<td><span class="n">${c[k]} 次</span><small class="avg">平均 ${(P_TRI[k]*n).toFixed(k===3?2:1)}</small></td>`).join("")}</tr>`; }).join("");
  return `<div class="scroll"><table class="tri"><thead><tr><th>範圍</th><th>中 1 個</th><th>中 2 個</th><th>中 3 個</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">「平均」是隨機挑三個號碼，同樣期數平均會中幾次。</p>`;
}
// 前 10 名候選組合（第一版的排名）
function topHTML(s, W){
  const tag=x=>x.id===s.a.id?'<span class="tag dtag">組 A</span>':x.id===s.b.id?'<span class="tag dtag">組 B</span>':"";
  const rows=s.top10.map((x,i)=>`<tr><td><span class="n">${i+1}</span></td><td><div class="dcell">${sballs(x.t)}${tag(x)}</div></td>
    <td><span class="n">${x.cv.toFixed(3)}</span><small class="avg">中 ${x.m} 次</small></td><td><span class="n">${x.mean.toFixed(1)}</span></td><td><span class="n">${x.g}</span></td></tr>`).join("");
  return `<div class="panel"><h2>前 10 名候選組合</h2>
    <p class="note">用近 ${W} 期找規律，目前有 ${s.candidates} 組三球符合「間隔穩定、目前在低點」的條件，這裡列出規律度最小的前 10 名。「平均間隔」和「已沒中」的單位都是期。組 A、組 B 是其中號碼不重複、規律度合計最小的兩組。</p>
    <div class="scroll"><table class="tri top10"><thead><tr><th>#</th><th>三個號碼</th><th>規律度</th><th>平均間隔</th><th>已沒中</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="verdict">名次只代表「過去 ${W} 期的間隔有多整齊」，不是機率高低。這 ${s.candidates} 組裡任何一組，下一期中 2 個以上的機率都一樣是 ${(P_3IN2*100).toFixed(1)}%。很多組只中過 4 次，次數少，間隔剛好差不多的機會本來就大。</div></div>`;
}
function sigMethodHTML(W){
  return `<div class="panel"><h2>怎麼算的</h2>
    <ol class="steps">
      <li>39 個號碼取 3 個，共 9,139 組。某一期開出其中 2 個以上，算這組「3 中 2 命中」。</li>
      <li>間距穩定：近 ${W} 期（可切換 ${SIG_WS.join("／")} 期）至少命中 4 次，命中之間隔的期數越平均越好（間隔的標準差 ÷ 平均間隔，越小越規律）。</li>
      <li>目前在低點：K 值低於 20，而且距離上次命中，已經到了平均間隔的 0.8 到 1.2 倍（影片說的「支撐位」）。</li>
      <li>從符合條件、最規律的前 ${SIG_TOP} 組裡，挑兩組號碼不重複的，合成 6 個號碼。上面顯示的 6 個號碼就是這個「第一版」。</li>
    </ol>
    <h3>第二版（波峰預測，只用在回測）</h3>
    <ol class="steps">
      <li>每次 3 中 2 命中當作一個「波峰」，兩個波峰之間是一個週期。</li>
      <li>週期振幅：（最長週期 − 最短週期）÷ 平均週期，要在 0.5 以內，代表波形整齊。</li>
      <li>週期預測：越近的週期權重越高，算出下一個週期預計幾期。</li>
      <li>挑「下一期最接近預測波峰」的組合，前 ${SIG_TOP} 名裡配成兩組不重複的 6 個號碼。</li>
    </ol>
    <p class="note">影片沒有公開確切算法，這是照畫面上的說明做出的版本，算出的號碼不一定跟影片一樣。K 值的算法：命中那期 RSV = 100、沒中 = 0，K = 2/3 × 前一期 K + 1/3 × RSV，D 再對 K 做一次同樣的平滑。</p>
    <div class="verdict warn">KD 是股票的技術指標，股價有買賣雙方、前後有關係；樂透每期獨立抽球，沒有趨勢或支撐位。圖上的「規律」是從 9,139 組裡挑出看起來最整齊的，事後挑出來的規律不會延續到下一期。</div></div>`;
}
function sigTestHTML(){
  const all=S.sigTest;
  let html=`<div class="panel"><h2>回測：這個方法有沒有用？</h2>
    <p class="note">每一期都只用「那一期之前」的資料，分別用近 ${SIG_WS.join("、")} 期找規律，照第一版、第二版各算出 6 個號碼，再對當期開獎；同時每期也隨機挑 6 個號碼比較。可以切換看最近 30 期或最近 150 期的結果。包牌 = 6 個號碼買滿 6 注，每期 300 元。</p>`;
  if(!all) return html+`<div class="btns"><button class="btn" data-act="sigtest">開始回測</button></div><p class="note">要算 ${SIG_WS.length*2} 種版本，手機大約要十幾秒到半分鐘。</p></div>`;
  if(typeof all==="number") return html+`<div class="btns"><button class="btn" disabled>計算中… ${Math.round(all*100)}%</button></div></div>`;
  const w=S.btWin, t=all[w];
  const versions=[];
  for(const W of SIG_WS) versions.push([`第一版（${W} 期）`, t["sig"+W]]);
  for(const W of SIG_WS) versions.push([`第二版（${W} 期）`, t["v2_"+W]]);
  const row=(name,o)=>`<tr><td>${name}</td><td><span class="n">${o.six} 次</span><small class="avg">${o.n?(o.six/o.n*100).toFixed(1):"—"}%</small></td><td><span class="n">${o.n?(o.h/o.n).toFixed(3):"—"}</span></td><td><span class="n">${o.n?(o.pay/(o.n*300)*100).toFixed(0):"—"}%</span></td></tr>`;
  const none=Object.entries(t.none).filter(([,v])=>v).map(([k,v])=>`${k.startsWith("sig")?"第一版":"第二版"}（${k.replace(/\D/g,"")} 期）${v} 期`);
  html+=`<div class="seg">${SIG_BTS.map(x=>`<button data-btw="${x}" aria-pressed="${x===w}">最近 ${x} 期</button>`).join("")}</div>
    <div class="scroll"><table><thead><tr><th>選法（找規律期數）</th><th>6 中 3</th><th>平均中幾個</th><th>包牌回收率</th></tr></thead><tbody>
    ${versions.map(([nm,o])=>row(nm,o)).join("")}${row("隨機 6 個",t.rand)}
    <tr class="theo"><td>理論值</td><td><span class="n">${(P_6IN3*t.rand.n).toFixed(1)} 次</span><small class="avg">${(P_6IN3*100).toFixed(1)}%</small></td><td><span class="n">${(6*5/39).toFixed(3)}</span></td><td><span class="n">56%</span></td></tr></tbody></table></div>
    <p class="note">回測 ${dateLabel(t.from)} 到 ${dateLabel(t.to)}，共 ${t.rand.n} 期${none.length?`（沒有訊號：${none.join("、")}）`:""}。${w<100?"只有 30 期，6 中 3 理論上平均才 0.6 次，有沒有中幾乎全看運氣。":"150 期樣本也不大，6 中 3 差一兩次比例就會差很多。"}</p>
    <h3>每組三球中幾個</h3>
    <p class="note">把每期挑出的兩組三球分開看，各中了 0、1、2、3 個的次數（下方小字是比例）。隨機三球 = 每期隨機 6 個號碼拆成兩組。</p>
    <div class="scroll"><table class="tri"><thead><tr><th>三球</th><th>中 0</th><th>中 1</th><th>中 2</th><th>中 3</th></tr></thead><tbody>
      ${versions.concat([["隨機",t.rand]]).map(([nm,o])=>{ const tot=o.d3.reduce((x,y)=>x+y,0)||1; return `<tr><td>${nm}</td>${o.d3.map(v=>`<td><span class="n">${v}</span><small class="avg">${(v/tot*100).toFixed(1)}%</small></td>`).join("")}</tr>`; }).join("")}
      <tr class="theo"><td>理論值</td>${P_TRI.map(p=>`<td><span class="n">${(p*t.rand.n*2).toFixed(p<0.01?1:0)}</span><small class="avg">${(p*100).toFixed(p<0.01?2:1)}%</small></td>`).join("")}</tr></tbody></table></div>
    <div class="verdict">如果這個方法真的有用，「6 中 3」和「平均中幾個」應該要明顯高於隨機和理論值；如果都在附近上下跳動，就代表跟亂選一樣。用幾期找規律都一樣：規則只用到過去的開獎結果，改變不了下一期的機率。回收率波動很大，只要剛好中一次貳獎（2 萬元）就會拉高很多，那是運氣不是方法。</div>
    <div class="btns"><button class="btn ghost" data-act="sigtest">重新回測</button></div></div>`;
  return html;
}
function runSigTest(){
  const it=backtest6Steps(S.draws);
  S.sigTest=0; render();
  const step=()=>{
    const t0=Date.now(); let r;
    do{ r=it.next(); }while(!r.done && Date.now()-t0<40);
    if(r.done){ S.sigTest=r.value; render(); return; }
    S.sigTest=r.value;
    const b=document.querySelector('[data-act="sigtest"], .btn[disabled]');
    if(b && S.tab==="sig") b.textContent=`計算中… ${Math.round(r.value*100)}%`; else if(S.tab==="sig") render();
    setTimeout(step,0);
  };
  setTimeout(step,30);
}

function viewData(){
  if(!S.admin) return viewLogin();
  const L=S.draws, last=L[L.length-1];
  const src={online:"已連線，是最新資料。", checking:"正在向雲端讀取最新資料…", cache:"目前連不上網路，顯示的是上次存在這支手機裡的資料。", error:"讀不到資料。", loading:"讀取中…"}[S.source];
  const miss=last?missedDraws(last.d):0;
  let html=`<div class="panel"><h2>資料更新到哪天</h2>
    <p class="note">${src}${last?`<br>最新一期：${dateLabel(last.d)}，共 ${L.length} 期（從 ${L[0].d} 開始）。`:""}${S.fetchedAt?`<br>上次從雲端讀取：${fmtTime(S.fetchedAt)}。`:""}</p>
    ${last?`<div class="verdict ${miss>=2?"warn":""}">${miss>=2?`已經有 ${miss} 個開獎日沒有新資料，自動抓號可能壞了。請到 Apps Script 的「執行項目」看記錄，或截圖給 Claude。`:miss===1?"今天（或上一個開獎日）的號碼還沒寫入。每晚 9–10 點會自動抓，晚點再看。":"資料是最新的。"}</div>`:""}
    <p class="note">每週一到週六晚上 9–10 點自動抓兩個開獎網站，號碼一致才寫入；不一致時以台彩官方為準。不提供手動輸入。</p></div>`;
  const c=S.csv;
  html+=`<div class="panel"><h2>匯入官方 CSV</h2>
    <p class="note">到台灣彩券官網下載「今彩539_年份.csv」再選這個檔案。同一天的資料會以官方版本覆蓋，沒有的會新增。</p>
    <div class="btns"><label class="btn ghost">選擇檔案<input type="file" id="fileIn" accept=".csv,text/csv" hidden></label></div>
    ${c?`<p class="note">${c.name}：讀到 ${c.count} 期今彩539${c.count?`（${c.from} 到 ${c.to}）`:""}。</p>
      ${c.count?`<div class="btns"><button class="btn" data-act="import" ${S.busy?"disabled":""}>${S.busy?"匯入中…":`匯入 ${c.count} 期`}</button></div>`:""}`:""}
    ${msgHTML()}</div>`;
  const recentList=L.slice(-20).reverse();
  html+=`<div class="panel"><h2>最近資料</h2>
    <p class="note">發現某一期號碼錯了，可以刪除；如果兩個開獎網站資料正確，當晚自動抓號會再補回來。</p>
    <div class="list">${recentList.map(x=>`<div class="it"><span>${x.d}</span>${sballs(x.n)}<button class="x" data-del="${x.d}" ${S.busy?"disabled":""}>刪除</button></div>`).join("")||'<p class="note">還沒有資料。</p>'}</div></div>`;
  html+=`<div class="panel"><div class="btns" style="margin-top:0"><button class="btn ghost" data-act="logout">登出管理者</button></div>
    <p class="note">登出後「資料」分頁會隱藏，要再輸入密碼才看得到。</p></div>`;
  return html;
}

// 讀 CSV 檔：先用 UTF-8，亂碼太多再試 Big5（沿用原版做法）；只先數期數給管理者確認
function onFile(e){
  const f=e.target.files[0]; if(!f) return;
  f.arrayBuffer().then(buf=>{
    let t=new TextDecoder("utf-8").decode(buf);
    if((t.match(/�/g)||[]).length>5){ try{ t=new TextDecoder("big5").decode(buf); }catch(_){} }
    const dates=[];
    t.split(/\r?\n/).forEach(l=>{ const c=l.split(","); if(c[0]&&c[0].replace(/^﻿/,"").trim()==="今彩539"){ const m=(c[2]||"").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); if(m) dates.push(`${m[1]}-${pad2(m[2])}-${pad2(m[3])}`); } });
    dates.sort();
    S.csv={name:f.name, text:t, count:dates.length, from:dates[0], to:dates[dates.length-1]};
    S.msg = dates.length ? "" : "這個檔案裡沒有今彩539的資料，請確認是台彩官網下載的「今彩539_年份.csv」。";
    S.msgErr = !dates.length;
    render();
  });
}

async function runAdmin(body, okMsg){
  S.busy=true; S.msg=""; render();
  try{
    const r=await adminPost({password:S.admin, ...body});
    if(!r.ok && r.msg==="密碼錯誤"){ logout(); S.msg="密碼已經改過，請重新登入。"; S.msgErr=true; return false; }
    S.msg=r.ok?(okMsg||r.msg):r.msg; S.msgErr=!r.ok;
    if(r.ok) await fetchLatest();
    return r.ok;
  }catch(err){
    S.msg="連不上伺服器："+err.message; S.msgErr=true; return false;
  }finally{ S.busy=false; render(); }
}
function logout(){
  S.admin=""; S.csv=null;
  try{ localStorage.removeItem(ADMIN_KEY); }catch(e){}
}

function render(){
  const L=S.draws;
  if(!L.length) $("#meta").textContent = S.source==="loading" ? "讀取資料中…" : "讀不到開獎資料";
  else $("#meta").innerHTML=`共 ${L.length} 期，資料更新到 ${dateLabel(L[L.length-1].d)}`+
    (S.source==="cache"?`<span class="src off">離線資料（${fmtTime(S.fetchedAt)} 讀取）</span>`:S.source==="checking"?`<span class="src">更新中…</span>`:"");
  const miss=L.length?missedDraws(L[L.length-1].d):0;
  $("#alert").hidden=miss<2;
  $("#alert").textContent=miss>=2?`已經 ${miss} 個開獎日沒有新資料，數字可能不是最新的。`:"";
  $("#latest").innerHTML=L.length?L[L.length-1].n.map(ballHTML).join(""):"";
  // 「資料」鍵只有管理者看得到；一般人從頁尾「管理者登入」進入
  $('#bnav [data-g="data"]').hidden=!S.admin;
  $("#loginLink").hidden=!!S.admin || S.group==="data";
  const subs=GROUPS[S.group];
  $("#tabs").hidden=subs.length<2;
  $("#tabs").innerHTML=subs.map(([t,name])=>`<button role="tab" data-t="${t}" aria-selected="${t===S.tab}">${name}</button>`).join("");
  document.querySelectorAll("#bnav button").forEach(b=>b.setAttribute("aria-selected", b.dataset.g===S.group));
  const v={dist:viewDist,gap:viewGap,trend:viewTrend,cross:viewCross,num:viewNum,ngap:viewNgap,hist:viewHist,rep:viewRep,combo:viewCombo,test:viewTest,ev:viewEV,sig:viewSig,howto:viewHowto,faq:viewFaq,data:viewData}[S.tab]();
  $("#view").innerHTML=v;
  const rs=$("#rangeSel"); if(rs) rs.onchange=e=>{ S.range=e.target.value==="all"?"all":+e.target.value; render(); };
  const hs=$("#histSel"); if(hs) hs.onchange=e=>{ S.histN=e.target.value==="all"?"all":+e.target.value; render(); };
  const ep=$("#evPer"); if(ep) ep.onchange=e=>{ S.evPer=+e.target.value; render(); };
  const fi=$("#fileIn"); if(fi) fi.onchange=onFile;
  const lf=$("#loginForm"); if(lf) lf.onsubmit=onLogin;
  const tr=document.querySelector(".heat")?.parentElement; if(tr) tr.scrollLeft=tr.scrollWidth;
}

/* ---------- 事件 ---------- */
// 記住上次看的分頁（每一組各記一個），下次打開回到同一頁
function saveNav(){ try{ localStorage.setItem(NAV_KEY, JSON.stringify({group:S.group, last:S.last})); }catch(e){} }
function loadNav(){
  try{
    const r=JSON.parse(localStorage.getItem(NAV_KEY));
    if(r && GROUPS[r.group]){ S.group=r.group; S.last=r.last||{}; }
  }catch(e){}
  S.tab=GROUPS[S.group].some(([t])=>t===S.last[S.group]) ? S.last[S.group] : GROUPS[S.group][0][0];
}
function go(group, tab){
  S.group=group;
  S.tab=tab || (GROUPS[group].some(([t])=>t===S.last[group]) ? S.last[group] : GROUPS[group][0][0]);
  S.last[group]=S.tab; saveNav(); render(); window.scrollTo({top:0});
}

async function onLogin(e){
  e.preventDefault();
  const pw=$("#pwIn").value; if(!pw) return;
  S.busy=true; S.msg=""; render();
  try{
    const r=await adminPost({password:pw, action:"check"});
    if(r.ok){
      S.admin=pw; S.msg="";
      try{ localStorage.setItem(ADMIN_KEY, pw); }catch(_){}
    } else { S.msg=r.msg; S.msgErr=true; }
  }catch(err){ S.msg="連不上伺服器："+err.message; S.msgErr=true; }
  S.busy=false; render();
}

document.addEventListener("click", async e=>{
  const g=e.target.closest("#bnav button"); if(g){ S.msg=""; go(g.dataset.g); return; }
  const tab=e.target.closest("#tabs button"); if(tab){ go(S.group, tab.dataset.t); return; }
  const sw=e.target.closest("[data-sigw]"); if(sw){ S.sigW=+sw.dataset.sigw; render(); return; }
  const bw=e.target.closest("[data-btw]"); if(bw){ S.btWin=+bw.dataset.btw; render(); return; }
  const gb=e.target.closest("[data-go]"); if(gb){ const [g,t]=gb.dataset.go.split(":"); go(g,t); return; }
  const del=e.target.closest("[data-del]");
  if(del){ const d=del.dataset.del; if(confirm(`確定刪除 ${d} 這一期？`)) await runAdmin({action:"delete", date:d}); return; }
  const a=e.target.closest("[data-act]"); if(!a) return;
  const act=a.dataset.act;
  if(act==="login"){ S.msg=""; go("data"); }
  else if(act==="logout"){ logout(); S.msg=""; go("tail"); }
  else if(act==="import"){ if(await runAdmin({action:"import", csv:S.csv.text})) S.csv=null; render(); }
  else if(act==="sigtest"){ if(typeof S.sigTest!=="number") runSigTest(); }
  else if(act==="rand"){ S.randomPick=sample5(Math.random); render(); }
  else if(act==="test"){ a.disabled=true; a.textContent="計算中…"; setTimeout(()=>{ S.test=backtest(S.draws)||"few"; render(); },30); }
  else if(act==="ev"){ a.disabled=true; a.textContent="模擬中…"; setTimeout(()=>{ S.ev=simulateEV(S.draws); render(); },30); }
});

/* ---------- 下拉重新整理 ---------- */
// 在最上面往下拉超過一段距離再放開，就重新向雲端讀資料
const PULL = 64;
let startY = null, pullH = 0;
function setPull(h, text){ pullH=h; const p=$("#ptr"); p.style.height=h+"px"; p.textContent=text||""; }
document.addEventListener("touchstart", e=>{
  startY = (window.scrollY<=0 && !S.refreshing && e.touches.length===1) ? e.touches[0].clientY : null;
}, {passive:true});
document.addEventListener("touchmove", e=>{
  if(startY===null) return;
  const h=Math.min(Math.max(e.touches[0].clientY-startY,0)*0.5, PULL+16);
  setPull(h, h>=PULL?"放開重新整理":"下拉重新整理");
}, {passive:true});
document.addEventListener("touchend", async ()=>{
  if(startY===null) return;
  startY=null;
  if(pullH<PULL){ setPull(0); return; }
  S.refreshing=true; setPull(44, "更新中…");
  await fetchLatest();
  S.refreshing=false;
  setPull(44, S.source==="online" ? "已更新" : "連不上網路，顯示上次的資料");
  setTimeout(()=>setPull(0), 900);
});

loadNav();
// 網址後面加 #分頁名稱（例如 #cross、#faq）可以直接打開那一頁
const hashTab=location.hash.slice(1);
for(const g in GROUPS) if(g!=="data" && GROUPS[g].some(([t])=>t===hashTab)){ S.group=g; S.tab=hashTab; }
if(S.group==="data" && !S.admin){ S.group="tail"; S.tab=GROUPS.tail[0][0]; }
render();
loadDraws();

// 離線快取：讓 app 沒網路也打得開
if("serviceWorker" in navigator){
  // 已經有舊版小幫手時，新版接手後自動重新載入一次，畫面馬上換成新版
  let hadOld=!!navigator.serviceWorker.controller, reloaded=false;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{
    if(hadOld && !reloaded){ reloaded=true; location.reload(); }
  });
  navigator.serviceWorker.register("sw.js", {updateViaCache: "none"}).then(r=>r.update()).catch(()=>{});
}
})();
