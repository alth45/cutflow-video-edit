import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env["ELECTRON_RENDERER_URL"];
const RENDERER_HTML = join(__dirname, "../renderer/index.html");
const PRELOAD_SCRIPT = join(__dirname, "../preload/index.cjs");
//                                                      ^^^^^ .cjs

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0d12",
    title: "CutFlow",
    autoHideMenuBar: true,

    webPreferences: {
      preload: PRELOAD_SCRIPT,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: isDev,

      additionalArguments: [
        `--cutflow-version=${app.getVersion()}`,
        `--cutflow-is-packaged=${String(app.isPackaged)}`,
      ],
    },
  });

  win.once("ready-to-show", () => {
    win.show();
    if (isDev) win.focus();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const isInternalUrl =
      (DEV_SERVER_URL !== undefined && url.startsWith(DEV_SERVER_URL)) ||
      url.startsWith("file://");

    if (!isInternalUrl) {
      event.preventDefault();
      if (url.startsWith("https://") || url.startsWith("http://")) {
        void shell.openExternal(url);
      }
    }
  });

  if (isDev && DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadFile(RENDERER_HTML);
  }

  return win;
}
