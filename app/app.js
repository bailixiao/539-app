/* 539 尾數觀察站：載入資料、切換分頁、畫畫面
 * 畫面從 reference/539-tail.html 搬過來；統計計算在 stats.js。
 */
(function(){
const API = "https://script.google.com/macros/s/AKfycby_Za-SJp2fteT4vLspntfLjBp_GrRQpeihMLbOnnDDCgN05NzkqDXCb6wDAtK50LNH/exec";
const LS_KEY = "t539_draws_v2";

const S = {
  tab: "dist", range: 100, draws: [], source: "loading", fetchedAt: 0,
  randomPick: null, test: null, ev: null, evPer: 1
};

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
  if(cached){ S.draws = cached.draws; S.fetchedAt = cached.at; S.source = "cache"; render(); }
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
  S.test = null; S.ev = null; render();
}

/* ---------- 畫面 ---------- */
const $ = s => document.querySelector(s);
const pad2 = v => String(v).padStart(2,"0");
function ballHTML(v){ const s=pad2(v); return `<span class="ball">${s[0]}<b>${s[1]}</b></span>`; }
function recent(){ return S.range==="all" ? S.draws : S.draws.slice(-S.range); }
function fmtTime(t){ const d=new Date(t); return `${d.getMonth()+1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function rangeHTML(){
  const opts=[[10,"近 10 期"],[15,"近 15 期"],[20,"近 20 期"],[25,"近 25 期"],[30,"近 30 期"],[100,"近 100 期"],[300,"近 300 期"],["all","全部"]];
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
    <p class="note">卡方檢定用來判斷「實際次數和理論值的差距，是不是運氣就能解釋」。低於門檻代表運氣就能解釋。</p></div>${coldHTML()}${crossHTML()}`;
}

function coldHTML(){
  const rows=coldTails(S.draws);
  if(!rows.length) return "";
  const grp=g=>`<span style="white-space:nowrap"><span class="n">尾 ${g.tails.join("、")}</span><small>（${g.o} 次）</small></span>`;
  const tr=rows.map(r=>`<tr><td style="white-space:nowrap">近 ${r.n} 期</td><td style="text-align:left">${r.groups.map(grp).join(" › ")}</td></tr>`).join("");
  const all=[...Array(10).keys()].filter(d=>rows.length===SHORT_RANGES.length&&rows.every(r=>r.groups.some(g=>g.tails.includes(d))));
  return `<div class="panel"><h2>近 10–30 期最少出的尾數</h2>
    <p class="note">每個區間各自排名，由最少往上列出最冷的 3 個尾數和實際出現次數；一樣冷的尾數並列在同一格，所以有時會超過 3 個。排名用 z 分數，已校正尾 0 只有 3 個號碼，所以尾 0 不會因為號碼少就一直墊底。</p>
    <div class="scroll"><table><thead><tr><th>區間</th><th style="text-align:left">最少的尾數（由少到多）</th></tr></thead><tbody>${tr}</tbody></table></div>
    <div class="verdict">${all.length?`${all.map(d=>`尾 ${d}`).join("、")} 在五個區間都排進最少 3 名。`:"沒有尾數在五個區間都排進最少 3 名。"}這幾個區間互相包含（近 10 期也在近 30 期裡），所以常常會看到同一個尾數重複出現，這不代表它下一期比較容易開出。</div></div>`;
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
    <p class="note">追熱尾／追冷尾：前 20 期最熱／最冷的 5 個尾數各挑 1 號。雙冷尾：近 30 × 近 100 交叉比對最冷的 5 個尾數。追熱號／追冷號：前 30 期出現最多／最少的 5 個號碼。連莊：直接買上一期的 5 個號碼。隨機：亂數。</p>`;
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
  const cells=arr.map(x=>{
    const a=Math.min(Math.abs(x.z)/2.5,1)*70, col=x.z>=0?"var(--hot)":"var(--cold)";
    const strong=Math.abs(x.z)>=1.5;
    return `<div class="nc" style="background:color-mix(in srgb,${col} ${a.toFixed(0)}%,var(--soft));${strong?"color:#fff":""}"><b>${pad2(x.v)}</b><span>${x.o}</span></div>`;
  }).join("");
  const s=arr.slice().sort((a,b)=>b.z-a.z);
  const li=a=>a.map(x=>`<div class="it"><span class="ns">${pad2(x.v)}</span><span>${x.o} 次</span><span class="n">z ${x.z>=0?"+":"−"}${Math.abs(x.z).toFixed(1)}</span></div>`).join("");
  const ok=chi<53.4;
  return `<div class="panel"><h2>單號冷熱</h2>
    <p class="note">每格是一個號碼，下方數字是出現次數。理論上每個號碼 ${E.toFixed(1)} 次。越紅越熱、越藍越冷，顏色深淺依 z 分數。</p>
    ${rangeHTML()}<div class="ngrid">${cells}</div></div>
    <div class="panel"><div class="two"><div><h2>最熱 5 號</h2><div class="list">${li(s.slice(0,5))}</div></div>
    <div><h2>最冷 5 號</h2><div class="list">${li(s.slice(-5).reverse())}</div></div></div>
    <div class="verdict ${ok?"":"warn"}">39 個號碼的卡方值 ${chi.toFixed(1)}（門檻 53.4）。${ok?"冷熱差距在純隨機的範圍內。":"差距超過一般隨機波動，可以檢查資料，或是資料期數太少。"}單號切得比尾數細，每格的樣本更少，所以看起來會比尾數更「冷熱分明」，但那多半是雜訊。</div></div>`;
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
    <div class="verdict">實際平均每期連莊 ${mean.toFixed(3)} 個，理論值 0.641 個。最新一期 ${last.d} ${rep.length?`連莊了 ${rep.map(pad2).join("、")}`:"沒有連莊號碼"}。「上期開過的號碼這期比較容易再出」如果是真的，實際值會明顯高於理論值；兩者接近，就代表上一期對這一期沒有影響。</div></div>`;
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

function viewData(){
  const L=S.draws;
  const src={online:"已連線，是最新資料。", cache:"目前連不上網路，顯示的是上次存在這支手機裡的資料。", error:"讀不到資料。", loading:"讀取中…"}[S.source];
  let html=`<div class="panel"><h2>資料狀態</h2>
    <p class="note">${src}${L.length?`<br>共 ${L.length} 期，從 ${L[0].d} 到 ${L[L.length-1].d}。`:""}${S.fetchedAt?`<br>上次從雲端更新：${fmtTime(S.fetchedAt)}。`:""}</p></div>`;
  html+=`<div class="panel"><h2>自動更新</h2><p class="note">每週一到週六晚上 9 點多，系統會自動抓兩個開獎網站，號碼一致才寫入；兩邊不一致時，以台灣彩券官方資料為準。不需要手動輸入。</p></div>`;
  const last=L.slice(-10).reverse();
  html+=`<div class="panel"><h2>最近 10 期</h2><div class="list">${last.length?last.map(x=>`<div class="it"><span>${x.d}</span><span class="ns">${x.n.map(pad2).join(" ")}</span></div>`).join(""):'<p class="note">還沒有資料。</p>'}</div></div>`;
  return html;
}

function render(){
  const L=S.draws;
  if(!L.length) $("#meta").textContent = S.source==="loading" ? "讀取資料中…" : "讀不到開獎資料";
  else $("#meta").innerHTML=`共 ${L.length} 期，最新 ${L[L.length-1].d}`+
    (S.source==="cache"?`<span class="src off">離線資料（${fmtTime(S.fetchedAt)} 更新）</span>`:"");
  $("#latest").innerHTML=L.length?L[L.length-1].n.map(ballHTML).join(""):"";
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-selected", b.dataset.t===S.tab));
  const v={dist:viewDist,gap:viewGap,trend:viewTrend,num:viewNum,rep:viewRep,combo:viewCombo,test:viewTest,ev:viewEV,data:viewData}[S.tab]();
  $("#view").innerHTML=v;
  const rs=$("#rangeSel"); if(rs) rs.onchange=e=>{ S.range=e.target.value==="all"?"all":+e.target.value; render(); };
  const ep=$("#evPer"); if(ep) ep.onchange=e=>{ S.evPer=+e.target.value; render(); };
  const tr=document.querySelector(".heat")?.parentElement; if(tr) tr.scrollLeft=tr.scrollWidth;
}

/* ---------- 事件 ---------- */
document.addEventListener("click", e=>{
  const tab=e.target.closest("#tabs button"); if(tab){ S.tab=tab.dataset.t; render(); window.scrollTo({top:0}); return; }
  const a=e.target.closest("[data-act]"); if(!a) return;
  const act=a.dataset.act;
  if(act==="rand"){ S.randomPick=sample5(Math.random); render(); }
  else if(act==="test"){ a.disabled=true; a.textContent="計算中…"; setTimeout(()=>{ S.test=backtest(S.draws)||"few"; render(); },30); }
  else if(act==="ev"){ a.disabled=true; a.textContent="模擬中…"; setTimeout(()=>{ S.ev=simulateEV(S.draws); render(); },30); }
});

render();
loadDraws();
})();
