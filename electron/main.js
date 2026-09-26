// Rylix desktop app: runs the local server in-process and shows the UI in its own window.
import { app, BrowserWindow, Menu, desktopCapturer, nativeTheme, session, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ICON = path.join(ROOT, 'build', 'icon.ico');
// Fixed port keeps the page origin (and its saved settings) the same between runs.
const PORT = 47831;

app.setAppUserModelId('cz.rylix.app');
nativeTheme.themeSource = 'dark';

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// .env holds GENIUS_TOKEN / AUDD_TOKEN (never logged).
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch { /* no .env: Genius and recognition stay off */ }

const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadWindowState() {
  try {
    return JSON.parse(readFileSync(stateFile(), 'utf8'));
  } catch {
    return { width: 1440, height: 900 };
  }
}
function saveWindowState(win) {
  try {
    writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch { /* not critical */ }
}

async function startServer() {
  const { createServer } = await import('../src/server.js');
  const { createLibrary } = await import('../src/library/index.js');
  // Development keeps the project library; an installed app keeps it in the user profile.
  const libraryFile = app.isPackaged
    ? path.join(app.getPath('userData'), 'library.json')
    : path.join(ROOT, 'data', 'library.json');
  const server = createServer({ library: createLibrary({ file: libraryFile }) });
  const listen = (port) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
  try {
    return await listen(PORT);
  } catch {
    return listen(0); // port taken (e.g. the old launcher's server) → any free one
  }
}

let win = null;

async function createWindow() {
  const port = await startServer();
  const state = loadWindowState();

  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 420,
    minHeight: 480,
    title: 'Rylix',
    icon: existsSync(ICON) ? ICON : undefined,
    backgroundColor: '#0d0d0f',
    show: false,
    autoHideMenuBar: true,
    // Spotify-like: no white title bar, window buttons drawn over the app's own top bar.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d0d0f', symbolColor: '#e4e4e7', height: 48 },
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveWindowState(win));

  // Links (e.g. the lyrics source) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  // DevTools on Ctrl+Shift+I / F12 (the default menu, which also had zoom shortcuts, is removed).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });

  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // System audio for song recognition: the page asks for display media and gets the
  // PC's output sound (loopback) without a picker; the video track is discarded there.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const [screen] = await desktopCapturer.getSources({ types: ['screen'] });
    callback({ video: screen, audio: 'loopback' });
  });

  // The page may only use the microphone/display permission for that capture.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'clipboard-sanitized-write'].includes(permission));
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
