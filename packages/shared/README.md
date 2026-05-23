# @cmail/shared

Shared code used by all three apps in this monorepo:

- `cmail-desktop` (apps/desktop) — the Electron + Next.js Windows app
- `cmail-mobile` (apps/mobile) — the Capacitor + Vite iOS app (forthcoming)
- `cmail-backend` (apps/backend) — the Next.js API on Vercel (forthcoming)

## What lives here

| Sub-path | Contents | Migration status |
|---|---|---|
| `@cmail/shared/types` | Domain types: `EmailMessage`, `Label`, `ReplyPattern`, etc. | Empty stub. Source of truth still at `apps/desktop/types/index.ts` until phase 6 of the iOS plan |
| `@cmail/shared/i18n` | Translation tables + `t()` / `tf()` helpers | Empty stub. Source of truth still at `apps/desktop/lib/i18n.ts` until phase 4-5 |
| `@cmail/shared/api-client` | `fetch` wrapper with base-URL switching and auth-token injection | Empty stub. Built up as mobile screens land |

## Why not migrate everything now?

The desktop app is shipped and stable. Moving its files into a shared
package introduces breakage risk for zero immediate benefit — until the
mobile app actually exists and needs to import them. The plan is to
migrate each slice **at the moment the mobile app first needs it**, so
each migration is validated by an actual compile against both apps.
