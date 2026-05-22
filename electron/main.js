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

  // Strict CSP for every response served to the renderer.
  // 'unsafe-eval' & 'unsafe-inline' are unfortunately required for Next.js
  // (dev HMR + inline runtime scripts). We tighten everything else.
  ses.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com https://*.gstatic.com",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' http://localhost:3000 ws://localhost:3000",
      "frame-src 'self' data:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
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

  // Whitelist navigation: only our Next.js origin can replace the top frame.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN) && !url.startsWith("data:text/html")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Any window.open / target=_blank goes to the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Same-origin pop-ups are not used by Cmail; everything external goes out.
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

app.on("window-all-closed", () => {
  if (nextProcess) {
    try { nextProcess.kill(); } catch {}
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess) {
    try { nextProcess.kill(); } catch {}
  }
});

// Block the rest of the world from creating new web contents.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
});
