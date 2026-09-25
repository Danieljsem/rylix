const $ = (sel) => document.querySelector(sel);

const els = {
  form: $('#search'),
  artist: $('#artist'),
  title: $('#title'),
  go: $('#go'),
  message: $('#message'),
  result: $('#result'),
  songTitle: $('#song-title'),
  songArtist: $('#song-artist'),
  warnings: $('#warnings'),
  gridBody: $('#grid-body'),
  romanOnly: $('#view-roman'),
  views: { both: $('#view-both'), roman: $('#view-roman'), synced: $('#view-synced') },
  tabs: document.querySelectorAll('.tab'),
  tabSynced: $('#tab-synced'),
  stats: $('#stats'),
  toast: $('#toast'),
  providers: $('#providers'),
  play: $('#play'),
  seek: $('#seek'),
  time: $('#time'),
  duration: $('#duration'),
  syncedLines: $('#synced-lines'),
};

const CONFIDENCE_LABEL = { high: 'Vysoká', medium: 'Střední', low: 'Nízká' };
const REASON_LABEL = {
  'differs between sources': 'Zdroje se v tomto řádku liší',
  'missing in another source': 'Tento řádek jiný zdroj nemá',
};
const PROVIDER_LABEL = { lrclib: 'LRCLIB', genius: 'Genius' };

let current = null;

// ---------- helpers ----------

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

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};

function showMessage(text, kind = '') {
  els.message.textContent = text;
  els.message.className = `message ${kind}`;
  els.message.hidden = !text;
}

let toastTimer;
function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1800);
}

async function copy(text, label) {
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

// ---------- search ----------

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const artist = els.artist.value.trim();
  const title = els.title.value.trim();
  if (!artist || !title) return;

  store.set('last', JSON.stringify({ artist, title }));
  els.go.disabled = true;
  els.go.classList.add('loading');
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
      els.result.hidden = true;
      const failed = data.errors?.map((x) => `${PROVIDER_LABEL[x.provider] ?? x.provider}: ${x.message}`).join(', ');
      showMessage(
        `Text se nepodařilo najít.${failed ? ` Chyby zdrojů: ${failed}.` : ''} Zkus název napsat azbukou nebo jinak.`,
        'error',
      );
      return;
    }
    render(data);
  } catch (err) {
    els.result.hidden = true;
    showMessage(`Chyba: ${err.message}`, 'error');
  } finally {
    els.go.disabled = false;
    els.go.classList.remove('loading');
  }
});

// ---------- render ----------

function render(data) {
  current = data;
  stopPlayback();
  els.result.hidden = false;
  els.songTitle.textContent = data.title;
  els.songArtist.textContent = data.artist;

  renderWarnings(data);
  renderGrid(data);
  els.romanOnly.textContent = data.text.romanized;
  renderSynced(data);
  renderStats(data);

  const preferred = store.get('view') ?? 'both';
  setView(preferred === 'synced' && !data.synced ? 'both' : preferred);
}

function renderWarnings(data) {
  els.warnings.replaceChildren();
  if (!data.valid) {
    const box = el('div', { class: 'warning bad' }, 'Kontrola struktury neprošla. Výstup nemusí odpovídat originálu:');
    const ul = el('ul');
    data.validationErrors.forEach((e) => ul.append(el('li', {}, e)));
    box.append(ul);
    els.warnings.append(box);
  }
  if (data.uncertain.length > 0) {
    els.warnings.append(el('div', { class: 'warning warn' },
      `${data.uncertain.length} ${plural(data.uncertain.length, 'řádek se', 'řádky se', 'řádků se')} mezi zdroji liší. `
      + 'Jsou zvýrazněné; najetím myší uvidíš variantu z druhého zdroje.'));
  }
  if (data.rejected?.length) {
    const names = data.rejected.map((r) => `${PROVIDER_LABEL[r.provider] ?? r.provider} („${r.title}“)`).join(', ');
    els.warnings.append(el('div', { class: 'warning' },
      `Nepoužito, vypadá jako jiná skladba: ${names}.`));
  }
  if (data.errors?.length) {
    const names = data.errors.map((x) => PROVIDER_LABEL[x.provider] ?? x.provider).join(', ');
    els.warnings.append(el('div', { class: 'warning' }, `Nedostupný zdroj: ${names}. Výsledek je jen z ostatních.`));
  }
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

function renderGrid(data) {
  const uncertain = new Map(data.uncertain.map((u) => [`${u.section}:${u.line}`, u]));
  const frag = document.createDocumentFragment();

  data.original.sections.forEach((section, si) => {
    const rSection = data.romanized.sections[si];
    if (si > 0) {
      frag.append(el('div', { class: 'cell orig gap' }), el('div', { class: 'cell rom gap' }));
    }
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
        const tip = `${REASON_LABEL[u.reason] ?? u.reason}`
          + (u.variants.length ? `\nJiný zdroj: ${u.variants.join(' / ')}` : '');
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
    ['Zdroj', () => {
      const a = el('a', { href: src.url, target: '_blank', rel: 'noopener' }, PROVIDER_LABEL[src.provider] ?? src.provider);
      return a;
    }],
    ['Důvěryhodnost', () => el('span', { class: `badge ${data.confidence}` }, CONFIDENCE_LABEL[data.confidence])],
    ['Originální řádky', data.stats.originalLines],
    ['Romanizované řádky', data.stats.romanizedLines],
    ['Neověřené řádky', data.uncertain.length],
    ['Ověřeno proti', data.alternatives.length
      ? data.alternatives.map((a) => `${PROVIDER_LABEL[a.provider] ?? a.provider} (${Math.round(a.agreement * 100)} % shoda)`).join(', ')
      : 'jen jeden zdroj'],
    ['Časování', data.synced ? `${data.synced.filter((l) => l.text).length} řádků` : 'není k dispozici'],
  ];
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

// ---------- views ----------

function setView(view) {
  for (const [name, node] of Object.entries(els.views)) node.hidden = name !== view;
  els.tabs.forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  store.set('view', view);
  if (view !== 'synced') stopPlayback();
}

els.tabs.forEach((t) => t.addEventListener('click', () => !t.disabled && setView(t.dataset.view)));
$('#copy').addEventListener('click', () => current && copy(current.text.romanized, 'Latinka zkopírována'));
$('#copy-original').addEventListener('click', () => current && copy(current.text.original, 'Originál zkopírován'));

// ---------- synced (karaoke) ----------

let playback = { playing: false, startedAt: 0, offset: 0, raf: 0, active: -1 };

function renderSynced(data) {
  els.tabSynced.disabled = !data.synced;
  els.tabSynced.title = data.synced ? '' : 'K této skladbě nejsou časované texty';
  if (!data.synced) {
    els.syncedLines.replaceChildren();
    return;
  }
  const frag = document.createDocumentFragment();
  data.synced.forEach((line, i) => {
    const row = el('div', { class: 'sline', dataset: { i } });
    row.append(el('div', { class: 'r' }, line.romanized || '♪'), el('div', { class: 'o' }, line.text));
    row.addEventListener('click', () => seekTo(line.timeMs));
    frag.append(row);
  });
  els.syncedLines.replaceChildren(frag);

  const end = data.synced.at(-1).timeMs + 5000;
  els.seek.max = String(end);
  els.duration.textContent = fmtTime(end);
  playback.offset = 0;
  playback.active = -1;
  updateSynced(0);
}

const now = () => (playback.playing ? performance.now() - playback.startedAt + playback.offset : playback.offset);

function tick() {
  const t = now();
  if (t >= Number(els.seek.max)) {
    stopPlayback();
    return;
  }
  updateSynced(t);
  playback.raf = requestAnimationFrame(tick);
}

function updateSynced(t) {
  els.time.textContent = fmtTime(t);
  els.seek.value = String(t);
  const lines = current?.synced ?? [];
  let idx = -1;
  for (let i = 0; i < lines.length && lines[i].timeMs <= t; i++) idx = i;
  if (idx === playback.active) return;
  playback.active = idx;
  els.syncedLines.querySelectorAll('.sline').forEach((row, i) => {
    row.classList.toggle('active', i === idx);
    row.classList.toggle('past', i < idx);
  });
  const row = els.syncedLines.children[Math.max(idx, 0)];
  if (row) {
    const box = els.syncedLines;
    box.scrollTop = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
  }
}

function startPlayback() {
  playback.playing = true;
  playback.startedAt = performance.now();
  els.play.textContent = '❚❚';
  els.play.setAttribute('aria-label', 'Pozastavit');
  playback.raf = requestAnimationFrame(tick);
}

function stopPlayback() {
  if (playback.playing) playback.offset = now();
  playback.playing = false;
  cancelAnimationFrame(playback.raf);
  els.play.textContent = '▶';
  els.play.setAttribute('aria-label', 'Přehrát');
}

function seekTo(ms) {
  playback.offset = ms;
  playback.startedAt = performance.now();
  playback.active = -2;
  updateSynced(ms);
}

els.play.addEventListener('click', () => {
  if (playback.playing) {
    stopPlayback();
  } else {
    if (playback.offset >= Number(els.seek.max)) seekTo(0);
    startPlayback();
  }
});
els.seek.addEventListener('input', () => seekTo(Number(els.seek.value)));
document.addEventListener('keydown', (e) => {
  if (els.views.synced.hidden || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    els.play.click();
  }
});

// ---------- init ----------

try {
  const last = JSON.parse(store.get('last') ?? 'null');
  if (last) {
    els.artist.value = last.artist;
    els.title.value = last.title;
  }
} catch { /* ignore */ }

fetch('/api/status')
  .then((r) => r.json())
  .then((s) => {
    els.providers.textContent = s.genius ? 'Zdroje: LRCLIB + Genius' : 'Zdroje: LRCLIB (Genius token chybí)';
  })
  .catch(() => {});
