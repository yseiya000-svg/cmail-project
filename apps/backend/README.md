# cmail-backend

Next.js API server for the Cmail **iOS** app, deployed to Vercel.

## Why a separate backend?

The Cmail desktop app (`apps/desktop`) embeds its own Next.js server
spawned by Electron — that's fine on a PC. On iPhone there's no way to
embed a long-running Node server, so the iOS app talks to this hosted
API instead.

## Scope (intentionally small)

This backend currently has only `/api/health`. The real Gmail/Claude
endpoints will be ported from `apps/desktop/app/api/*` in phase 3 of
the iOS plan, with the storage layer abstracted so the same code can
serve both desktop (local FS) and mobile (request-header BYOK).

## Local dev

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd "E:\Claude Projects\Cmail Project"
npm run dev:backend
# → http://localhost:3001/api/health
```

The desktop app uses port 3000; backend dev uses port 3001 so both can
run side-by-side without colliding.

## Deploy

Linked to Vercel; pushes to `main` (or whichever branch we set as the
production branch) trigger an automatic deploy. The first-time setup is
documented in `SETUP.md` at the monorepo root.

### Required env vars on Vercel

| Name | Where to get | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 client (Web type) | Different from the desktop "Desktop app" client |
| `GOOGLE_CLIENT_SECRET` | Same as above | |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` or equivalent | Also signs mobile JWTs |
| `NEXTAUTH_URL` | The Vercel deployment URL, e.g. `https://cmail.vercel.app` | |
| `CMAIL_STORAGE_MODE` | Literal: `stateless` | Tells the storage adapter not to touch the FS |
