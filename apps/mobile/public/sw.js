// 最小構成のサービスワーカー — PWA としてインストール可能にする
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

// クロスオリジン（backend API）リクエストはサービスワーカーを素通りさせる
// 同一オリジンのみキャッシュ対象（オフライン対応は P10 で実装予定）
self.addEventListener("fetch", (e) => {
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request));
});
