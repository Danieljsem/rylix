// Knows what the PC is playing right now. Windows only (media session API via
// PowerShell); elsewhere it simply reports { available: false }.
import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { trackQuery } from './clean.js';

const SCRIPT = fileURLToPath(new URL('./windows.ps1', import.meta.url));
const CONTROL_SCRIPT = fileURLToPath(new URL('./control.ps1', import.meta.url));
export const CONTROL_ACTIONS = ['toggle', 'next', 'prev', 'seek'];
const IDLE_STOP_MS = 60_000;

// One JSON line from windows.ps1 → snapshot, or null if the line is not usable.
export function parseLine(line) {
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (!raw || typeof raw.status !== 'string') return null;
  return {
    status: raw.status,
    app: raw.app ?? '',
    artist: raw.artist ?? '',
    title: raw.title ?? '',
    album: raw.album ?? '',
    positionMs: Number(raw.positionMs) || 0,
    durationMs: Number(raw.durationMs) || 0,
    sampledAt: Number(raw.sampledAt) || Date.now(),
    error: raw.error ?? null,
  };
}

// Public view of a snapshot at time `at`: position extrapolated while playing.
export function present(snapshot, at = Date.now()) {
  if (!snapshot || !['Playing', 'Paused', 'Stopped'].includes(snapshot.status) || !snapshot.title) {
    return { available: true, playing: false, track: null };
  }
  const playing = snapshot.status === 'Playing';
  let positionMs = snapshot.positionMs + (playing ? Math.max(0, at - snapshot.sampledAt) : 0);
  if (snapshot.durationMs > 0) positionMs = Math.min(positionMs, snapshot.durationMs);
  return {
    available: true,
    playing,
    track: {
      app: snapshot.app,
      artist: snapshot.artist,
      title: snapshot.title,
      album: snapshot.album,
      durationMs: snapshot.durationMs,
      query: trackQuery(snapshot),
    },
    positionMs: Math.round(positionMs),
  };
}

export function createNowPlaying({ platform = process.platform, spawnImpl = spawn, execImpl = execFile } = {}) {
  let child = null;
  let latest = null;
  let lastAsked = 0;
  let idleTimer = null;
  let restartDelay = 1000;

  function start() {
    if (child) return;
    child = spawnImpl('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      const snap = parseLine(line);
      if (snap) {
        latest = snap;
        restartDelay = 1000;
      }
    });
    child.on('exit', () => {
      child = null;
      // Restart with backoff while someone is still watching.
      if (Date.now() - lastAsked < IDLE_STOP_MS) {
        setTimeout(start, restartDelay);
        restartDelay = Math.min(restartDelay * 2, 30_000);
      }
    });
    child.on('error', () => {});
  }

  function stop() {
    child?.kill();
    child = null;
    latest = null;
  }

  // Watcher runs only while the UI keeps asking; it stops after a minute of silence.
  function touch() {
    lastAsked = Date.now();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, IDLE_STOP_MS);
    idleTimer.unref?.();
    start();
  }

  return {
    get() {
      if (platform !== 'win32') return { available: false };
      touch();
      if (!latest) return { available: true, starting: true, playing: false, track: null };
      return present(latest);
    },
    // Play/pause, next, previous or seek in whatever is playing (media-key equivalent).
    control(action, positionMs = 0) {
      if (platform !== 'win32' || !CONTROL_ACTIONS.includes(action)) return Promise.resolve(false);
      const pos = Math.max(0, Math.round(Number(positionMs) || 0));
      return new Promise((resolve) => {
        execImpl('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', CONTROL_SCRIPT,
          '-Action', action, '-PositionMs', String(pos)], { windowsHide: true, timeout: 8000 },
        (err, stdout) => resolve(!err && String(stdout).trim() === 'true'));
      });
    },
    stop,
  };
}
