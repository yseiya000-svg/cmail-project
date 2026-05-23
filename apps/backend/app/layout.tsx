// Minimal layout. The backend serves API routes only — this file exists
// just so Next.js doesn't error on app-router boot.

export const metadata = {
  title: "Cmail Backend",
  description: "Cmail iOS API server (Vercel-hosted).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
