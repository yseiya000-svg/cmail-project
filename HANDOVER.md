# Cmail — Session Handover

> Living document. Update at the end of every session so the next Claude can resume cleanly.

Last updated: 2026-05-22

---

## 1. Current version state

- **Desktop latest released on GitHub**: `v0.2.2` (auto-update live)
- **Desktop v0.2.3**: cold-start perf changes are in `apps/desktop/electron/main.js` and committed on `feat/monorepo-mobile`. **Not yet released.** The release ritual changed — must `cd apps/desktop` first.
- **Current branch**: `feat/monorepo-mobile` (pushed to GitHub, clean)
- **`main` branch**: does NOT yet have the monorepo structure. Need to merge `feat/monorepo-mobile → main` before Vercel deployment works from `main`.

---

## 2. Recently completed (most recent first)

| Commit | Highlights |
|---|---|
| `9193280` feat(backend) | Scaffold `apps/backend` with `/api/health` for Vercel |
| `9a2ef10` chore | Add root `app:desktop` shortcut script |
| `8a1b5b0` fix(desktop) | Fix launcher `.vbs`/`.bat` cwd after monorepo move |
| `214e565` refactor | Convert to monorepo (`apps/desktop` + `packages/shared`) |
| `9661f07` chore | Track all previously untracked source files |
| v0.2.2 (on GitHub) | Label right-click rename/delete bug fix, lazy body load, SettingsProvider non-blocking, autoUpdater debounce |

---

## 3. In progress

**P2 — Vercel deployment** (user is on Vercel UI, stopped before clicking Deploy)

What the user needs to do:
1. **Merge `feat/monorepo-mobile` into `main`** first (Vercel production branch = `main`)
   ```powershell
   git checkout main
   git merge feat/monorepo-mobile
   git push
   git checkout feat/monorepo-mobile
   ```
2. On Vercel "New Project" page:
   - Click **Edit** next to Root Directory → type `apps/backend` → Save
   - Project Name can stay `cmail-project` or rename to `cmail-backend`
   - Framework: Next.js (auto-detected, correct)
3. Click **Deploy**
4. After deploy, set env vars in Vercel Dashboard → Settings → Environment Variables:
   - `GOOGLE_CLIENT_ID` — from Google Cloud Console (Web app OAuth client, NOT Desktop type)
   - `GOOGLE_CLIENT_SECRET` — same
   - `NEXTAUTH_SECRET` — run `openssl rand -base64 32` or use any strong random string
   - `NEXTAUTH_URL` — the Vercel deployment URL (e.g. `https://cmail-backend.vercel.app`)
   - `CMAIL_STORAGE_MODE` — literal: `stateless`
5. Verify: `curl https://<your-vercel-url>/api/health` returns `{"ok":true,...}`

**Before Vercel env vars work for auth:** user also needs a new Google Cloud Console OAuth client of type **"Web application"** (the existing one is type "Desktop app" and cannot issue tokens for a web server).

---

## 4. Pending (priority order)

| Priority | Task |
|---|---|
| **P2 (immediate)** | Complete Vercel deployment (see "In progress" above) |
| **P3** | Storage adapter layer — `LocalFsAdapter` vs `StatelessAdapter`, switch on `CMAIL_STORAGE_MODE` |
| **P4** | `apps/mobile` skeleton — Capacitor v6 + Vite + React, `cmail://` URL scheme |
| **P5** | Mobile OAuth — `cmail://auth/callback`, `/api/auth/mobile/*` endpoints, iOS Keychain |
| **P6** | Inbox + EmailDetail views (mobile) |
| **P7** | Compose + send (mobile) |
| **P8** | iCloud Drive integration — custom Swift `CmailFilePlugin.swift`, UIDocumentPicker, security-scoped bookmarks |
| **P9** | AI reply generation (mobile) |
| **P10** | Polish + Xcode install to own iPhone |
| Low | Desktop v0.2.3 release (cold-start perf) — run release ritual from `apps/desktop` |
| Low | OpenAI / Gemini provider support (BYOK UI already says "今後対応予定") |
| Low | Code-signing certificate (users hit SmartScreen) |

---

## 5. Key decisions made and WHY

### iOS approach
- **Capacitor v6** (not React Native, not Flutter) — reuses existing React/TypeScript UI with minimal changes.
- **Vercel** for backend hosting — free tier, zero-ops, auto-deploys from GitHub.
- **iCloud Drive** for Obsidian vault access on mobile — user already syncs vault to iCloud; avoids duplicating data.
- **Xcode direct install** (no App Store) — personal use only, avoids $99/year Apple Developer fee and review process.

### Desktop (carried over)
- **BYOK** — avoid Seiya being billed for users' API usage.
- **GitHub Releases** — works for private repos via `GH_TOKEN`, electron-updater natively supports it.
- **Next.js `output: "standalone"`** — bundles minimal Node so end users don't need Node installed.
- **Learning data in Obsidian folder** — Seiya already uses Obsidian; portability beats a dedicated DB.
- **Mail body lazy-loading** — 50-message full fetch was the single biggest startup bottleneck (2–3s).

### Explicitly rejected
- App Store distribution — personal use, not worth the cost/overhead.
- React Native / Flutter — would require rewriting all UI from scratch.
- Supabase / PlanetScale as backend DB — stateless BYOK design means no user data server-side.
- Email body machine translation — i18n covers UI strings only.
- Auto-regenerate `my-preferences.md` — manual-only. Reason: AI cost control.

---

## 6. Traps, gotchas, failed approaches

### Monorepo / release
- **Desktop release ritual changed**: must `cd apps/desktop` before `npm run release`. The old ritual ran from root — electron-builder and next build now must run from `apps/desktop/`.
- **`electron/credentials.js` path changed**: old `.gitignore` had `electron/credentials.js` (root-relative). The moved path is `apps/desktop/electron/credentials.js`. Fixed with `**/electron/credentials.js` pattern. Never revert this.
- **Credentials almost leaked**: during the monorepo move, `apps/desktop/electron/credentials.js` was briefly staged. Caught before push via `git reset --soft HEAD~1`. Always check `git status` before committing after file moves.

### Desktop (carried over)
- **Global `document.addEventListener("mousedown", close)` closes popups before inner button `onClick` fires.** Always use ref-based outside-click: `if (ref.current && !ref.current.contains(e.target))`. See `Sidebar.tsx` account popup for the canonical example.
- **`EmailMessage.body` is optional** (lazy loading). Any code touching `.body` must fall back to `message.snippet || ""`.
- **`process.cwd()` is read-only** on packaged NSIS installs. Always use `app.getPath("userData")` → `CMAIL_USER_DATA_DIR`.
- **`electron-updater` only in packaged builds.** In dev, wrap in `try { ... } catch {}`.
- **Always `Remove-Item -Recurse -Force .next`** before release. Stale content has shipped before.
- **Always `npm version patch --no-git-tag-version`**. electron-builder creates the git tag — adding one manually causes collisions.
- **Circular import `lib/settings.ts` ↔ `lib/obsidian.ts`** is solved by live bindings. Don't add top-level cross-calls.

### Vercel
- Backend `next.config.ts` must NOT have `output: "standalone"` — Vercel doesn't need it and it can cause issues.
- Root Directory in Vercel must be `apps/backend`, not `./`.
- The Google OAuth client for Vercel must be type **"Web application"** — the Desktop type cannot issue tokens for a hosted server.

---

## 7. Release ritual (desktop, canonical)

`GH_TOKEN` is already persisted in the user's Windows env vars.

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd "E:\Claude Projects\Cmail Project\apps\desktop"

Remove-Item -Recurse -Force .next

npm version patch --no-git-tag-version

git add <changed files>
git commit -m "<conventional commit message> (v0.2.X)"
git push

npm run release
```

---

## 8. Resume prompt for next session

Paste this at the start of the next session:

> Cmail プロジェクトの作業を再開します。まず `HANDOVER.md` を読んで現状把握してください。iOSアプリ開発のフェーズ中です。現在 `feat/monorepo-mobile` ブランチにいて、`apps/backend` が Vercel にデプロイ待ちです（P2）。HANDOVER の "In progress" セクションにある手順を確認して、ユーザーが何をすべき状態か把握した上で次の指示を待ってください。
