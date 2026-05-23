// 最小構成のサービスワーカー — PWA としてインストール可能にする
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

// オフラインキャッシュは P10 で実装予定。今は全リクエストをネットワークに流す
self.addEventListener("fetch", (e) => {
  e.respondWith(fetch(e.request));
});
