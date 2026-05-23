import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cmail.app",
  appName: "Cmail",
  webDir: "dist",
  ios: {
    // cmail:// URL scheme — used for OAuth callback redirect
    scheme: "cmail",
    contentInset: "always",
  },
  plugins: {
    Browser: {
      // ASWebAuthenticationSession for OAuth
    },
  },
};

export default config;
