# Cmail

Gmail × Claude AI mail client — Windows desktop (Electron) + iOS PWA + Vercel backend.

## Monorepo structure

```
apps/
  desktop/   — Electron + Next.js standalone (existing desktop app)
  backend/   — Next.js API-only, deployed to Vercel (serves mobile app)
  mobile/    — Vite + React PWA (iOS app via Safari "Add to Home Screen")
packages/
  shared/    — Shared types, i18n, API client stubs (currently empty)
```

Root `package.json` uses npm workspaces. `npm install` at root installs everything.

## Stack

### Desktop (`apps/desktop`)
- **Next.js 15** (App Router, `output: "standalone"`)
- **React 19** / **TypeScript** / **Tailwind v4**
- **Electron 33.4.11** (sandboxed renderer, strict CSP) — version FIXED (not `^`)
- **next-auth v4** Google OAuth (Desktop app client type)
- **Anthropic SDK** (BYOK — each user supplies their own Claude API key)
- **electron-builder** NSIS installer + **electron-updater** (GitHub Releases)

### Backend (`apps/backend`)
- **Next.js 15** API-only (NO `output: "standalone"` — Vercel handles serving)
- Deployed to **Vercel**, linked to `main` branch
- Storage: `StatelessAdapter` — reads from request headers, never touches FS
- BYOK: Anthropic key sent per-request via `X-Cmail-AI-Key` header
- GitHub integration: reads `GITHUB_PAT` / `GITHUB_OWNER` / `GITHUB_REPO` for Obsidian learning data

### Mobile (`apps/mobile`)
- **Vite + React PWA** — deployed to Vercel, opened in Safari, "Add to Home Screen"
- **NOT Capacitor** — Mac-free approach; no Xcode needed
- Auth: Google OAuth → JWT (jose HS256) stored in `localStorage`
- Token refresh: `accessTokenExpiresAt` in JWT, server refreshes via `X-Cmail-New-Token` header
- BYOK: Anthropic key in `localStorage`, sent via `X-Cmail-AI-Key` per request

## Key architectural decisions

- **BYOK (desktop)**: AI API key stored only in `userData/cmail-settings.json`. Client only sees masked value.
- **BYOK (mobile)**: Key stored in `localStorage`, sent per-request via `X-Cmail-AI-Key` header, never stored server-side.
- **Sandboxed HTML email**: rendered in `<iframe sandbox="allow-same-origin allow-popups">`. Never use `dangerouslySetInnerHTML`.
- **Learning data (mobile)**: Obsidian vault → Obsidian Git plugin → private GitHub repo → backend reads via GitHub API. Only `Cmail/` folder is read (contains `my-preferences.md`, `contacts/`, `labels/` and user's custom notes).
- **Learning data (desktop)**: reads local Obsidian `Cmail/` folder directly via `getCmailDir()`.
- **Lazy body loading**: inbox list fetched with `format: "metadata"`. Body pulled via `/api/gmail/message?id=...` on open.
- **Storage adapter pattern**: `CMAIL_STORAGE_MODE=stateless` (Vercel) vs default (local FS).

## Code style

- Comments in Japanese for product intent; English for implementation tradeoffs.
- All user-facing strings go through `t()` / `tf()` in `lib/i18n.ts` (5 langs: ja / en / ko / es / zh). Never hardcode Japanese in JSX.
- Prefer `Edit` over `Write` when modifying existing files.
- Never use emojis in files unless the user explicitly asks.

## Security constraints (PERMANENT)

- **`Client Codes/`** — contains `Keys.txt` with OAuth credentials. NEVER commit. Listed in root `.gitignore`.
- **`**/electron/credentials.js`** — desktop OAuth client ID/secret baked into .exe. NEVER commit.
- **`.env.local`, `cmail-settings.json`, `.nextauth-secret`** — never commit.
- **Obsidian `Inbox/` folder** — gitignored in `obsidian-vault` repo (may contain sensitive notes/keys).

## Important runtime constraints

- Electron prod startup spawns the Next.js standalone server via `ELECTRON_RUN_AS_NODE=1`. Required env vars: `NEXT_TELEMETRY_DISABLED=1`, `NODE_ENV=production`, `HOSTNAME=127.0.0.1`.
- Auto-update uses GitHub Releases via electron-updater. `GH_TOKEN` must be set in the shell env for release.
- `NEXTAUTH_SECRET` is auto-generated into `userData/.nextauth-secret` on first launch. Never ship a hard-coded one.
- NSIS install puts the app under `C:\Program Files\...` (read-only). Settings/logs/learning data go through `app.getPath("userData")` → `CMAIL_USER_DATA_DIR`.

## Desktop release ritual

**CRITICAL**: The project path `E:\Claude Projects\Cmail Project` contains spaces. `npm run release` fails because `cross-spawn` cannot spawn `app-builder.exe` with a spaced path. Must use **globally installed** `electron-builder`.

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd "E:\Claude Projects\Cmail Project\apps\desktop"

Remove-Item -Recurse -Force .next

npm version patch --no-git-tag-version
git add apps/desktop/package.json
git commit -m "<message> (v0.2.X)"
git push

$env:GH_TOKEN = [System.Environment]::GetEnvironmentVariable("GH_TOKEN", "User")
electron-builder --win --publish always
```

`GH_TOKEN` is already in the user's persistent env. `electron-builder` must be installed globally (`npm install -g electron-builder`).

---

**Always read `HANDOVER.md` at the start of each session.**
