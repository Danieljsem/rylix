const $ = (sel) => document.querySelector(sel);

const els = {
  form: $('#search'),
  artist: $('#artist'),
  title: $('#title'),
  go: $('#go'),
  providers: $('#providers'),
  stage: $('#stage'),
  now: $('#now'),
  art: $('#art'),
  artFallback: $('#art-fallback'),
  songTitle: $('#song-title'),
  songArtist: $('#song-artist'),
  badge: $('#badge'),
  segBtns: document.querySelectorAll('.seg-btn'),
  toggleOriginal: $('#toggle-original'),
  toggleSections: $('#toggle-sections'),
  copy: $('#copy'),
  copyOriginal: $('#copy-original'),
  message: $('#message'),
  warnings: $('#warnings'),
  lyrics: $('#lyrics'),
  lyricsInner: $('#lyrics-inner'),
  compare: $('#compare'),
  gridBody: $('#grid-body'),
  resync: $('#resync'),
  info: $('#info'),
  stats: $('#stats'),
  player: $('#player'),
  play: $('#play'),
  seek: $('#seek'),
  time: $('#time'),
  duration: $('#duration'),
  offset: $('#offset'),
  offsetMinus: $('#offset-minus'),
  offsetPlus: $('#offset-plus'),
  toast: $('#toast'),
  recognize: $('#recognize'),
  libList: $('#lib-list'),
  libFilter: $('#lib-filter'),
  libCount: $('#lib-count'),
  libEmpty: $('#lib-empty'),
  sideTitle: $('#side-title'),
  sideArtist: $('#side-artist'),
  approveBox: $('#approve-box'),
  approve: $('#approve'),
  approveNote: $('#approve-note'),
  unsave: $('#unsave'),
  syncBox: $('#sync-box'),
  syncState: $('#sync-state'),
  auto: $('#auto'),
  btnLibrary: $('#btn-library'),
  btnDetails: $('#btn-details'),
  backdrop: $('#backdrop'),
  approveMini: $('#approve-mini'),
  plArt: $('#pl-art'),
  plTitle: $('#pl-title'),
  plArtist: $('#pl-artist'),
  prev: $('#prev'),
  next: $('#next'),
  syncSource: $('#sync-source'),
};

const CONFIDENCE_LABEL = { high: 'Ověřeno', medium: 'Částečně ověřeno', low: 'Neověřeno' };
const REASON_LABEL = {
  'differs between sources': 'Zdroje se v tomto řádku liší',
  'missing in another source': 'Tento řádek jiný zdroj nemá',
};
const PROVIDER_LABEL = { lrclib: 'LRCLIB', genius: 'Genius' };
const LANGUAGE_LABEL = {
  ru: 'Ruština → latinka',
  uk: 'Ukrajinština → latinka',
  be: 'Běloruština → latinka',
  other: 'Bez převodu (není azbuka)',
};
// Results saved before language support have no flag: they were all Russian.
const isRomanized = (data) => data?.romanize !== false;

const store = {
  get(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

const prefs = {
  showOriginal: store.get('showOriginal', false),
  showSections: store.get('showSections', false),
  view: store.get('view', 'lyrics'),
};

let current = null;

// ---------- small helpers ----------

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

let toastTimer;
function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1800);
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(label);
}

const fmtTime = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Same idea as the server's line key: case, ё and punctuation don't matter.
const normalize = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function showMessage(text, kind = '') {
  els.message.textContent = text;
  els.message.className = `message ${kind}`;
  els.message.hidden = !text;
}

// ---------- song color (from the cover, like Spotify) ----------

function setSongColor(h, s) {
  document.body.style.setProperty('--song-h', String(Math.round(h)));
  document.body.style.setProperty('--song-s', `${Math.round(s)}%`);
}

function hashHue(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

// Saturation-weighted average hue of the cover; gray covers stay calm and gray.
function colorFromImage(img) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let x = 0;
  let y = 0;
  let satSum = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0 || l < 0.08 || l > 0.95) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    const rad = (h * 60 * Math.PI) / 180;
    const w = s * s;
    x += Math.cos(rad) * w;
    y += Math.sin(rad) * w;
    satSum += s * w;
    weight += w;
  }
  if (weight < 1) return null;
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const sat = Math.min(48, Math.max(14, (satSum / weight) * 55));
  return { hue, sat };
}

function applyArtAndColor(data) {
  setSongColor(hashHue(`${data.artist} ${data.title}`), 22);
  els.art.hidden = true;
  els.artFallback.hidden = false;
  els.plArt.hidden = true;
  els.plTitle.textContent = data.title;
  els.plArtist.textContent = data.artist;
  if (!data.art) return;

  const img = new Image();
  img.onload = () => {
    if (current !== data) return;
    els.art.src = img.src;
    els.art.hidden = false;
    els.artFallback.hidden = true;
    els.plArt.src = img.src;
    els.plArt.hidden = false;
    try {
      const c = colorFromImage(img);
      // Colorful cover → its hue; black-and-white cover → calm slate gray.
      if (c) setSongColor(c.hue, c.sat);
      else setSongColor(212, 10);
    } catch { /* keep the fallback color */ }
  };
  img.src = `/api/art?u=${encodeURIComponent(data.art)}`;
}

// ---------- search ----------

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const artist = els.artist.value.trim();
  const title = els.title.value.trim();
  if (artist && title) search(artist, title);
});

// Returns the result (or null). `autoKey` ties the result to the track that is playing.
async function search(artist, title, { autoKey = null } = {}) {
  store.set('last', { artist, title });
  lastQuery = { artist, title };
  els.go.disabled = true;
  els.go.classList.add('loading');
  els.lyrics.style.opacity = '0.45';
  showMessage('');

  try {
    const res = await fetch('/api/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist, title }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (!data.found) {
      const failed = data.errors?.map((x) => `${PROVIDER_LABEL[x.provider] ?? x.provider}: ${x.message}`).join(', ');
      showMessage(
        autoKey
          ? `Hraje: ${artist} – ${title}. Text k této skladbě jsem nenašel.`
          : `Text se nepodařilo najít.${failed ? ` Chyby zdrojů: ${failed}.` : ''} `
            + 'Zkus jiný přepis názvu nebo ho napiš azbukou.',
        autoKey ? '' : 'error',
      );
      return null;
    }
    data.autoKey = autoKey;
    render(data);
    return data;
  } catch (err) {
    showMessage(`Chyba: ${err.message}`, 'error');
    return null;
  } finally {
    els.go.disabled = false;
    els.go.classList.remove('loading');
    els.lyrics.style.opacity = '';
  }
}

// ---------- render ----------

function render(data) {
  current = data;
  resetPlayback();

  els.now.hidden = false;
  els.info.hidden = false;
  els.songTitle.textContent = data.title;
  els.songArtist.textContent = data.artist;
  els.badge.textContent = CONFIDENCE_LABEL[data.confidence];
  els.badge.className = `badge ${data.confidence}`;
  els.badge.title = data.alternatives.length
    ? `Porovnáno s: ${data.alternatives.map((a) => `${PROVIDER_LABEL[a.provider] ?? a.provider} (${Math.round(a.agreement * 100)} %)`).join(', ')}`
    : 'Nalezeno jen v jednom zdroji';
  applyArtAndColor(data);
  renderSide(data);

  renderWarnings(data);
  renderLyrics(data);
  renderCompare(data);
  renderStats(data);
  setupPlayer(data);
  setView(prefs.view);
  els.lyrics.scrollTop = 0;
}

// ---------- right sidebar: cover, approve & save, timing ----------

function renderSide(data) {
  els.sideTitle.textContent = data.title;
  els.sideArtist.textContent = `${data.artist} · ${LANGUAGE_LABEL[data.language ?? 'ru'] ?? ''}`;
  els.approveBox.hidden = false;
  els.syncBox.hidden = false;
  els.syncState.textContent = data.synced
    ? `Časování je k dispozici (${data.synced.filter((l) => l.text).length} řádků).`
    : 'Tahle skladba zatím nemá časování.';
  updateApproveState();
}

function savedEntryFor(data) {
  if (!data) return null;
  if (data.fromLibrary && data.id) return library.entries.find((e) => e.id === data.id) ?? { id: data.id };
  return library.entries.find((e) => e.sourceUrl && e.sourceUrl === data.source?.url) ?? null;
}

function updateApproveState() {
  const saved = savedEntryFor(current);
  els.approve.classList.toggle('saved', Boolean(saved));
  els.approve.querySelector('span').textContent = saved ? 'Schváleno a uloženo' : 'Schválit a uložit';
  els.approveNote.textContent = saved
    ? 'Tahle verze je v knihovně. Při dalším hledání se načte odtud.'
    : 'Uloží tuhle verzi textu do knihovny. Příště se načte hned a bez hledání.';
  els.unsave.hidden = !saved;
  els.approveMini.classList.toggle('saved', Boolean(saved));
  els.approveMini.textContent = saved ? '✓ Uloženo' : '✓ Uložit';
  highlightLibrary(saved?.id);
}

els.approveMini.addEventListener('click', () => els.approve.click());
els.approve.addEventListener('click', async () => {
  if (!current || savedEntryFor(current)) return;
  els.approve.disabled = true;
  try {
    const res = await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: current, queries: lastQuery ? [lastQuery] : [] }),
    });
    const saved = await res.json();
    if (!res.ok) throw new Error(saved.error || `HTTP ${res.status}`);
    await loadLibrary();
    toast('Uloženo do knihovny');
  } catch (err) {
    toast(`Uložení selhalo: ${err.message}`);
  } finally {
    els.approve.disabled = false;
    updateApproveState();
  }
});

els.unsave.addEventListener('click', async () => {
  const saved = savedEntryFor(current);
  if (saved) await removeFromLibrary(saved.id);
});

// ---------- left sidebar: library of approved lyrics ----------

const library = { entries: [] };
let lastQuery = null;

async function loadLibrary() {
  try {
    library.entries = (await (await fetch('/api/library')).json()).entries ?? [];
  } catch {
    library.entries = [];
  }
  renderLibrary();
  if (current) updateApproveState();
}

function renderLibrary() {
  const q = els.libFilter.value.trim().toLowerCase();
  const items = library.entries.filter((e) => !q || `${e.artist} ${e.title}`.toLowerCase().includes(q));
  els.libCount.textContent = library.entries.length ? String(library.entries.length) : '';
  els.libEmpty.hidden = library.entries.length > 0;

  els.libList.replaceChildren(...items.map((e) => {
    const li = el('li', { class: 'lib-item', dataset: { id: e.id }, title: `${e.title} — ${e.artist}` });
    const thumb = e.art
      ? el('img', { class: 'lib-thumb', src: `/api/art?u=${encodeURIComponent(e.art)}`, alt: '', loading: 'lazy' })
      : el('div', { class: 'lib-thumb' }, '♪');
    const text = el('div', { class: 'lib-text' });
    const sub = el('div', { class: 'lib-sub' }, e.artist);
    if (e.synced) sub.prepend(el('span', { class: 'synced-dot', title: 'Má časování' }, '● '));
    text.append(el('div', { class: 'lib-title' }, e.title), sub);
    const del = el('button', { class: 'lib-del', type: 'button', 'aria-label': `Odebrat ${e.title}`, title: 'Odebrat z knihovny' }, '×');
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeFromLibrary(e.id);
    });
    li.append(thumb, text, del);
    li.addEventListener('click', () => openFromLibrary(e.id));
    return li;
  }));
  highlightLibrary(savedEntryFor(current)?.id);
}

function highlightLibrary(id) {
  els.libList.querySelectorAll('.lib-item').forEach((li) => li.classList.toggle('active', li.dataset.id === id));
}

async function openFromLibrary(id) {
  try {
    const res = await fetch(`/api/library/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    showMessage('');
    els.artist.value = data.artist;
    els.title.value = data.title;
    render(data);
    closeDrawers();
  } catch (err) {
    toast(`Nepodařilo se otevřít: ${err.message}`);
  }
}

// Removing asks for a second click on the same button instead of a dialog.
let pendingRemove = null;
async function removeFromLibrary(id) {
  if (pendingRemove !== id) {
    pendingRemove = id;
    toast('Klikni znovu pro odebrání z knihovny');
    setTimeout(() => { if (pendingRemove === id) pendingRemove = null; }, 3000);
    return;
  }
  pendingRemove = null;
  await fetch(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (current?.fromLibrary && current.id === id) current.fromLibrary = false;
  await loadLibrary();
  toast('Odebráno z knihovny');
}

els.libFilter.addEventListener('input', renderLibrary);

function renderWarnings(data) {
  const out = [];
  if (!data.valid) {
    const box = el('div', { class: 'bad' }, 'Kontrola struktury neprošla. Výstup nemusí odpovídat originálu:');
    const ul = el('ul');
    data.validationErrors.forEach((e) => ul.append(el('li', {}, e)));
    box.append(ul);
    out.push(box);
  }
  if (data.errors?.length) {
    const names = data.errors.map((x) => PROVIDER_LABEL[x.provider] ?? x.provider).join(', ');
    out.push(el('div', {}, `Nedostupný zdroj: ${names}. Výsledek je jen z ostatních.`));
  }
  els.warnings.replaceChildren(...out);
}

function lineNode(romanized, original, extraClass = '') {
  const p = el('p', { class: `line ${extraClass}`.trim() });
  p.append(el('span', { class: 'r' }, romanized || '♪'));
  if (original) p.append(el('span', { class: 'orig' }, original));
  if (!romanized) p.classList.add('gap-mark');
  return p;
}

function renderLyrics(data) {
  const frag = document.createDocumentFragment();

  if (data.synced) {
    // Time-synced lines (LRCLIB). Uncertain marks are carried over by matching text.
    const uncertain = new Map(data.uncertain.map((u) => [normalize(u.text), u]));
    data.synced.forEach((line, i) => {
      const node = lineNode(line.romanized, isRomanized(data) ? line.text : null);
      node.dataset.i = String(i);
      const u = line.text && uncertain.get(normalize(line.text));
      if (u) markUncertain(node, u);
      node.addEventListener('click', () => {
        const ms = line.timeMs + playback.offset;
        seekTo(ms, { follow: true });
        if (playback.external) mediaControl('seek', ms);
      });
      frag.append(node);
    });
  } else {
    const uncertain = new Map(data.uncertain.map((u) => [`${u.section}:${u.line}`, u]));
    data.original.sections.forEach((section, si) => {
      const rSection = data.romanized.sections[si];
      if (section.lines.length === 0 && section.name === null) return;
      if (si > 0) frag.append(el('div', { class: 'section-gap' }));
      if (section.name !== null) frag.append(el('div', { class: 'section-label' }, rSection.name));
      section.lines.forEach((line, li) => {
        const node = lineNode(rSection.lines[li], isRomanized(data) ? line : null);
        const u = uncertain.get(`${si}:${li}`);
        if (u) markUncertain(node, u);
        frag.append(node);
      });
    });
  }

  els.lyricsInner.replaceChildren(frag);
  els.lyrics.classList.toggle('synced', Boolean(data.synced));
  applyToggles();
}

function markUncertain(node, u) {
  node.classList.add('uncertain');
  node.querySelector('.r').title = `${REASON_LABEL[u.reason] ?? u.reason}`
    + (u.variants.length ? `\nJiný zdroj: ${u.variants.join(' / ')}` : '');
}

function renderCompare(data) {
  const uncertain = new Map(data.uncertain.map((u) => [`${u.section}:${u.line}`, u]));
  const frag = document.createDocumentFragment();
  data.original.sections.forEach((section, si) => {
    const rSection = data.romanized.sections[si];
    if (si > 0) frag.append(el('div', { class: 'cell orig gap' }), el('div', { class: 'cell rom gap' }));
    if (section.name !== null) {
      frag.append(
        el('div', { class: 'cell orig section' }, `[${section.name}]`),
        el('div', { class: 'cell rom section' }, `[${rSection.name}]`),
      );
    }
    section.lines.forEach((line, li) => {
      const u = uncertain.get(`${si}:${li}`);
      const cls = u ? ' uncertain' : '';
      const o = el('div', { class: `cell orig${cls}` }, line);
      const r = el('div', { class: `cell rom${cls}` }, rSection.lines[li]);
      if (u) {
        const tip = `${REASON_LABEL[u.reason] ?? u.reason}` + (u.variants.length ? `\nJiný zdroj: ${u.variants.join(' / ')}` : '');
        o.title = tip;
        r.title = tip;
      }
      frag.append(o, r);
    });
  });
  els.gridBody.replaceChildren(frag);
}

function renderStats(data) {
  const src = data.source;
  const rows = [
    ['Zdroj textu', () => el('a', { href: src.url, target: '_blank', rel: 'noopener' }, PROVIDER_LABEL[src.provider] ?? src.provider)],
    ['Jazyk', LANGUAGE_LABEL[data.language ?? 'ru'] ?? data.language],
    ['Důvěryhodnost', CONFIDENCE_LABEL[data.confidence]],
    ['Ověřeno proti', data.alternatives.length
      ? data.alternatives.map((a) => `${PROVIDER_LABEL[a.provider] ?? a.provider} (${Math.round(a.agreement * 100)} % shoda)`).join(', ')
      : 'jen jeden zdroj'],
    ['Originální řádky', data.stats.originalLines],
    ['Romanizované řádky', data.stats.romanizedLines],
    ['Kontrola 1:1', data.valid ? 'v pořádku' : 'NEPROŠLA'],
    ['Neověřené řádky', data.uncertain.length],
    ['Časování', data.synced ? `${data.synced.filter((l) => l.text).length} řádků (LRCLIB)` : 'není k dispozici'],
  ];
  if (data.rejected?.length) {
    rows.push(['Nepoužito (jiná skladba)', data.rejected.map((r) => `${PROVIDER_LABEL[r.provider] ?? r.provider}: ${r.title}`).join(', ')]);
  }
  const frag = document.createDocumentFragment();
  for (const [label, value] of rows) {
    const wrap = el('div');
    const dd = el('dd');
    if (typeof value === 'function') dd.append(value());
    else dd.textContent = String(value);
    wrap.append(el('dt', {}, label), dd);
    frag.append(wrap);
  }
  els.stats.replaceChildren(frag);
}

// ---------- toggles & views ----------

function applyToggles() {
  els.lyrics.classList.toggle('show-original', prefs.showOriginal);
  els.lyrics.classList.toggle('show-sections', prefs.showSections);
  els.toggleOriginal.setAttribute('aria-pressed', String(prefs.showOriginal));
  els.toggleSections.setAttribute('aria-pressed', String(prefs.showSections));
  const synced = Boolean(current?.synced);
  const romanized = isRomanized(current);
  els.toggleOriginal.disabled = !romanized;
  els.toggleOriginal.title = romanized ? 'Zobrazit azbuku pod řádky' : 'Text není v azbuce, převod není potřeba';
  els.segBtns.forEach((b) => { if (b.dataset.view === 'compare') b.disabled = !romanized; });
  els.copy.textContent = romanized ? 'Kopírovat' : 'Kopírovat text';
  els.toggleSections.disabled = synced;
  els.toggleSections.title = synced
    ? 'Časovaný text nemá sekce (jsou v Porovnání)'
    : 'Zobrazit názvy sekcí';
}

els.toggleOriginal.addEventListener('click', () => {
  prefs.showOriginal = !prefs.showOriginal;
  store.set('showOriginal', prefs.showOriginal);
  applyToggles();
  if (playback.active >= 0) followActive(true);
});
els.toggleSections.addEventListener('click', () => {
  prefs.showSections = !prefs.showSections;
  store.set('showSections', prefs.showSections);
  applyToggles();
});

function setView(view) {
  // Nothing to compare for lyrics that are not romanized; keep the saved preference.
  if (view === 'compare' && !isRomanized(current)) view = 'lyrics';
  else store.set('view', view);
  prefs.view = view;
  els.segBtns.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  els.lyrics.hidden = view !== 'lyrics';
  els.compare.hidden = view !== 'compare';
  const showPlayer = view === 'lyrics' && Boolean(current?.synced);
  els.player.hidden = !showPlayer;
  document.body.classList.toggle('no-player', !showPlayer);
  if (!showPlayer) pause();
}
els.segBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

els.copy.addEventListener('click', () => current
  && copyText(current.text.romanized, isRomanized(current) ? 'Latinka zkopírována' : 'Text zkopírován'));
els.copyOriginal.addEventListener('click', () => current && copyText(current.text.original, 'Originál zkopírován'));

// ---------- time-synced playback ----------

const playback = {
  playing: false,
  startedAt: 0, // performance.now() when (re)started
  position: 0, // ms at startedAt / while paused
  offset: 0, // user correction: + delays the text
  active: -1,
  follow: true,
  raf: 0,
  end: 0,
};

const now = () => (playback.playing ? playback.position + (performance.now() - playback.startedAt) : playback.position);

// A line lights up slightly before its timestamp, so the eye is there when it is sung.
const LEAD_MS = 250;

// The ±0.5 s correction is remembered per song (LRCLIB timing can belong to another edit).
const offsetKey = (data) => data?.source?.url ?? `${data?.artist}|${data?.title}`;
const savedOffsets = () => store.get('offsets', {});

function setupPlayer(data) {
  setExternal(false);
  playback.offset = savedOffsets()[offsetKey(data)] ?? 0;
  if (!data.synced) return;
  playback.end = data.synced.at(-1).timeMs + 6000;
  els.seek.max = String(playback.end);
  els.duration.textContent = fmtTime(playback.end);
  updateOffsetLabel();
  update(0);
}

function resetPlayback() {
  pause();
  playback.position = 0;
  playback.active = -1;
  playback.follow = true;
  els.resync.hidden = true;
}

function play() {
  if (!current?.synced) return;
  if (now() >= playback.end) playback.position = 0;
  playback.playing = true;
  playback.startedAt = performance.now();
  els.play.classList.add('playing');
  els.play.setAttribute('aria-label', 'Pozastavit');
  cancelAnimationFrame(playback.raf);
  playback.raf = requestAnimationFrame(tick);
}

function pause() {
  if (playback.playing) playback.position = now();
  playback.playing = false;
  cancelAnimationFrame(playback.raf);
  els.play.classList.remove('playing');
  els.play.setAttribute('aria-label', 'Přehrát');
}

function tick() {
  const t = now();
  if (t >= playback.end) {
    playback.position = playback.end;
    pause();
    update(playback.end);
    return;
  }
  update(t);
  playback.raf = requestAnimationFrame(tick);
}

function seekTo(ms, { follow = false } = {}) {
  playback.position = Math.max(0, Math.min(ms, playback.end));
  playback.startedAt = performance.now();
  if (follow) setFollow(true);
  playback.active = -2; // force re-highlight
  update(playback.position);
}

function update(t) {
  els.time.textContent = fmtTime(t);
  els.seek.value = String(t);
  els.seek.style.setProperty('--pct', `${playback.end ? (t / playback.end) * 100 : 0}%`);

  const lines = current?.synced ?? [];
  let idx = -1;
  for (let i = 0; i < lines.length && lines[i].timeMs + playback.offset <= t + LEAD_MS; i++) idx = i;
  if (idx === playback.active) return;
  playback.active = idx;

  const nodes = els.lyricsInner.children;
  for (let i = 0; i < nodes.length; i++) nodes[i].classList.toggle('active', i === idx);
  followActive();
}

function followActive(instant = false) {
  if (!playback.follow || playback.active < 0) return;
  const node = els.lyricsInner.children[playback.active];
  if (!node) return;
  const top = node.offsetTop - els.lyrics.clientHeight * 0.33;
  els.lyrics.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' });
}

function setFollow(on) {
  playback.follow = on;
  els.resync.hidden = on || !current?.synced;
  if (on) followActive();
}

// Manual scrolling pauses auto-follow (like Spotify); "Synchronizovat" brings it back.
for (const type of ['wheel', 'touchmove']) {
  els.lyrics.addEventListener(type, () => {
    if (playback.playing && playback.follow) setFollow(false);
  }, { passive: true });
}
els.resync.addEventListener('click', () => setFollow(true));

// When synced with Spotify & co., the buttons control that player (like media keys).
async function mediaControl(action, positionMs) {
  const rec = current?.recAnchor;
  if (action === 'seek' && rec) positionMs = rec.videoPos0 + (positionMs - rec.songPos0);
  try {
    const res = await fetch('/api/now-playing/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, positionMs }),
    });
    const { ok } = await res.json();
    if (!ok && action === 'seek') toast('Přehrávač nepodporuje přetáčení');
    return ok;
  } catch {
    return false;
  }
}

els.play.addEventListener('click', () => {
  if (playback.external) {
    // Optimistic: flip the icon now, the next poll confirms the real state.
    if (playback.playing) pause(); else play();
    mediaControl('toggle');
  } else if (playback.playing) {
    pause();
  } else {
    play();
  }
});
els.prev.addEventListener('click', () => mediaControl('prev'));
els.next.addEventListener('click', () => mediaControl('next'));

let seekDebounce = 0;
els.seek.addEventListener('input', () => {
  const ms = Number(els.seek.value);
  seekTo(ms, { follow: true });
  if (playback.external) {
    clearTimeout(seekDebounce);
    seekDebounce = setTimeout(() => mediaControl('seek', ms), 250);
  }
});

function updateOffsetLabel() {
  const s = playback.offset / 1000;
  els.offset.textContent = `${s > 0 ? '+' : ''}${s.toFixed(1).replace('.', ',')} s`;
}
function shiftOffset(ms) {
  playback.offset = Math.max(-10000, Math.min(10000, playback.offset + ms));
  const offsets = savedOffsets();
  if (playback.offset === 0) delete offsets[offsetKey(current)];
  else offsets[offsetKey(current)] = playback.offset;
  store.set('offsets', offsets);
  updateOffsetLabel();
  playback.active = -2;
  update(now());
}
els.offsetMinus.addEventListener('click', () => shiftOffset(-500));
els.offsetPlus.addEventListener('click', () => shiftOffset(500));

document.addEventListener('keydown', (e) => {
  if (!current?.synced || els.player.hidden) return;
  // Typing in the search, or Space on a focused button (it clicks natively).
  if (e.target.closest('input, textarea, button, summary')) return;
  const jump = (delta) => {
    const ms = Math.max(0, now() + delta);
    seekTo(ms, { follow: true });
    if (playback.external) mediaControl('seek', ms);
  };
  if (e.code === 'Space') {
    e.preventDefault();
    els.play.click();
  } else if (e.code === 'ArrowLeft') {
    jump(-5000);
  } else if (e.code === 'ArrowRight') {
    jump(5000);
  }
});

// ---------- follow what the PC is playing (Windows media session) ----------

const APP_LABEL = [[/spotify/i, 'Spotify'], [/chrome/i, 'Chrome'], [/msedge|edge/i, 'Edge'], [/firefox/i, 'Firefox'],
  [/brave/i, 'Brave'], [/opera/i, 'Opera'], [/music|zune/i, 'Hudba']];
const appLabel = (app) => APP_LABEL.find(([re]) => re.test(app))?.[1] ?? 'přehrávač';

const auto = { on: false, timer: 0, key: null, busy: false };

function setAuto(on) {
  auto.on = on;
  store.set('auto', on);
  els.auto.setAttribute('aria-pressed', String(on));
  clearTimeout(auto.timer);
  if (on) {
    auto.key = null;
    pollNowPlaying();
  } else {
    setExternal(false);
  }
}
els.auto.addEventListener('click', () => setAuto(!auto.on));

async function pollNowPlaying() {
  if (!auto.on) return;
  try {
    const np = await (await fetch('/api/now-playing')).json();
    if (!np.available) {
      setAuto(false);
      toast('Sledování přehrávání funguje jen ve Windows');
      return;
    }
    await onNowPlaying(np);
  } catch { /* server restarting — try again */ }
  auto.timer = setTimeout(pollNowPlaying, document.hidden ? 3000 : playback.external ? 500 : 1000);
}

async function onNowPlaying(np) {
  const track = np.track;
  if (!track?.query) return;
  const key = `${track.app}|${track.artist}|${track.title}`;

  if (key !== auto.key && !auto.busy) {
    auto.key = key;
    auto.busy = true;
    setExternal(false);
    els.artist.value = track.query.artist;
    els.title.value = track.query.title;
    let found = null;
    try {
      found = await search(track.query.artist, track.query.title, { autoKey: key });
    } finally {
      auto.busy = false;
    }
    // A mix, radio or unnamed upload: listen to the sound instead.
    if (!found && np.playing && recognition.available) recognizeNow({ auto: true });
    return;
  }

  // The loaded lyrics belong to the playing track → follow the real position.
  if (current?.autoKey === key && current.synced && prefs.view === 'lyrics') {
    const rec = current.recAnchor;
    // Recognized song inside a longer video: song position follows the video's position.
    const songPos = rec ? rec.songPos0 + (np.positionMs - rec.videoPos0) : np.positionMs;
    setExternal(true, rec ? `${appLabel(track.app)} (rozpoznáno)` : appLabel(track.app));
    const duration = rec ? rec.durationMs : track.durationMs;
    if (duration > 0) {
      playback.end = Math.max(duration, current.synced.at(-1).timeMs + 1000);
      els.seek.max = String(playback.end);
      els.duration.textContent = fmtTime(playback.end);
    }
    // The recognized song is over (or the user skipped within the mix) → who plays now?
    if (rec && np.playing && (songPos < -3000 || (rec.durationMs && songPos > rec.durationMs + 1500))) {
      recognizeNow({ auto: true });
      return;
    }
    const drift = Math.abs(now() - songPos);
    // Re-anchor on every update that is off by more than a few frames; tiny steps are invisible.
    if (drift > 60 || np.playing !== playback.playing) {
      playback.position = songPos;
      playback.startedAt = performance.now();
      playback.active = -2;
    }
    if (np.playing && !playback.playing) play();
    else if (!np.playing && playback.playing) pause();
    if (!np.playing) update(songPos);
  }
}

// ---------- song recognition from the PC's sound (desktop app + AudD) ----------

const recognition = { available: false, busy: false, lastAt: 0 };
const RECORD_MS = 8000;

async function captureSystemAudio(ms) {
  // In the desktop app this returns the PC's output sound (loopback) without a picker.
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  stream.getVideoTracks().forEach((t) => t.stop());
  const tracks = stream.getAudioTracks();
  if (tracks.length === 0) throw new Error('Nepodařilo se zachytit zvuk počítače');
  const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.start();
  await new Promise((r) => setTimeout(r, ms));
  await new Promise((r) => { recorder.onstop = r; recorder.stop(); });
  stream.getTracks().forEach((t) => t.stop());
  return new Blob(chunks, { type: 'audio/webm' });
}

async function recognizeNow({ auto: isAuto = false } = {}) {
  if (!recognition.available || recognition.busy) return;
  // Auto mode: at most one try per 20 s (free requests are limited).
  if (isAuto && Date.now() - recognition.lastAt < 20000) return;
  recognition.busy = true;
  recognition.lastAt = Date.now();
  els.recognize.classList.add('listening');
  toast('Poslouchám, co hraje…');
  try {
    // Where the player is when recording starts (maps song time ↔ video time later).
    const before = await (await fetch('/api/now-playing')).json().catch(() => null);
    const key = before?.track ? `${before.track.app}|${before.track.artist}|${before.track.title}` : null;
    const videoPos0 = before?.positionMs ?? 0;

    const audio = await captureSystemAudio(RECORD_MS);
    const res = await fetch('/api/recognize', { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: audio });
    const hit = await res.json();
    if (!res.ok) throw new Error(hit.error || `HTTP ${res.status}`);
    if (!hit.found) {
      toast('Písničku se nepodařilo rozpoznat');
      return;
    }
    els.artist.value = hit.artist;
    els.title.value = hit.title;
    const data = await search(hit.artist, hit.title, { autoKey: key });
    if (!data) {
      showMessage(`Hraje: ${hit.artist} – ${hit.title} (rozpoznáno). Text k ní jsem nenašel.`);
      return;
    }
    toast(`Rozpoznáno: ${hit.artist} – ${hit.title}`);
    if (hit.timecodeMs != null) {
      data.recAnchor = { videoPos0, songPos0: hit.timecodeMs, durationMs: hit.durationMs };
      // No media session (e.g. a game or stream): run on our own clock from the recording.
      if (!key && data.synced) {
        seekTo(hit.timecodeMs + RECORD_MS);
        play();
      }
    }
  } catch (err) {
    toast(`Rozpoznání selhalo: ${err.message}`);
  } finally {
    recognition.busy = false;
    els.recognize.classList.remove('listening');
  }
}

function setExternal(on, label = '') {
  playback.external = on;
  els.player.classList.toggle('external', on);
  els.prev.hidden = !on;
  els.next.hidden = !on;
  els.play.title = on ? `Ovládá ${label}` : '';
  els.syncSource.hidden = !on;
  els.syncSource.textContent = on ? `● Synchronizováno: ${label}` : '';
}

// ---------- layout: panels like Spotify (wide = both visible, medium = rail + drawer, narrow = drawers) ----------

const layout = {
  libCollapsed: store.get('libCollapsed', false),
  detailsHidden: store.get('detailsHidden', false),
};
// Layout decisions use the width the app really has at the current scale.
const layoutMode = () => {
  const w = innerWidth / appZoom;
  return w >= 1200 ? 'wide' : w >= 860 ? 'medium' : 'narrow';
};

function applyLayout() {
  const mode = layoutMode();
  const body = document.body;
  if (body.dataset.mode !== mode) closeDrawers();
  body.dataset.mode = mode;
  const wide = mode === 'wide';
  body.classList.toggle('lib-collapsed', wide && layout.libCollapsed);
  body.classList.toggle('details-hidden', wide && layout.detailsHidden);
  els.btnLibrary.setAttribute('aria-pressed', String(wide ? !layout.libCollapsed : body.classList.contains('lib-open')));
  els.btnDetails.setAttribute('aria-pressed', String(wide ? !layout.detailsHidden : body.classList.contains('details-open')));
}

function closeDrawers() {
  document.body.classList.remove('lib-open', 'details-open');
}

els.btnLibrary.addEventListener('click', () => {
  if (layoutMode() === 'wide') {
    layout.libCollapsed = !layout.libCollapsed;
    store.set('libCollapsed', layout.libCollapsed);
  } else {
    const open = !document.body.classList.contains('lib-open');
    closeDrawers();
    document.body.classList.toggle('lib-open', open);
  }
  applyLayout();
});
els.btnDetails.addEventListener('click', () => {
  if (layoutMode() === 'wide') {
    layout.detailsHidden = !layout.detailsHidden;
    store.set('detailsHidden', layout.detailsHidden);
  } else {
    const open = !document.body.classList.contains('details-open');
    closeDrawers();
    document.body.classList.toggle('details-open', open);
  }
  applyLayout();
});
els.backdrop.addEventListener('click', () => { closeDrawers(); applyLayout(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeDrawers(); applyLayout(); }
});
addEventListener('resize', applyLayout);

// ---------- app scale (zoom), remembered; auto-picked on small effective screens ----------

const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
let appZoom = 1;

// E.g. 2560×1440 at 200 % Windows scaling = 1280 px of room: pick a smaller scale so all panels fit.
function autoZoom() {
  const fit = innerWidth / 1500;
  if (fit >= 1) return 1;
  return [...ZOOM_STEPS].reverse().find((z) => z <= fit) ?? ZOOM_STEPS[0];
}

function applyZoom(z, { remember = false } = {}) {
  appZoom = z;
  document.documentElement.style.zoom = String(z);
  document.documentElement.style.setProperty('--zoom', String(z));
  $('#zoom-val').textContent = `${Math.round(z * 100)} %`;
  if (remember) store.set('zoom', z);
  applyLayout();
}

function stepZoom(dir) {
  const i = ZOOM_STEPS.findIndex((z) => Math.abs(z - appZoom) < 0.001);
  const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, (i < 0 ? 4 : i) + dir))];
  applyZoom(next, { remember: true });
  toast(`Měřítko ${Math.round(next * 100)} %`);
}

$('#zoom-out').addEventListener('click', () => stepZoom(-1));
$('#zoom-in').addEventListener('click', () => stepZoom(1));
$('#zoom-val').addEventListener('click', () => { applyZoom(1, { remember: true }); toast('Měřítko 100 %'); });
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); stepZoom(1); }
  else if (e.key === '-') { e.preventDefault(); stepZoom(-1); }
  else if (e.key === '0') { e.preventDefault(); applyZoom(1, { remember: true }); }
});

// ---------- init ----------

const last = store.get('last');
if (last) {
  els.artist.value = last.artist ?? '';
  els.title.value = last.title ?? '';
}
document.body.classList.add('no-player');
applyToggles();
setAuto(store.get('auto', true));
applyZoom(store.get('zoom', null) ?? autoZoom());
loadLibrary();

if (window.rylix?.desktop) document.body.classList.add('desktop');
els.recognize.addEventListener('click', () => recognizeNow());

fetch('/api/status')
  .then((r) => r.json())
  .then((s) => {
    recognition.available = Boolean(window.rylix?.desktop && s.recognition);
    els.recognize.hidden = !recognition.available;
    els.providers.textContent = s.genius ? 'LRCLIB + Genius' : 'jen LRCLIB (chybí Genius token)';
  })
  .catch(() => {});
