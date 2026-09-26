// Song recognition from a few seconds of audio (AudD, https://audd.io, needs AUDD_TOKEN).
// Only the audio snippet is sent; the token is never logged or returned.

const API = 'https://api.audd.io/';
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // AudD limit

// "01:23" / "1:02:03" → ms
export function parseTimecode(tc) {
  if (typeof tc !== 'string' || !/^\d+(:\d{1,2}){1,2}$/.test(tc.trim())) return null;
  return tc.trim().split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0) * 1000;
}

export async function recognizeAudd(audio, mime, { token, fetch: fetchImpl = fetch } = {}) {
  if (!token) throw new Error('AUDD_TOKEN is not set');
  const form = new FormData();
  form.append('api_token', token);
  form.append('return', 'spotify');
  form.append('file', new Blob([audio], { type: mime || 'application/octet-stream' }), 'snippet.webm');

  const res = await fetchImpl(API, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`AudD HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'success') {
    throw new Error(`AudD: ${data.error?.error_message ?? 'recognition failed'}`);
  }
  const r = data.result;
  if (!r) return { found: false };
  return {
    found: true,
    artist: r.artist ?? '',
    title: r.title ?? '',
    album: r.album ?? '',
    timecodeMs: parseTimecode(r.timecode),
    durationMs: Number(r.spotify?.duration_ms) || null,
    link: r.song_link ?? null,
  };
}
