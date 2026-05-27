# Cmail — Session Handover

> Living document. Update at the end of every session so the next Claude can resume cleanly.

Last updated: 2026-05-26 (session 2)

---

## 1. Current version state

- **Desktop latest released on GitHub**: `v0.2.4` (auto-update live)
- **Current branch**: `main` (clean, pushed)
- **Backend**: deployed on Vercel, linked to `main`, GitHub integration active
- **Mobile**: PWA served by Vercel backend (`apps/backend`), accessible at Vercel URL

---

## 2. Recently completed (this session, most recent first)

| Task | Status |
|---|---|
| Obsidian 学習ファイル選択 UI (両アプリ): Cmail/ 直下 .md をチェックボックスで選択 | Done — モバイル設定 / デスクトップ設定 / バックエンド `/api/obsidian/files` |
| モバイル PWA を紫ブランドに統一: アイコン (cmail-256 流用) + theme-color + CSS変数 #7c3aed | Done |
| デスクトップ起動エラー修正: ルートに `launch-cmail.vbs` / `.bat` のプロキシ作成 | Done — 旧ショートカット書換不要 |
| Desktop v0.2.4 release (NSIS installer on GitHub Releases) | Done |
| PWA icons for mobile (icon-192, icon-512, apple-touch-icon) | Done |
| Unified Obsidian file selection: both mobile + desktop use `Cmail/` folder only | Done |
| Security incident resolved: API key in `Inbox/` was exposed via GitHub, rotated | Done |
| Obsidian GitHub integration (`apps/backend/lib/github.ts`) | Done |
| Debug endpoint (`/api/debug/obsidian`) to verify GitHub connection | Done |
| AI reply uses Obsidian notes as learning data (mobile backend) | Done |
| P4–P10 (mobile skeleton → OAuth → inbox → compose → iCloud → AI reply → polish) | Done (prior session) |

---

## 3. In progress

Nothing actively in progress. All requested work is complete.

---

## 4. Pending (priority order)

| Priority | Task |
|---|---|
| Low | npm audit — 18 vulnerabilities (6 moderate, 12 high) in root monorepo |
| Low | Code-signing certificate for desktop (users see SmartScreen warning) |
| Low | OpenAI / Gemini provider support (BYOK UI says "今後対応予定") |
| Low | `apps/mobile` native Capacitor build for direct iPhone install via Xcode |
| Low | Remove or lock down `/api/debug/obsidian` endpoint before sharing with others |

---

## 5. Key decisions made and WHY

### Obsidian learning data (this session)
- **`Cmail/` folder only**: both desktop (`lib/obsidian.ts`) and mobile (`lib/github.ts`) now read only `.md` files under the `Cmail/` subfolder of the Obsidian vault. This prevents accidental inclusion of private notes (Notion exports, Inbox, etc.).
- **`my-preferences.md` pinned first**: when building the learning-data string, `my-preferences.md` is always placed at the top so the AI sees user preferences before other notes.
- **Silent fallback**: if GitHub API is down / PAT missing / repo empty, `fetchObsidianNotes()` returns `""` and AI reply generation continues without learning data.
- **`Inbox/` gitignored on vault**: prevents any future credential files in Inbox from being pushed to GitHub.

### Mobile (PWA, not native Capacitor — this session)
- Decided to serve mobile as PWA from Vercel backend rather than building a native Capacitor .ipa. Avoids Xcode complexity for now. User can add to home screen from Safari.
- If native install is needed later, `apps/mobile` Capacitor scaffold is present and can be connected to Xcode.

### electron-builder path-with-spaces workaround (critical)
- Project path `E:\Claude Projects\Cmail Project` contains spaces.
- `npm run release` (inside `apps/desktop`) FAILS with ENOENT because `cross-spawn` in `builder-util` cannot spawn `app-builder.exe` via `child_process.spawn()` when the binary path contains spaces.
- **Fix**: install `electron-builder` globally → `npm install -g electron-builder` → binary lands in `C:\Users\Seiya\AppData\Roaming\npm\` (no spaces).
- **Release ritual**: run `electron-builder --win --publish always` directly from shell instead of `npm run release`.

---

## 6. Traps, gotchas, failed approaches

### Desktop release (critical — updated this session)
- **`npm run release` DOES NOT WORK** from the project directory due to spaces in path. Use the global `electron-builder` binary directly (see release ritual below).
- **Electron version must be fixed** (e.g. `"33.4.11"`, NOT `"^33.0.0"`). electron-builder cannot determine the exact version to package if a semver range is specified. Current `apps/desktop/package.json` already has a fixed version.
- **Always `Remove-Item -Recurse -Force .next`** before releasing. Stale build artifacts have shipped before.
- **Never `npm version patch` AND manually tag** — electron-builder creates the git tag automatically.

### Obsidian / GitHub security
- **`Inbox/` on Obsidian vault was NOT gitignored initially.** User had `Inbox/Keys 2.md` and `Inbox/Keys(1).md` containing a full Anthropic API key. These were fetched as learning data and sent to Claude. Key has since been revoked and rotated.
- **Vault `.gitignore` now excludes**: `.obsidian/plugins/`, `.obsidian/workspace*.json`, `*.icloud`, `Inbox/`, `*Keys*.md`, `*keys*.md`, `*token*.md`, `*secret*.md`.
- **Never remove `Inbox/` from vault `.gitignore`.** The Inbox folder is used for quick capture and often contains sensitive content.

### GitHub PAT entry
- When pasting PAT into Vercel env var, paste the token string only (`github_pat_...`). Do NOT include a "Token " prefix. The code adds `Bearer ` automatically.

### General
- **Global `document.addEventListener("mousedown", close)` closes popups before inner button `onClick` fires.** Always use ref-based outside-click.
- **`EmailMessage.body` is optional** (lazy loading). Any code touching `.body` must fall back to `message.snippet || ""`.
- **`process.cwd()` is read-only** on packaged NSIS installs. Always use `app.getPath("userData")` → `CMAIL_USER_DATA_DIR`.
- **Backend `next.config.ts` must NOT have `output: "standalone"`** — Vercel doesn't need it.
- **Google OAuth client for backend must be type "Web application"** — Desktop type cannot issue tokens for a hosted server.

---

## 7. Release ritual (desktop, canonical — UPDATED)

`GH_TOKEN` is already persisted in the user's Windows env vars.

```powershell
# 1. Install global electron-builder ONCE (if not already done):
#    npm install -g electron-builder

$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd "E:\Claude Projects\Cmail Project\apps\desktop"

# 2. Clean build
Remove-Item -Recurse -Force .next

# 3. Bump version (do NOT git tag manually — electron-builder does it)
npm version patch --no-git-tag-version

# 4. Build Next.js standalone + copy assets
npm run build:app

# 5. Commit + push
git add apps/desktop/package.json
git commit -m "chore: bump desktop to v0.2.X"
git push

# 6. Release via GLOBAL electron-builder (not npm run release — spaces-in-path bug)
electron-builder --win --publish always
```

---

## 8. Vercel env vars reference

These must be set in Vercel Dashboard → Settings → Environment Variables for the backend:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Web app OAuth client ID (Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Web app OAuth client secret |
| `NEXTAUTH_SECRET` | Strong random string |
| `NEXTAUTH_URL` | Vercel deployment URL (e.g. `https://cmail-backend.vercel.app`) |
| `CMAIL_STORAGE_MODE` | `stateless` |
| `GITHUB_PAT` | Fine-grained PAT, Contents:Read-only on obsidian-vault repo |
| `GITHUB_OWNER` | `yseiya000-svg` |
| `GITHUB_REPO` | `obsidian-vault` |

---

## 9. Obsidian learning data architecture

- **Desktop**: reads local vault at `E:\iCloudDrive\iCloud~md~obsidian\Main Brain\` → filters `Cmail/*.md`
- **Mobile**: backend reads from GitHub repo `yseiya000-svg/obsidian-vault` via PAT → filters `Cmail/*.md`
- **Convention**: drop any `.md` file into the vault's `Cmail/` folder to include it as AI learning data
- **`my-preferences.md`**: highest-priority file, always pinned first in the context
- **Limits**: max 15 files, 600 chars/file, 4500 chars total

---

## 10. Resume prompt for next session

Paste this at the start of the next session:

> Cmail プロジェクトの作業を再開します。まず `HANDOVER.md` を読んで現状把握してください。デスクトップ v0.2.4 がリリース済みで、バックエンドは Vercel にデプロイ済み、モバイルは PWA として動作中です。GitHub 経由の Obsidian 連携も完成しています。現在 `main` ブランチです。`HANDOVER.md` の「Pending」セクションを確認し、ユーザーの次の指示を待ってください。
