export {};

declare global {
  interface Window {
    cmail?: {
      selectFolder: (defaultPath?: string) => Promise<string | null>;
      isElectron: boolean;
    };
  }
}
