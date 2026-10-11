/* 539 尾數觀察站：統計計算
 * 從 reference/539-tail.html 搬過來，公式不改。
 * 原本讀全域 S.draws 的函式，改成把開獎清單 L 當參數傳進來。
 * 開獎資料格式：[{d:"2026-10-07", n:[5,11,14,18,19]}, …]，由舊到新。
 */

const C395 = 575757;
const P_TAIL = d => d === 0 ? 1 - 376992/C395 : 1 - 324632/C395; // 某尾數在一期中至少出現一次的機率
const K = d => d === 0 ? 3 : 4; // 每個尾數有幾個號碼

/* ---------- 亂數 ---------- */
function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function sample5(r){ const a=[]; while(a.length<5){ const v=1+Math.floor(r()*39); if(!a.includes(v)) a.push(v); } return a.sort((x,y)=>x-y); }

/* ---------- 尾數 ---------- */
function tailCounts(list){ const c=Array(10).fill(0); list.forEach(x=>x.n.forEach(v=>c[v%10]++)); return c; }

// 尾數分布：次數、理論值、卡方值（門檻 16.92）
function tailDist(list){
  const c=tailCounts(list), N=list.length;
  const exp=c.map((_,d)=>N*5*K(d)/39);
  let chi=0; c.forEach((o,d)=>chi+=(o-exp[d])**2/exp[d]);
  return {c, exp, chi};
}

function gaps(L){
  const res=[];
  for(let d=0; d<10; d++){
    let cur=null, run=0, longest=0;
    for(let i=0;i<L.length;i++){
      const has=L[i].n.some(v=>v%10===d);
      if(has){ longest=Math.max(longest,run); run=0; } else run++;
    }
    longest=Math.max(longest,run); cur=run;
    res.push({d, cur, longest, p:P_TAIL(d)});
  }
  return res;
}
const numsOfTail = d => { const a=[]; for(let v=1;v<=39;v++) if(v%10===d) a.push(v); return a; };

/* 近 30 / 近 100 交叉比對：依號碼數校正後排名，兩邊都排最後 3 名的叫「雙冷」 */
function crossRank(list){
  const c=tailCounts(list), N=list.length;
  // z 分數：每期 5 球中某尾數的顆數是超幾何分布，變異數 = 5·p·(1-p)·34/38
  const r=c.map((o,d)=>{ const p=K(d)/39, E=N*5*p, sd=Math.sqrt(N*5*p*(1-p)*34/38);
    return {d,o,E,dev:(o-E)/E,z:(o-E)/sd}; });
  const order=r.slice().sort((a,b)=>a.z-b.z).map(x=>x.d); // 冷 → 熱
  r.forEach(x=>x.rank=order.indexOf(x.d)+1);
  return r;
}
// 回傳依合計名次排好的 10 列；L 少於 100 期回傳 null
function crossTable(L){
  if(L.length<100) return null;
  const a=crossRank(L.slice(-30)), b=crossRank(L.slice(-100));
  return a.map((x,d)=>({d,a:x,b:b[d],sum:x.rank+b[d].rank})).sort((p,q)=>p.sum-q.sum);
}
// 近 10／15／20／25／30 期各自最冷的尾數（用 crossRank 的 z 分數排，已校正尾 0 只有 3 個號碼）
// z 一樣的並列成同一組；組一直加到涵蓋至少 top 個尾數為止
const SHORT_RANGES=[10,15,20,25,30];
function coldTails(L, top=3){
  return SHORT_RANGES.filter(n=>L.length>=n).map(n=>{
    const sorted=crossRank(L.slice(-n)).sort((a,b)=>a.z-b.z);
    const groups=[]; let count=0;
    for(const x of sorted){
      const g=groups[groups.length-1];
      if(g && Math.abs(g.z-x.z)<1e-9){ g.tails.push(x.d); count++; continue; }
      if(count>=top) break;
      groups.push({z:x.z, o:x.o, tails:[x.d]}); count++;
    }
    return {n, groups};
  });
}
const isDualCold = r => r.a.rank<=3&&r.b.rank<=3;
const isDualHot = r => r.a.rank>=8&&r.b.rank>=8;

/* ---------- 單號冷熱 ---------- */
function numStats(L){
  const N=L.length, E=N*5/39, sd=Math.sqrt(N*(5/39)*(34/39));
  const cnt=Array(40).fill(0); L.forEach(x=>x.n.forEach(v=>cnt[v]++));
  const arr=[]; let chi=0;
  for(let v=1;v<=39;v++){ const z=(cnt[v]-E)/sd; arr.push({v,o:cnt[v],z}); chi+=(cnt[v]-E)**2/E; }
  chi*=38/34; // 每期 5 球不重複，修正成近似卡方
  return {E, arr, chi};
}

/* ---------- 單號遺漏 ---------- */
// 每個號碼：目前連續幾期沒開、歷史最長幾期沒開、最後一次開出日期
// 每期某個號碼開出的機率 = 5/39；平均遺漏 = (1-p)/p ≈ 6.8 期
const P_NUM = 5/39;
function numGaps(L){
  const res=[];
  for(let v=1; v<=39; v++){
    let run=0, longest=0, last=null;
    for(let i=0;i<L.length;i++){
      if(L[i].n.includes(v)){ longest=Math.max(longest,run); run=0; last=L[i].d; } else run++;
    }
    longest=Math.max(longest,run);
    res.push({v, cur:run, longest, last, prob:Math.pow(1-P_NUM,run)});
  }
  return res;
}

/* ---------- 中幾號 ---------- */
const PRIZE=[0,0,50,300,20000,8000000];
const MEM=new WeakMap();
function mset(x){ let m=MEM.get(x); if(!m){ m=new Uint8Array(40); x.n.forEach(v=>m[v]=1); MEM.set(x,m); } return m; }
function hits(pick,x){ const m=mset(x); let h=0; for(const v of pick) h+=m[v]; return h; }

/* ---------- 選號回測 ---------- */
const STRATS=[["hotT","追熱尾"],["coldT","追冷尾"],["dualT","雙冷尾"],["hotN","追熱號"],["coldN","追冷號"],["gapN","追遺漏號"],["rep","連莊"],["rand","隨機"]];
function backtest(L){
  const W=20, r=rng(539);
  if(L.length < 130) return null;
  const st={}; STRATS.forEach(([k])=>st[k]={h:0,h2:0,h3:0,pay:0}); let n=0;
  const pickFrom=tails=>tails.map(d=>{const ns=numsOfTail(d); return ns[Math.floor(r()*ns.length)];});
  // 追遺漏號（2026/10/8 新增）：用自己的亂數排同分，才不會改到原本 7 種策略的結果
  const r2=rng(5390), lastIdx=Array(40).fill(-1);
  for(let i=0;i<100;i++) L[i].n.forEach(v=>lastIdx[v]=i);
  for(let i=100;i<L.length;i++){
    const c=tailCounts(L.slice(i-W,i)).map((v,d)=>({d,v:v/K(d),t:r()}));
    const order=c.slice().sort((a,b)=>b.v-a.v||a.t-b.t).map(o=>o.d);
    const r30=crossRank(L.slice(i-30,i)), r100=crossRank(L.slice(i-100,i));
    const dualOrder=r30.map((x,d)=>({d,s:x.rank+r100[d].rank,t:r()})).sort((a,b)=>a.s-b.s||a.t-b.t).map(x=>x.d);
    const nc=Array(40).fill(0); L.slice(i-30,i).forEach(x=>x.n.forEach(v=>nc[v]++));
    const nOrder=[]; for(let v=1;v<=39;v++) nOrder.push({v,c:nc[v],t:r()});
    nOrder.sort((a,b)=>b.c-a.c||a.t-b.t);
    const picks={hotT:pickFrom(order.slice(0,5)), coldT:pickFrom(order.slice(5)), dualT:pickFrom(dualOrder.slice(0,5)),
      hotN:nOrder.slice(0,5).map(o=>o.v), coldN:nOrder.slice(-5).map(o=>o.v), rep:L[i-1].n.slice(), rand:sample5(r)};
    const gOrder=[]; for(let v=1;v<=39;v++) gOrder.push({v,g:i-1-lastIdx[v],t:r2()});
    picks.gapN=gOrder.sort((a,b)=>b.g-a.g||a.t-b.t).slice(0,5).map(o=>o.v);
    for(const k in picks){ const h=hits(picks[k],L[i]); st[k].h+=h; st[k].pay+=PRIZE[h]; if(h>=2)st[k].h2++; if(h>=3)st[k].h3++; }
    L[i].n.forEach(v=>lastIdx[v]=i);
    n++;
  }
  return {n, st};
}

/* ---------- 6 中 3 訊號（2026/10/11 新增，照「樂透統計學」影片概念實作，用來驗證） ----------
 * 三球組合：39 取 3 共 9,139 組；某期開出其中 2 個以上 = 「3 中 2 命中」。
 * 間距穩定：近 W 期至少命中 4 次，間隔的「標準差 ÷ 平均」(cv) 越小越規律。
 * 目前在低點：K 值 < 20，且距上次命中已達平均間隔的 0.8–1.2 倍（影片說的「支撐位」）。
 * K 值：命中那期 RSV = 100、沒中 = 0，K = 2/3 × 前一期 K + 1/3 × RSV；D = 2/3 × 前一期 D + 1/3 × K。
 * 配對：符合條件、cv 最小的前 30 組裡，挑兩組號碼不重複、cv 合計最小的，合成 6 個號碼。
 */
const SIG_W = 150, SIG_TOP = 30;
const P_6IN3 = 11061/575757;   // 隨機 6 個號碼，一期開出其中 3 個以上的機率
const P_3IN2 = 22050/575757;   // 隨機 3 個號碼，一期開出其中 2 個以上的機率
let TRI = null;
function tripleIndex(){
  if(TRI) return TRI;
  const key=new Int16Array(40*40*40).fill(-1), list=[];
  for(let a=1;a<=37;a++)for(let b=a+1;b<=38;b++)for(let c=b+1;c<=39;c++){ key[a*1600+b*40+c]=list.length; list.push([a,b,c]); }
  return TRI={key, list};
}
const TRI_HITS = new WeakMap();
// 每個三球組合「3 中 2 命中」的期別索引（由舊到新）
function tripleHits(L){
  let h=TRI_HITS.get(L); if(h) return h;
  const {key, list}=tripleIndex();
  h=list.map(()=>[]);
  L.forEach((x,i)=>{
    const n=x.n, seen=new Set();
    for(let p=0;p<5;p++)for(let q=p+1;q<5;q++)for(let c=1;c<=39;c++){
      if(c===n[p]||c===n[q]) continue;
      const t=[n[p],n[q],c].sort((u,v)=>u-v), id=key[t[0]*1600+t[1]*40+t[2]];
      if(!seen.has(id)){ seen.add(id); h[id].push(i); }
    }
  });
  TRI_HITS.set(L,h);
  return h;
}
function lowerBound(a,v){ let lo=0,hi=a.length; while(lo<hi){ const m=(lo+hi)>>1; if(a[m]<v) lo=m+1; else hi=m; } return lo; }
// 站在第 i 期開獎前（只用 i 之前的資料）評估一組三球
function evalTriple(h, i){
  const lo=lowerBound(h,i-SIG_W), hi=lowerBound(h,i), m=hi-lo;
  if(m<4) return null;
  let s=0, s2=0;
  for(let k=lo+1;k<hi;k++){ const d=h[k]-h[k-1]; s+=d; s2+=d*d; }
  const n=m-1, mean=s/n, sd=Math.sqrt(Math.max(s2/n-mean*mean,0));
  const g=i-1-h[hi-1];
  let K=0; for(let k=hi-1;k>=0 && i-1-h[k]<40;k--) K+=100/3*Math.pow(2/3,i-1-h[k]);
  return {m, mean, cv:sd/mean, g, K:Math.min(K,100)};
}
// 第 i 期的訊號：回傳 {a, b, six} 或 null（沒有符合條件的組合）
function signalAt(L, i){
  const {list}=tripleIndex(), H=tripleHits(L), cand=[];
  for(let id=0;id<list.length;id++){
    const e=evalTriple(H[id], i);
    if(e && e.K<20 && e.g>=0.8*e.mean && e.g<=1.2*e.mean) cand.push({id, t:list[id], ...e});
  }
  cand.sort((x,y)=>x.cv-y.cv||y.m-x.m||x.id-y.id);
  const top=cand.slice(0,SIG_TOP);
  let best=null;
  for(let p=0;p<top.length;p++)for(let q=p+1;q<top.length;q++){
    if(top[p].t.some(v=>top[q].t.includes(v))) continue;
    const sc=top[p].cv+top[q].cv;
    if(!best || sc<best.sc) best={sc, a:top[p], b:top[q]};
  }
  if(!best) return null;
  return {a:best.a, b:best.b, six:[...best.a.t, ...best.b.t].sort((x,y)=>x-y), candidates:cand.length};
}
// 6 個號碼包牌（6 注、300 元）：中 k 個時，k 注中 k-1 個、6-k 注中 k 個
const pay6 = k => k*(k>0?PRIZE[k-1]:0) + (6-k)*(k<6?PRIZE[Math.min(k,5)]:0);
// 回測：從第 SIG_W+1 期起，每期只用之前的資料產生訊號，再對當期開獎；同時跟隨機 6 個號碼比
// 寫成 generator：每算完一期就交回控制權，畫面可以顯示進度、不會卡住
function* backtest6Steps(L){
  if(L.length < SIG_W+30) return null;
  const r=rng(6363), res={sig:{n:0,h:0,six:0,a32:0,pay:0}, rand:{n:0,h:0,six:0,pay:0}, none:0};
  for(let i=SIG_W;i<L.length;i++){
    yield (i-SIG_W)/(L.length-SIG_W);
    const m=mset(L[i]);
    const rp=[]; while(rp.length<6){ const v=1+Math.floor(r()*39); if(!rp.includes(v)) rp.push(v); }
    const kr=rp.reduce((s,v)=>s+m[v],0);
    res.rand.n++; res.rand.h+=kr; if(kr>=3) res.rand.six++; res.rand.pay+=pay6(kr);
    const s=signalAt(L,i);
    if(!s){ res.none++; continue; }
    const k=s.six.reduce((t,v)=>t+m[v],0);
    res.sig.n++; res.sig.h+=k; if(k>=3) res.sig.six++; res.sig.pay+=pay6(k);
    for(const g of [s.a.t, s.b.t]) if(g.reduce((t,v)=>t+m[v],0)>=2) res.sig.a32++;
  }
  return res;
}
function backtest6(L){ const it=backtest6Steps(L); let s; do{ s=it.next(); }while(!s.done); return s.value; }
// 畫圖用：某組號碼（3 個或 6 個）近 n 期的命中、遺漏、K、D 序列；need = 幾個以上算命中
function hitSeries(L, nums, need, n){
  const out=[]; let K=0, D=0, gap=0;
  for(let i=0;i<L.length;i++){
    const m=mset(L[i]), hit=nums.reduce((t,v)=>t+m[v],0)>=need;
    K=2/3*K+1/3*(hit?100:0); D=2/3*D+1/3*K; gap=hit?0:gap+1;
    if(i>=L.length-n) out.push({d:L[i].d, hit, gap, K, D});
  }
  return out;
}

/* ---------- 連莊 ---------- */
const REP_THEO=[278256,231880,59840,5610,170,1].map(c=>c/575757);
function repeatStats(L){
  const ks=Array(6).fill(0); let sum=0;
  for(let i=1;i<L.length;i++){ const k=hits(L[i-1].n,L[i]); ks[k]++; sum+=k; }
  const n=L.length-1;
  return {ks, n, mean:sum/n};
}

/* ---------- 組合特徵 ---------- */
let THEO=null;
const SUM_LABELS=["≤59","60–79","80–99","100–119","120–139","≥140"];
const sumBin=s=>s<60?0:s<80?1:s<100?2:s<120?3:s<140?4:5;
function feats(n){
  let s=0,odd=0,big=0,pairs=0;
  for(let j=0;j<5;j++){ s+=n[j]; if(n[j]%2) odd++; if(n[j]>=20) big++; if(j&&n[j]-n[j-1]===1) pairs++; }
  return {sum:sumBin(s), odd, big, cons:Math.min(pairs,2)};
}
function theory(){
  if(THEO) return THEO;
  const T={sum:Array(6).fill(0),odd:Array(6).fill(0),big:Array(6).fill(0),cons:Array(3).fill(0)};
  const n=[0,0,0,0,0];
  for(n[0]=1;n[0]<=35;n[0]++)for(n[1]=n[0]+1;n[1]<=36;n[1]++)for(n[2]=n[1]+1;n[2]<=37;n[2]++)for(n[3]=n[2]+1;n[3]<=38;n[3]++)for(n[4]=n[3]+1;n[4]<=39;n[4]++){
    const f=feats(n); T.sum[f.sum]++; T.odd[f.odd]++; T.big[f.big]++; T.cons[f.cons]++;
  }
  for(const k in T) T[k]=T[k].map(c=>c/575757);
  return THEO=T;
}
function comboCounts(L){
  const A={sum:Array(6).fill(0),odd:Array(6).fill(0),big:Array(6).fill(0),cons:Array(3).fill(0)};
  L.forEach(x=>{ const f=feats(x.n); A.sum[f.sum]++; A.odd[f.odd]++; A.big[f.big]++; A.cons[f.cons]++; });
  return A;
}

/* ---------- 期望值（只算稅前） ---------- */
const PRIZES=[["頭獎","5 個全中",1,8000000],["貳獎","中 4 個",170,20000],["參獎","中 3 個",5610,300],["肆獎","中 2 個",59840,50]];
function evTable(){
  let pre=0;
  const rows=PRIZES.map(([name,cond,c,p])=>{ const e=c*p/575757; pre+=e; return {name,cond,c,p,e}; });
  return {rows, pre};
}
function simulateEV(L){
  const res=[];
  let jack=0;
  for(let p=0;p<1000;p++){ let pay=0, j=0; for(const x of L){ const h=hits(sample5(Math.random),x); pay+=PRIZE[h]; if(h===5) j=1; } jack+=j; res.push(pay); }
  const cost=L.length*50, net=res.map(v=>v-cost).sort((a,b)=>a-b);
  return {cost, jack, avg:res.reduce((a,b)=>a+b,0)/1000/cost, win:net.filter(v=>v>0).length, best:net[999], worst:net[0], med:net[500]};
}
