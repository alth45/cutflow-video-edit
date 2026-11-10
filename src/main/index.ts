import { app, BrowserWindow } from "electron";
import { createMainWindow } from "./window";
import { registerIpcHandlers } from "./ipc";
import { registerMediaScheme, registerMediaProtocol } from "./media-protocol";
import { join } from "node:path";
registerMediaScheme();

let mainWindow: BrowserWindow | null = null;

function openMainWindow(): void {
  mainWindow = createMainWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerMediaProtocol();
  registerIpcHandlers();

  /* macOS: set dock icon di dev mode (packaged app uses bundle .icns). */
  if (process.platform === "darwin" && !app.isPackaged && app.dock) {
    const dockIcon = join(__dirname, "../../resources/icon.png");
    try {
      app.dock.setIcon(dockIcon);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[cutflow:main] dock icon failed:", err);
    }
  }

  openMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  // nanti: cleanup
});
