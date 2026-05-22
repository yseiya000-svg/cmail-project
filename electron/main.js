const { app, BrowserWindow, shell, ipcMain, dialog, session } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
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

const PORT = 3000;
const ORIGIN = `http://localhost:${PORT}`;
const isDev = !app.isPackaged;

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

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryReq = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Next.js server start timeout"));
        } else {
          setTimeout(tryReq, 500);
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
      env: { ...process.env, PORT: String(PORT) },
      shell: true,
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    });
  } else {
    // Prod: run the Next.js standalone server using Electron-as-Node.
    // electron-builder packs `.next/standalone` into resources/app via extraResources.
    const serverScript = path.join(process.resourcesPath, "app", "server.js");
    nextProcess = spawn(process.execPath, [serverScript], {
      cwd: path.join(process.resourcesPath, "app"),
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
      },
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
  }

  nextProcess.on("error", (err) => {
    console.error("Next.js process error:", err);
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
      "connect-src 'self' http://localhost:3000 ws://localhost:3000 https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com",
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
    title: "Cmail",
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<h1 style="font-family:sans-serif;color:#dc2626;padding:24px">起動エラー</h1><pre style="padding:24px;color:#374151">${err.message}</pre>`
          )
      );
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
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
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
