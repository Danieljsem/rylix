// Approved lyrics saved on this PC (a JSON file; later Electron's userData folder).
// Entries are whole lookup results, so a saved song opens instantly and offline.
import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const queryKey = ({ artist, title }) => `${norm(artist)}|${norm(title)}`;

// Stable id per song: the source page when known, otherwise artist + title.
export function entryId(result) {
  const basis = result.source?.url ?? queryKey(result);
  return createHash('sha1').update(basis).digest('hex').slice(0, 16);
}

const summary = ({ id, artist, title, art, artLocal, savedAt, synced, confidence, source, offsetMs }) => ({
  id, artist, title, art: art ?? null, artLocal: Boolean(artLocal), savedAt,
  synced: Boolean(synced?.length), confidence, sourceUrl: source?.url ?? null, offsetMs: offsetMs ?? 0,
});

const COVER_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export function createLibrary({ file }) {
  // Covers are saved next to the library so saved songs look the same offline.
  const coverDir = path.join(path.dirname(file), 'covers');
  const coverPath = (id, type) => path.join(coverDir, `${id}.${COVER_TYPES[type] ?? 'img'}`);
  let entries = null;
  let writing = Promise.resolve();

  async function load() {
    if (entries) return entries;
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      entries = Array.isArray(data.entries) ? data.entries : [];
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('library: cannot read, starting empty:', err.message);
      entries = [];
    }
    return entries;
  }

  // Serialized, atomic writes (temp file + rename) so a crash never leaves half a file.
  function persist() {
    writing = writing.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify({ version: 1, entries }, null, 2), 'utf8');
      await rename(tmp, file);
    });
    return writing;
  }

  return {
    async list() {
      return (await load())
        .slice()
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
        .map(summary);
    },

    async get(id) {
      return (await load()).find((e) => e.id === id) ?? null;
    },

    // `queries` — the searches that led to this song, so the same search hits the library next time.
    // `cover` — { type, body } of the cover image, stored for offline use.
    async save(result, { queries = [], cover = null } = {}) {
      const list = await load();
      const id = entryId(result);
      const existing = list.find((e) => e.id === id);
      const keys = new Set([...(existing?.queryKeys ?? []), queryKey(result), ...queries.map(queryKey)]);
      const entry = {
        ...result,
        id,
        found: true,
        queryKeys: [...keys],
        savedAt: existing?.savedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      delete entry.autoKey;
      delete entry.recAnchor;
      delete entry.fromLibrary;
      if (cover?.body?.length && COVER_TYPES[cover.type]) {
        await mkdir(coverDir, { recursive: true });
        await writeFile(coverPath(id, cover.type), cover.body);
        entry.artLocal = true;
        entry.artType = cover.type;
      } else if (existing?.artLocal) {
        entry.artLocal = true;
        entry.artType = existing.artType;
      }
      if (existing) list[list.indexOf(existing)] = entry;
      else list.push(entry);
      await persist();
      return summary(entry);
    },

    // Small edits on a saved song (currently the timing offset).
    async update(id, { offsetMs }) {
      const entry = (await load()).find((e) => e.id === id);
      if (!entry) return null;
      if (Number.isFinite(offsetMs)) entry.offsetMs = Math.max(-10000, Math.min(10000, Math.round(offsetMs)));
      entry.updatedAt = new Date().toISOString();
      await persist();
      return summary(entry);
    },

    async cover(id) {
      const entry = (await load()).find((e) => e.id === id);
      if (!entry?.artLocal) return null;
      try {
        return { type: entry.artType, body: await readFile(coverPath(id, entry.artType)) };
      } catch {
        return null;
      }
    },

    async remove(id) {
      const list = await load();
      const i = list.findIndex((e) => e.id === id);
      if (i < 0) return false;
      const [entry] = list.splice(i, 1);
      if (entry.artLocal) await rm(coverPath(id, entry.artType), { force: true });
      await persist();
      return true;
    },

    async findByQuery(query) {
      const key = queryKey(query);
      return (await load()).find((e) => e.queryKeys?.includes(key)) ?? null;
    },
  };
}
