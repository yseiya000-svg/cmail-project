const { app, BrowserWindow, shell, ipcMain, dialog, session } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const fs = require("fs");
const crypto = require("crypto");

// electron-updater is only available in packaged builds (when it's actually
// shipped as a dependency). Wrap require() so dev mode without the package
// still boots.
let autoUpdater = null;
try {
  // eslint-disable-next-line global-require
  ({ autoUpdater } = require("electron-updater"));
} catch {
  autoUpdater = null;
}

// Port: starts at 3000 but auto-picks a free one in [3000, 3010] if occupied.
// Friends with other dev tools (Vercel CLI, Docker, etc.) holding 3000 used to
// hit "Next.js server start timeout" — this loop fixes that silently.
let PORT = 3000;
let ORIGIN = `http://localhost:${PORT}`;
const isDev = !app.isPackaged;

/**
 * Append a line to the per-user error log so end users can attach it when
 * reporting issues. Best-effort: never throws.
 */
function logToFile(line) {
  try {
    const logDir = app.getPath("userData");
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "cmail-error.log");
    const stamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${stamp}] ${line}\n`, "utf-8");
  } catch {
    // best-effort
  }
}

function getErrorLogPath() {
  try {
    return path.join(app.getPath("userData"), "cmail-error.log");
  } catch {
    return "(unknown)";
  }
}

/** Returns true if `port` can be bound on 127.0.0.1. */
function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, "127.0.0.1");
  });
}

/** Pick a free port in [start, max]; throws if none available. */
async function pickFreePort(start = 3000, max = 3010) {
  for (let p = start; p <= max; p++) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p)) return p;
  }
  throw new Error(`No free port available in range ${start}-${max}`);
}

// --- Cold-start tuning -------------------------------------------------------
// Skip Windows occlusion calculations during boot — they delay first paint by
// 100-300ms on Windows without affecting correctness for a single-window app.
// (Documented Electron-on-Windows speedup; safe and reversible.)
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

// Google OAuth の遷移先。これらは Electron 内で開かないと
// 認証 Cookie がアプリ側に届かないため、外部ブラウザ送りにしない。
const OAUTH_ALLOWED_HOSTS = [
  "accounts.google.com",
  "accounts.youtube.com",
  "oauth2.googleapis.com",
  "ssl.gstatic.com",
  "www.google.com",
  "www.gstatic.com",
];

function isOAuthNavigation(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") return false;
    return OAUTH_ALLOWED_HOSTS.some(
      (h) => u.hostname === h || u.hostname.endsWith("." + h)
    );
  } catch {
    return false;
  }
}

let nextProcess = null;
let mainWindow = null;

// --- userData & secrets setup (must run before spawning Next.js) -------------

/**
 * Returns the per-user app data directory and ensures the in-process Node
 * environment has CMAIL_USER_DATA_DIR and CMAIL_APP_DIR set so child
 * processes (Next.js) inherit them.
 */
function configureRuntimeEnv() {
  const userDataDir = app.getPath("userData");
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
  } catch {}
  process.env.CMAIL_USER_DATA_DIR = userDataDir;
  process.env.CMAIL_APP_DIR = app.getAppPath();

  // Surface the OS locale to the Next.js server so new installs default
  // to the user's system language instead of always falling back to ja.
  try {
    process.env.CMAIL_DEFAULT_LANGUAGE = app.getLocale() || "";
  } catch {}

  // Google OAuth "Desktop app" credentials — bundled into the .exe so the
  // packaged app can sign in without each user needing their own Google
  // Cloud project. The file is gitignored; ship-time builds expect it
  // alongside main.js. In dev, .env.local takes precedence (the require
  // is wrapped so a missing file does not crash).
  try {
    // eslint-disable-next-line global-require
    const creds = require("./credentials.js");
    if (creds.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID) {
      process.env.GOOGLE_CLIENT_ID = creds.GOOGLE_CLIENT_ID;
    }
    if (creds.GOOGLE_CLIENT_SECRET && !process.env.GOOGLE_CLIENT_SECRET) {
      process.env.GOOGLE_CLIENT_SECRET = creds.GOOGLE_CLIENT_SECRET;
    }
  } catch {
    if (!isDev) {
      console.error(
        "[cmail] electron/credentials.js not found in packaged build — Google sign-in will fail."
      );
    }
  }

  // NEXTAUTH_SECRET: persist a per-install random secret if none is set.
  if (!process.env.NEXTAUTH_SECRET) {
    const secretFile = path.join(userDataDir, ".nextauth-secret");
    let secret;
    try {
      if (fs.existsSync(secretFile)) {
        secret = fs.readFileSync(secretFile, "utf-8").trim();
      }
    } catch {}
    if (!secret) {
      secret = crypto.randomBytes(32).toString("hex");
      try {
        fs.writeFileSync(secretFile, secret, { encoding: "utf-8", mode: 0o600 });
      } catch {}
    }
    process.env.NEXTAUTH_SECRET = secret;
  }

  if (!process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = ORIGIN;
  }
}

// --- Next.js process management ----------------------------------------------

function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    // Cold-start tuning: poll aggressively at first (every 50ms) so we don't
    // sit idle for half a second after the server actually starts listening,
    // then back off to 200ms to avoid burning CPU on slow boots.
    let attempt = 0;
    const tryReq = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Next.js server start timeout"));
        } else {
          attempt += 1;
          const delay = attempt < 20 ? 50 : 200;
          setTimeout(tryReq, delay);
        }
      });
    };
    tryReq();
  });
}

function startNext() {
  if (isDev) {
    // Dev: spawn `npm run dev` and let Next.js handle hot reload.
    const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
    nextProcess = spawn(cmd, ["run", "dev"], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        PORT: String(PORT),
        // Skip Next.js' phone-home telemetry — saves a network probe on every
        // cold start (300-800ms on slow / metered connections).
        NEXT_TELEMETRY_DISABLED: "1",
      },
      shell: true,
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    });
  } else {
    // Prod: run the Next.js standalone server using Electron-as-Node.
    // electron-builder packs `.next/standalone` into resources/app via extraResources.
    const serverScript = path.join(process.resourcesPath, "app", "server.js");
    if (!fs.existsSync(serverScript)) {
      const msg = `Next.js server.js が見つかりません: ${serverScript}\nインストールが破損している可能性があります。アプリを再インストールしてください。`;
      logToFile("[startNext] " + msg);
      throw new Error(msg);
    }
    nextProcess = spawn(process.execPath, [serverScript], {
      cwd: path.join(process.resourcesPath, "app"),
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        // Skip Next.js' phone-home telemetry — saves a network probe on every
        // cold start (300-800ms on slow / metered connections). This is the
        // single largest post-install / post-update startup win.
        NEXT_TELEMETRY_DISABLED: "1",
      },
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
  }

  nextProcess.on("error", (err) => {
    console.error("Next.js process error:", err);
    logToFile("[nextProcess error] " + (err?.stack || err?.message || String(err)));
  });
  nextProcess.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      logToFile(`[nextProcess exit] code=${code} signal=${signal}`);
    }
  });
}

// --- Splash screen -----------------------------------------------------------

const SPLASH_HTML = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Cmail</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%; width: 100%; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%);
      color: #4c1d95;
    }
    .wrap { height: 100%; width: 100%; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 24px; }
    .logo { width: 64px; height: 64px; background: #7c3aed; border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 10px 30px rgba(124,58,237,.35);
      animation: float 2.4s ease-in-out infinite; }
    .logo svg { width: 32px; height: 32px; fill: white; }
    .title { font-size: 22px; font-weight: 700; color: #1f2937; letter-spacing: .5px; }
    .subtitle { font-size: 13px; color: #6b7280; }
    .spinner { width: 28px; height: 28px;
      border: 3px solid rgba(124,58,237,.2); border-top-color: #7c3aed;
      border-radius: 50%; animation: spin .9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">
      <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
    </div>
    <div class="title">Cmail</div>
    <div class="spinner"></div>
    <div class="subtitle">起動中...</div>
  </div>
</body>
</html>`;

// --- CSP / navigation lockdown -----------------------------------------------

function installSecurityPolicy() {
  const ses = session.defaultSession;

  // Strict CSP for responses served by our own Next.js server. We MUST NOT
  // inject our CSP into responses coming from Google (or any other origin)
  // because their pages have their own form-action / frame-ancestors rules
  // and ours would break the OAuth consent flow (e.g. the "Allow" button on
  // accounts.google.com posts through several google subdomains).
  // 'unsafe-eval' & 'unsafe-inline' are unfortunately required for Next.js
  // (dev HMR + inline runtime scripts). We tighten everything else.
  ses.webRequest.onHeadersReceived((details, callback) => {
    let fromOurOrigin = false;
    try {
      const u = new URL(details.url);
      fromOurOrigin =
        (u.protocol === "http:" || u.protocol === "https:") &&
        u.hostname === "localhost" &&
        (u.port === String(PORT) || u.port === "");
    } catch {}

    if (!fromOurOrigin) {
      // Leave Google's (or any other host's) own headers untouched.
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const csp = [
      "default-src 'self'",
      // Email bodies (rendered inside a sandboxed iframe via srcDoc) routinely
      // pull marketing / logo imagery from arbitrary HTTPS hosts. The iframe
      // sandbox forbids scripts regardless of CSP, so blanket-allowing https:
      // images is safe — the worst case is a tracking pixel.
      "img-src 'self' data: blob: http: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      `connect-src 'self' http://localhost:${PORT} ws://localhost:${PORT} https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com`,
      "frame-src 'self' data: https://accounts.google.com",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      // form-action must allow accounts.google.com so the NextAuth signin
      // form (POST to /api/auth/signin/google → 302 to accounts.google.com)
      // is not blocked at the redirect step.
      "form-action 'self' https://accounts.google.com",
    ].join("; ");
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
        "X-Content-Type-Options": ["nosniff"],
        "Referrer-Policy": ["strict-origin-when-cross-origin"],
      },
    });
  });

  // Refuse permission requests from the renderer (notifications, camera, mic…).
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}

// --- Path validator (mirrors lib/path-validator.ts, used by IPC) -------------

function isSafePathServerSide(p) {
  if (p === "" || p == null) return true;
  if (typeof p !== "string") return false;
  if (p.includes("\0")) return false;
  if (!path.isAbsolute(p)) return false;
  const segs = path.normalize(p).split(/[\\/]+/);
  if (segs.includes("..")) return false;
  const lower = path.normalize(p).toLowerCase();
  if (process.platform === "win32") {
    const forbidden = [
      (process.env.WINDIR || "C:\\Windows").toLowerCase(),
      (process.env["PROGRAMFILES"] || "C:\\Program Files").toLowerCase(),
      (process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)").toLowerCase(),
      (process.env.PROGRAMDATA || "C:\\ProgramData").toLowerCase(),
    ];
    for (const root of forbidden) {
      if (lower === root || lower.startsWith(root + "\\") || lower.startsWith(root + "/")) {
        return false;
      }
    }
  }
  const appDir = process.env.CMAIL_APP_DIR;
  if (appDir) {
    const appLower = path.normalize(appDir).toLowerCase();
    if (lower === appLower || lower.startsWith(appLower + path.sep)) return false;
  }
  return true;
}

// --- Window creation ---------------------------------------------------------

async function createWindow() {
  const iconPath = path.join(__dirname, "..", "public", "icons", "cmail.ico");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: `Cmail v${app.getVersion()}`,
    icon: iconPath,
    autoHideMenuBar: true,
    show: true,
    backgroundColor: "#ede9fe",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Whitelist navigation: only our Next.js origin and Google OAuth domains can
  // replace the top frame. Without the OAuth allowance the sign-in redirect
  // gets shunted into the system browser, where the callback cookies land —
  // and the Electron window never sees the session.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (
      url.startsWith(ORIGIN) ||
      url.startsWith("data:text/html") ||
      isOAuthNavigation(url)
    ) {
      return;
    }
    event.preventDefault();
    shell.openExternal(url);
  });

  // Google OAuth sometimes opens an account picker in a popup. Let those
  // happen inside Electron so cookies stay in-app; everything else goes to
  // the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isOAuthNavigation(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Disable the default app menu in production (still autoHidden in dev).
  if (!isDev) mainWindow.setMenuBarVisibility(false);

  // 1) Splash
  await mainWindow.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(SPLASH_HTML)
  );

  // 2) Real app
  try {
    await waitForServer(ORIGIN);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(ORIGIN);
    }
  } catch (err) {
    const stack = err?.stack || err?.message || String(err);
    logToFile("[createWindow] " + stack);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const logPath = getErrorLogPath();
      const safeMessage = String(err?.message ?? err).replace(/[<>&]/g, (c) =>
        c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
      );
      const safeStack = String(stack).replace(/[<>&]/g, (c) =>
        c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
      );
      const safeLogPath = logPath.replace(/[<>&]/g, (c) =>
        c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
      );
      const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>Cmail - 起動エラー</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; color: #1f2937; background: #f9fafb; margin: 0; padding: 32px; line-height: 1.6; }
  h1 { color: #dc2626; font-size: 24px; margin: 0 0 8px; }
  h2 { color: #374151; font-size: 14px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .ver { color: #9ca3af; font-size: 12px; margin-bottom: 16px; }
  pre { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  ol { padding-left: 20px; }
  ol li { margin-bottom: 6px; }
  code { background: #fef3c7; padding: 1px 6px; border-radius: 4px; font-size: 12px; font-family: ui-monospace, Consolas, monospace; }
  button { background: #7c3aed; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 16px; }
  button:hover { background: #6d28d9; }
  .log { color: #6b7280; font-size: 11px; font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
</style>
</head>
<body>
  <h1>起動エラー</h1>
  <div class="ver">Cmail v${app.getVersion()}</div>
  <pre>${safeMessage}</pre>

  <h2>次の手順を試してください</h2>
  <ol>
    <li>PowerShell で <code>netstat -ano | findstr :3000</code> を実行し、他のアプリがポート 3000–3010 を占有していないか確認</li>
    <li>Windows Defender が <code>server.js</code> を隔離していないか確認 (Windowsセキュリティ → ウイルスと脅威の防止 → 保護の履歴)</li>
    <li>Cmail をアンインストール → 最新インストーラを GitHub Releases からダウンロード → 再インストール</li>
    <li>それでも直らない場合は下記ログファイルを開発者に送ってください</li>
  </ol>

  <h2>エラーログの場所</h2>
  <div class="log">${safeLogPath}</div>

  <h2>詳細</h2>
  <pre>${safeStack}</pre>

  <button onclick="location.reload()">再試行</button>
</body>
</html>`;
      mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    }
  }
}

// --- IPC handlers ------------------------------------------------------------

ipcMain.handle("cmail:select-folder", async (_event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Cmailフォルダを選択",
    properties: ["openDirectory", "createDirectory"],
    defaultPath:
      defaultPath && typeof defaultPath === "string" && fs.existsSync(defaultPath)
        ? defaultPath
        : undefined,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const picked = result.filePaths[0];
  if (!isSafePathServerSide(picked)) return null;
  return picked;
});

// --- App lifecycle -----------------------------------------------------------

// --- Auto-update ---------------------------------------------------------------

function setupAutoUpdater() {
  if (!autoUpdater || isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    console.error("[updater] error:", err?.message || err);
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] update available:", info?.version);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["今すぐ再起動", "あとで"],
      defaultId: 0,
      cancelId: 1,
      title: "アップデートの準備ができました",
      message: `Cmail ${info?.version ?? ""} のダウンロードが完了しました。`,
      detail: "今すぐ再起動して更新するか、次回起動時に自動適用するか選べます。",
    });
    if (choice.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  // Wait a beat so the splash → main app transition is not interrupted.
  setTimeout(() => {
    // Debounce: skip the network round-trip to GitHub if we already checked
    // within the last hour. This prevents repeated restarts (common right
    // after install or when iterating in dev) from hammering the GitHub API
    // and slowing down startup on slow Wi-Fi.
    const stampPath = path.join(app.getPath("userData"), ".last-update-check");
    const ONE_HOUR_MS = 60 * 60 * 1000;
    try {
      if (fs.existsSync(stampPath)) {
        const last = Number(fs.readFileSync(stampPath, "utf-8")) || 0;
        const age = Date.now() - last;
        if (age < ONE_HOUR_MS) {
          const mins = Math.round(age / 60000);
          console.log(`[updater] skip: checked ${mins}m ago`);
          return;
        }
      }
    } catch {
      // best-effort — fall through to the check if the stamp is unreadable
    }
    autoUpdater
      .checkForUpdatesAndNotify()
      .then(() => {
        try {
          fs.writeFileSync(stampPath, String(Date.now()), "utf-8");
        } catch {
          // best-effort
        }
      })
      .catch((err) => {
        console.error("[updater] check failed:", err?.message || err);
      });
  }, 5000);
}

// Force single-instance: if Cmail is already running, focus the existing
// window instead of starting a second copy that would fail to bind port 3000.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.cmail.app");
    }

    // PORT を先に確定させる: 3000 が他アプリに占有されていたら 3001..3010 から選ぶ。
    // configureRuntimeEnv / installSecurityPolicy / startNext はすべて PORT に依存するので順序が大事。
    try {
      PORT = await pickFreePort(3000, 3010);
      ORIGIN = `http://localhost:${PORT}`;
      if (PORT !== 3000) {
        logToFile(`[startup] port 3000 was busy, falling back to ${PORT}`);
      }
    } catch (err) {
      logToFile("[pickFreePort] " + (err?.message || String(err)));
      // PORT 取得に失敗してもデフォルトで続行 (createWindow 側でエラー表示)
    }

    configureRuntimeEnv();
    installSecurityPolicy();
    startNext();
    await createWindow();
    setupAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

/**
 * Make absolutely sure the spawned Next.js server dies with the Electron
 * app. `.kill()` alone often leaves a stranded server.js on Windows because
 * it does not walk the child tree; `taskkill /T /F` does.
 */
function killNextProcess() {
  if (!nextProcess) return;
  const pid = nextProcess.pid;
  try {
    if (process.platform === "win32" && pid) {
      // /T = include child processes, /F = force. windowsHide keeps it silent.
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      nextProcess.kill();
    }
  } catch {}
  nextProcess = null;
}

app.on("window-all-closed", () => {
  killNextProcess();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", killNextProcess);
app.on("will-quit", killNextProcess);

// Block the rest of the world from creating new web contents.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
