# Cmail

Gmail × Claude AI desktop mail client. Electron + Next.js standalone, distributed via GitHub Releases auto-update.

## Stack

- **Next.js 15** (App Router, `output: "standalone"`)
- **React 19** / **TypeScript** / **Tailwind v4**
- **Electron 33** (sandboxed renderer, strict CSP)
- **next-auth v4** Google OAuth (desktop app type)
- **Anthropic SDK** (BYOK — each user supplies their own Claude API key)
- **electron-builder** NSIS installer + **electron-updater** (GitHub Releases)

## Key architectural decisions

- **BYOK**: AI API key is per-user, stored only in `userData/cmail-settings.json`. The server reads it via `getSettings()`. The client only ever sees the masked value (`sk-ant-…abcd`).
- **Sandboxed HTML email**: rendered in an `<iframe sandbox="allow-same-origin allow-popups">` with strict CSP. Never use `dangerouslySetInnerHTML`.
- **Path validation**: `lib/path-validator.ts` `isSafeUserPath()` is the single source of truth. Re-validate at both API and `saveSettings()` layers.
- **Learning data lives in the Obsidian folder** the user picks: `contacts/`, `labels/`, `my-preferences.md`, `reply-patterns.json`. Folder structure is auto-initialized on path save (`initCmailFolderStructure()`).
- **Lazy body loading**: the inbox list is fetched with `format: "metadata"` for speed. Single message body is pulled via `/api/gmail/message?id=...` when the user opens it.

## Code style

- Comments in Japanese for product intent; English for implementation tradeoffs.
- All user-facing strings go through `t()` / `tf()` in `lib/i18n.ts` (5 langs: ja / en / ko / es / zh). Never hardcode Japanese in JSX.
- Prefer `Edit` over `Write` when modifying existing files.
- Never use emojis in files unless the user explicitly asks.

## Important runtime constraints

- Electron prod startup spawns the Next.js standalone server via `ELECTRON_RUN_AS_NODE=1`. The spawn env vars matter — especially `NEXT_TELEMETRY_DISABLED=1`, `NODE_ENV=production`, `HOSTNAME=127.0.0.1`.
- Auto-update uses GitHub Releases via electron-updater. `GH_TOKEN` must be set in the shell env for `npm run release` to publish.
- `NEXTAUTH_SECRET` is auto-generated into `userData/.nextauth-secret` on first launch. Never ship a hard-coded one.
- NSIS install puts the app under `C:\Program Files\...` which is read-only at runtime. Settings, logs, and learning data must go through `app.getPath("userData")` (propagated to Next.js as `CMAIL_USER_DATA_DIR`).

## Release ritual

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd "E:\Claude Projects\Cmail Project"
Remove-Item -Recurse -Force .next
npm version patch --no-git-tag-version
git add <changed files>
git commit -m "<message> (v0.2.X)"
git push
npm run release
```

`GH_TOKEN` is already in the user's persistent env, so it doesn't need to be set inline.

---

**Always read `HANDOVER.md` at the start of each session.**
