const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("desktopRoi", {
  getPrimaryScreen: () => ipcRenderer.invoke("roi:get-primary-screen"),
  waitForModel: () => ipcRenderer.invoke("lada:wait-ready"),
  inferFrame: (rgbPixels, resetHistory) =>
    ipcRenderer.invoke("lada:infer", rgbPixels, resetHistory),
  onActiveChange: (callback) => subscribe("roi:set-active", callback),
  onResize: (callback) => subscribe("roi:resize", callback),
  reportStatus: (status) => ipcRenderer.send("roi:status", status),
});
