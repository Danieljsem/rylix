// Tells the page it runs inside the Rylix desktop app (enables system-audio recognition,
// window-control spacing in the top bar). No Node access is exposed.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('rylix', {
  desktop: true,
  platform: process.platform,
});
