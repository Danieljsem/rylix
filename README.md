# Rylix

**Lyrics for what's playing on your PC, written in the Latin alphabet, line by line.**

Rylix is a Windows desktop app (Electron + Node.js) for listening to Russian, Ukrainian and Belarusian music when you can't read Cyrillic. It sees what Windows is currently playing (Spotify, YouTube in a browser, …), finds the lyrics, transliterates them to Latin script **without changing a single line**, and shows them in time with the song in a Spotify-like view.

It does not translate. It only changes the script, so you can read along and sing.

## Features

- **Follows playback.** Reads the current track and position from the Windows media session (the same data shown next to the volume flyout). It does not log into Spotify, use cookies or call unofficial APIs.
- **Synced lyrics.** Time-synced lines from [LRCLIB](https://lrclib.net), karaoke-style highlighting that follows the real player position, and a click on a line jumps there.
- **Faithful transliteration.** Russian (practical BGN/PCGN-based profile), Ukrainian (official KMU 2010) and Belarusian. Sections, line count, order and repeats are always preserved, which is enforced by a validator and tests.
- **Views.** Latin only, Cyrillic big with Latin underneath ("Azbuka"), or side by side ("Duo").
- **Multiple sources, cross-checked.** LRCLIB by default. Genius is optional and adds section labels and a second opinion; lines that differ between sources are highlighted.
- **Song recognition (optional).** For mixes and radio without usable metadata, Rylix can record 8 s of system audio and identify the song via [AudD](https://audd.io).
- **Offline library.** Approved songs are stored locally with lyrics, timing, cover art and offset, and work without internet.
- **Player controls.** Play/pause/next via media keys.

> The UI is currently in Czech. Translations are welcome.

## Requirements

- Windows 10/11 (playback tracking uses the Windows media session via PowerShell)
- Node.js 20 or newer

The lyrics search and the web UI also run on other systems, but without playback tracking.

## Getting started

```bash
npm install
npm test          # offline test suite, no network calls
npm run app       # desktop app (Electron)
# or
npm start         # plain server + browser UI at http://127.0.0.1:3000
```

Optional API tokens go into `.env` (see [`.env.example`](.env.example)):

| Variable       | What it enables |
|----------------|-----------------|
| `GENIUS_TOKEN` | Genius as a second lyrics source (section labels, cross-checking) |
| `AUDD_TOKEN`   | Song recognition from PC audio |

Without any token Rylix works with LRCLIB only.

## How it works

```
now playing (Windows)  ─►  search (LRCLIB, Genius)  ─►  extract + clean  ─►  parse sections / LRC times
        ─►  validate & pick best source  ─►  transliterate 1:1  ─►  validate structure  ─►  UI
```

| Folder            | Responsibility |
|-------------------|----------------|
| `src/nowplaying/` | Current track and position from Windows, media-key control |
| `src/search/`     | Providers (LRCLIB, Genius), Latin→Cyrillic query guessing, title matching |
| `src/extractor/`  | Genius page → plain lyrics, junk-line cleanup |
| `src/parser/`     | Text → sections; LRC → timed lines |
| `src/validator/`  | Source comparison (word-level LCS), confidence, uncertain lines, structure checks |
| `src/romanizer/`  | Transliteration profiles |
| `src/library/`    | Local library of approved songs |
| `src/recognize/`  | AudD song recognition |
| `electron/`       | Desktop shell; the server runs in the main process |
| `public/`         | Plain HTML/CSS/JS UI |

Design notes and the full transliteration spec (in Czech) are in [`docs/design-notes.cs.md`](docs/design-notes.cs.md).

### Transliteration rules (Russian)

Based on BGN/PCGN, simplified to read without diacritics: `ж zh`, `х kh`, `ц ts`, `ч ch`, `ш sh`, `щ shch`, `ю yu`, `я ya`, `ь`/`ъ` → `'`. `е` is `ye` at word start, after vowels and after `ь`/`ъ`; `ё` is `yo` (`o` after `ж ш ч щ ц`). Anything that isn't Cyrillic is copied unchanged.

```
Тёплый ветер над рекой, съезд у дома   →   Tyoplyy veter nad rekoy, s'yezd u doma
```

## Lyrics, copyright and third-party services

- **No lyrics are included in this repository.** Test fixtures are made-up sentences. Your library (`data/`) stays on your PC and is git-ignored.
- Lyrics are copyrighted by their owners. Rylix fetches and displays them for personal use only. Don't redistribute what it shows you.
- **LRCLIB** is a free, open lyrics database with a public API.
- **Genius** (optional): the official Genius API is used to find a song, but it does not return lyrics, so Rylix reads them from the public song page. This may conflict with the [Genius Terms of Service](https://genius.com/static/terms). The feature stays off unless you add your own `GENIUS_TOKEN`, and you are responsible for using it in line with Genius's terms.
- **AudD** (optional) requires your own API token and is subject to AudD's terms.
- Not affiliated with Spotify, Genius, LRCLIB or AudD.

## License

[MIT](LICENSE). The bundled Figtree font is licensed under the [SIL Open Font License](public/fonts/OFL.txt).
