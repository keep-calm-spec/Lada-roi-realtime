const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  net,
  protocol,
  screen,
} = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { LadaWorker } = require("./lada-worker.cjs");

const APP_SCHEME = "demask";
const TOGGLE_SHORTCUT = "CommandOrControl+R";
const QUIT_SHORTCUT = "CommandOrControl+Q";
const GROW_SHORTCUT = "CommandOrControl+=";
const SHRINK_SHORTCUT = "CommandOrControl+-";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

let overlayWindow = null;
let overlayActive = true;
let ladaWorker = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function registerAssetProtocol() {
  const appRoot = path.resolve(app.getAppPath());

  protocol.handle(APP_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.host !== "bundle") {
      return new Response("Not found", { status: 404 });
    }

    const pathname = decodeURIComponent(requestUrl.pathname);
    const filePath = path.resolve(appRoot, `.${pathname}`);
    const relativePath = path.relative(appRoot, filePath);
    const isUnsafe =
      relativePath.startsWith("..") || path.isAbsolute(relativePath);

    if (isUnsafe) {
      return new Response("Forbidden", { status: 403 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

async function getPrimaryScreenSource() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: false,
  });

  const source =
    sources.find(
      (candidate) => candidate.display_id === String(primaryDisplay.id),
    ) ?? sources[0];

  if (!source) {
    throw new Error("No capturable display was found");
  }

  return {
    id: source.id,
    displayId: source.display_id,
    width: primaryDisplay.size.width,
    height: primaryDisplay.size.height,
    scaleFactor: primaryDisplay.scaleFactor,
  };
}

function syncOverlayBounds() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setBounds(screen.getPrimaryDisplay().bounds, false);
}

function setOverlayActive(active) {
  overlayActive = active;
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  overlayWindow.webContents.send("roi:set-active", overlayActive);
  if (overlayActive) {
    syncOverlayBounds();
    overlayWindow.showInactive();
    overlayWindow.moveTop();
  } else {
    overlayWindow.hide();
  }
}

function createOverlayWindow() {
  const bounds = screen.getPrimaryDisplay().bounds;
  overlayWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setContentProtection(true);
  overlayWindow.setMenuBarVisibility(false);

  overlayWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  overlayWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!navigationUrl.startsWith(`${APP_SCHEME}://bundle/`)) {
      event.preventDefault();
    }
  });

  overlayWindow.once("ready-to-show", () => {
    setOverlayActive(true);
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  overlayWindow.loadURL(`${APP_SCHEME}://bundle/desktop/index.html`);
}

function registerShortcuts() {
  globalShortcut.register(TOGGLE_SHORTCUT, () => {
    setOverlayActive(!overlayActive);
  });
  globalShortcut.register(QUIT_SHORTCUT, () => app.quit());
  globalShortcut.register(GROW_SHORTCUT, () => {
    overlayWindow?.webContents.send("roi:resize", 32);
  });
  globalShortcut.register(SHRINK_SHORTCUT, () => {
    overlayWindow?.webContents.send("roi:resize", -32);
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("local.demask.roi");
  registerAssetProtocol();

  ladaWorker = new LadaWorker({ app });
  ladaWorker.start().catch((error) => {
    console.error(`[Demask ROI] Lada startup failed: ${error.message}`);
  });

  ipcMain.handle("roi:get-primary-screen", getPrimaryScreenSource);
  ipcMain.handle("lada:wait-ready", () => ladaWorker.waitUntilReady());
  ipcMain.handle("lada:infer", (_event, rgbPixels, resetHistory) =>
    ladaWorker.infer(rgbPixels, resetHistory),
  );
  ipcMain.on("roi:status", (_event, status) => {
    if (status?.state === "error") {
      console.error(`[Demask ROI] ${status.message}`);
    } else if (status?.message) {
      console.log(`[Demask ROI] ${status.message}`);
    }
  });

  createOverlayWindow();
  registerShortcuts();

  screen.on("display-metrics-changed", syncOverlayBounds);
  screen.on("display-added", syncOverlayBounds);
  screen.on("display-removed", syncOverlayBounds);
});

app.on("second-instance", () => setOverlayActive(true));
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  ladaWorker?.stop();
});
app.on("window-all-closed", () => app.quit());
