import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { SettingsProvider } from "@/contexts/SettingsContext";

export const metadata: Metadata = {
  title: "Cmail",
  description: "Gmail × Claude AI メールクライアント",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <SessionProvider>
          <SettingsProvider>{children}</SettingsProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
