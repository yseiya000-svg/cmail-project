import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    // updateViaCache: 'none' で HTTP キャッシュを迂回し、毎回 sw.js を取りに行く
    const registration = await navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });
    // 旧 SW が残っている場合に強制チェック
    registration.update();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
