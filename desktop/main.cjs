/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell, session } = require("electron");
const path = require("node:path");

const localAppUrl = "http://localhost:3000";
const cloudAppUrl = "https://department-task-site-321068-12-1497056853.sh.run.tcloudbase.com";

function isAllowedAppUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function createWindow() {
  const appUrl = process.env.DESKTOP_APP_URL || (app.isPackaged ? cloudAppUrl : localAppUrl);
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppUrl(url)) {
      void window.loadURL(url);
    } else {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  void window.loadURL(appUrl);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
