# Cmail — Session Handover

> Living document. Update at the end of every session so the next Claude can resume cleanly.

Last updated: 2026-05-22

---

## 1. Current version state

- **Latest released on GitHub**: `v0.2.2`
- **Uncommitted on local `main` branch (ready to release as v0.2.3)**: Cold-start performance fixes in `electron/main.js`. TypeScript clean. **The release has not been run yet** — user needs to execute the release ritual below.

### Files modified for v0.2.3 (uncommitted)

- `electron/main.js`
  - Added `app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion")` near the top (100–300ms Windows cold-boot win)
  - `waitForServer()` poll cadence: 500ms → 50ms for the first 20 attempts, then 200ms (up to ~500ms latency saved)
  - Added `NEXT_TELEMETRY_DISABLED: "1"` to both dev and prod spawn env (300–800ms saved by skipping Next.js' phone-home)

Expected total cold-start savings: ~1–2 seconds.

---

## 2. Recently completed (most recent first)

| Version | Highlights |
|---|---|
| **v0.2.3 (pending release)** | Cold-start perf: disable Next telemetry, faster server poll, disable Windows occlusion calc |
| **v0.2.2 (on GitHub)** | Label right-click rename/delete bug fix (ref-based outside-click). Mail body lazy-load via `format: "metadata"` + `/api/gmail/message`. SettingsProvider non-blocking (`hasFetched` added). autoUpdater 1-hour debounce |
| **v0.2.1** | Updated `PREFERENCES_TEMPLATE` to user's heading structure incl. name "山﨑晴哉". EmailView header layout fix (no button wrap). Label right-click menu (visual only, had bug — fixed in v0.2.2). Full 5-lang i18n for all newly added strings |
| **v0.2.0** | Learning expansion (compose tracking, contact notes, label notes w/ exclude flag + project context). Multi-select UI w/ action bar. Obsidian folder auto-init |
| **v0.1.9** | AI draft assist in compose modal, backdrop removed |
| **earlier** | OAuth desktop flow, RFC 2047 header encoding, threading via In-Reply-To/References, BYOK setup, distribution via electron-builder, electron-updater integration |

---

## 3. In progress

- **v0.2.3 release**: code is done, awaiting `npm run release` from the user's machine.

---

## 4. Pending (priority order)

| Priority | Task |
|---|---|
| **High** | Run v0.2.3 release (PowerShell ritual below) |
| Medium | Measure actual cold-start delta on a real install (stopwatch v0.2.2 vs v0.2.3) |
| Medium | Investigate whether differential update via blockmap is actually shrinking the update download (verify with electron-updater logs) |
| Low | OpenAI / Gemini provider support (BYOK UI already says "今後対応予定") |
| Low | Mobile long-press label menu (explicitly deferred in v0.2.1) |
| Low | Code-signing certificate (currently unsigned → users hit SmartScreen "詳細情報 → 実行") |

---

## 5. Key decisions made and WHY

### Adopted

- **BYOK (Bring Your Own Key)** — each user supplies their own Claude API key. Reason: avoid Seiya being billed for everyone's usage. The key is stored in `userData/cmail-settings.json` and never sent to the client unmasked.
- **GitHub Releases as distribution channel** — works for private repos via PAT (`GH_TOKEN`), and electron-updater natively understands `latest.yml` + blockmaps for delta downloads.
- **Next.js `output: "standalone"`** — bundles a minimal Node runtime so end users don't need to install Node.js separately.
- **Learning data in user's Obsidian folder** — Seiya already uses Obsidian as a second brain; portability beats a dedicated DB.
- **Mail body lazy-loading with `format: "metadata"` for the list** — the 50-message full fetch was the single biggest startup bottleneck (2–3s). Body now arrives just-in-time on message open.
- **Images load by default in sandboxed iframe** — UX > tracking-pixel privacy. JS is blocked by iframe sandbox anyway, so worst case is a tracking pixel.

### Explicitly rejected

- **Email body machine translation** (i18n covers UI strings only).
- **Auto-regenerate `my-preferences.md`** — manual-only button. Reason: AI cost control.
- **Shortening the 5-second `autoUpdater.checkForUpdatesAndNotify()` delay** — the delay protects the splash→main app transition from being interrupted by an update notification.
- **`disableHardwareAcceleration()`** — would slow UI compositing more than it helps cold boot.
- **Code-signing now** — EV cert is ~$300+/year. Users accept SmartScreen for now.

---

## 6. Traps, gotchas, failed approaches

### React / DOM

- **Global `document.addEventListener("mousedown", close)` closes popups before the inner button's `onClick` fires.** This was the bug in v0.2.1's label right-click menu. `e.stopPropagation()` on the menu div does NOT help — DOM bubbling is bypassed for direct document listeners. Always use the **ref-based outside-click pattern** (`if (ref.current && !ref.current.contains(e.target))`). The account popup in `Sidebar.tsx` is the canonical example.
- **`EmailMessage.body` is now optional** (`body?: string`) because of lazy loading. Any code touching `.body` directly must fall back to `message.snippet || ""` (see `AIReplyPanel.tsx` line ~69).

### i18n

- New components are easy to ship with hardcoded Japanese. Routinely grep for Japanese in JSX after adding a component, and always wire `t()` / `tf()` through `useSettings()`.

### Module structure

- **Circular import between `lib/settings.ts` and `lib/obsidian.ts`** is solved by live bindings — neither file calls the other at module top level. If you add a new top-level call, the cycle breaks.

### Electron / packaging

- `process.cwd()` is **read-only** on packaged NSIS installs (Program Files). Always use `app.getPath("userData")` and propagate via `process.env.CMAIL_USER_DATA_DIR` to the spawned Next.js process.
- `electron-updater` is **only available in packaged builds**. In dev, the `require("electron-updater")` is wrapped in `try { ... } catch {}` to keep dev mode running.
- Always `Remove-Item -Recurse -Force .next` before `npm run release`. Stale `.next` content has shipped to users before.
- Always use `npm version patch --no-git-tag-version`. The git tag is implicitly created by electron-builder when it publishes the GitHub Release — adding our own tag causes collisions.

### Spawning Next.js standalone in prod

- Env vars on the spawn matter. Required: `ELECTRON_RUN_AS_NODE=1`, `NODE_ENV=production`, `HOSTNAME=127.0.0.1`, `PORT=3000`, `NEXT_TELEMETRY_DISABLED=1`, `CMAIL_USER_DATA_DIR=<userData>`, `NEXTAUTH_SECRET=<generated>`.

---

## 7. Release ritual (canonical)

`GH_TOKEN` is already persisted in the user's Windows env vars, so it does not need to be set inline.

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd "E:\Claude Projects\Cmail Project"

Remove-Item -Recurse -Force .next

npm version patch --no-git-tag-version

git add <changed files>
git commit -m "<conventional commit message> (v0.2.X)"
git push

npm run release
```

### v0.2.3 specifically

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd "E:\Claude Projects\Cmail Project"

Remove-Item -Recurse -Force .next

npm version patch --no-git-tag-version

git add electron/main.js package.json
git commit -m "perf: faster cold start (disable Next telemetry, tighter server poll, occlusion off) (v0.2.3)"
git push

npm run release
```

---

## 8. Resume prompt for next session

Paste this at the start of the next session:

> Cmail プロジェクトの作業を再開します。まず `HANDOVER.md` を読んで現状把握してください。続けて、未リリースの v0.2.3（コールド起動高速化）が `electron/main.js` に編集済みでコミット待ちです。もしまだリリースが走っていなければ、HANDOVER の "Release ritual — v0.2.3 specifically" セクションのコマンドをそのまま渡してください。リリース済みなら HANDOVER の "Current version state" と "Recently completed" を更新してから、新しいタスクの指示を待ってください。
