// Shared domain types used across desktop / mobile / backend.
// The canonical source is apps/desktop/types/index.ts (and types/electron.d.ts,
// types/next-auth.d.ts). When the iOS app reaches phase 6 (Inbox), we'll
// migrate EmailMessage / Label / ReplyPattern etc. here and update both apps
// to import from @cmail/shared/types.
//
// Until then, this file is intentionally empty so the package compiles.
export {};
