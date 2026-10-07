/* 539 尾數觀察站：service worker（離線也能打開）
 * 網頁檔案存一份在手機裡。改了 app 的檔案時，把 VERSION 換掉，舊的快取會自動清掉。
 * 開獎資料不在這裡處理：app.js 自己會把資料存在 localStorage。
 */
const VERSION = "20261008d";
const CACHE = "t539-" + VERSION;
const SHELL = [
  "./",
  "./index.html",
  "./style.css?v=" + VERSION,
  "./stats.js?v=" + VERSION,
  "./app.js?v=" + VERSION,
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("t539-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 開獎資料（Apps Script）不經過快取
  if (url.hostname.endsWith("script.google.com") || url.hostname.endsWith("googleusercontent.com")) return;

  // 打開頁面：先上網拿新版，沒網路就用存的
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 其他檔案（css、js、圖示、字型）：有存就用存的，沒有再上網拿並存起來
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
