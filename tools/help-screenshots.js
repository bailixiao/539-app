// 重截「說明」頁用的 app 截圖（app/help/*.png）
// 用法：先在專案根目錄啟動本機網站（npx -y http-server app -p 5390 -c-1），
//       再在 tools/ 執行：npm install（第一次）→ node help-screenshots.js
// 用電腦上的 Chrome 模擬 390×844 手機畫面、淺色模式，網址加 #分頁名稱 直接打開該頁。
const puppeteer = require("puppeteer-core");
const os = require("os"), path = require("path");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOTS = [["dist", "home"], ["cross", "cross"], ["num", "num"], ["ev", "ev"]];  // [分頁, 檔名]

(async () => {
  const b = await puppeteer.launch({executablePath: CHROME, headless: true,
    userDataDir: path.join(os.tmpdir(), "t539-shot-" + Date.now())});  // 每次用全新設定檔，不受舊快取影響
  const p = await b.newPage();
  await p.setViewport({width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  await p.emulateMediaFeatures([{name: "prefers-color-scheme", value: "light"}]);
  for (const [tab, name] of SHOTS) {
    await p.goto(`http://localhost:5390/?s=${name}#${tab}`, {waitUntil: "domcontentloaded"});
    await p.waitForFunction(() => /共 \d+ 期/.test(document.querySelector("#meta").innerText) &&
      !/更新中/.test(document.querySelector("#meta").innerText), {timeout: 60000});
    await new Promise(r => setTimeout(r, 500));
    await p.screenshot({path: path.join(__dirname, "..", "app", "help", name + ".png")});
    console.log("已截圖", name, await p.evaluate(() => document.querySelector("#view h2")?.textContent));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
