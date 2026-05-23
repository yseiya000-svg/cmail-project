const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cmail", {
  /**
   * Open a folder selection dialog. Returns the chosen path or null if cancelled.
   * @param {string} [defaultPath]
   * @returns {Promise<string | null>}
   */
  selectFolder: (defaultPath) => ipcRenderer.invoke("cmail:select-folder", defaultPath),
  isElectron: true,
});
