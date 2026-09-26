// Approved lyrics saved on this PC (a JSON file; later Electron's userData folder).
// Entries are whole lookup results, so a saved song opens instantly and offline.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const queryKey = ({ artist, title }) => `${norm(artist)}|${norm(title)}`;

// Stable id per song: the source page when known, otherwise artist + title.
export function entryId(result) {
  const basis = result.source?.url ?? queryKey(result);
  return createHash('sha1').update(basis).digest('hex').slice(0, 16);
}

const summary = ({ id, artist, title, art, savedAt, synced, confidence, source }) =>
  ({ id, artist, title, art: art ?? null, savedAt, synced: Boolean(synced?.length), confidence, sourceUrl: source?.url ?? null });

export function createLibrary({ file }) {
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
    async save(result, { queries = [] } = {}) {
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
      if (existing) list[list.indexOf(existing)] = entry;
      else list.push(entry);
      await persist();
      return summary(entry);
    },

    async remove(id) {
      const list = await load();
      const i = list.findIndex((e) => e.id === id);
      if (i < 0) return false;
      list.splice(i, 1);
      await persist();
      return true;
    },

    async findByQuery(query) {
      const key = queryKey(query);
      return (await load()).find((e) => e.queryKeys?.includes(key)) ?? null;
    },
  };
}
