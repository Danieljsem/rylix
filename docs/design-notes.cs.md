# Rylix — Lyrics Romanizer

Aplikace, která k zadanému interpretovi a názvu skladby najde originální ruský text (azbuka),
vyčistí ho, zachová přesnou strukturu (sekce, řádky, opakování) a převede ho do latinky.
Nepřekládá, jen přepisuje písmo.

Cíl do budoucna: Electron desktop aplikace s **časově synchronizovanými texty ve stylu Spotify**.
Do té doby běží v prohlížeči (lokální Node server + webové UI).

> Stav: **funkční verze v prohlížeči** (kroky 1–7 z plánu). Zbývá Electron obal (krok 8).

---

## 1. Rozhodnutí

| # | Rozhodnutí | Proč |
|---|------------|------|
| D1 | **Node.js (≥ 20), ESM, bez TypeScriptu** | Stejný jazyk pro backend, frontend i Electron. Bez build kroku. |
| D2 | **Frontend: čisté HTML/CSS/JS** (bez Reactu) | UI je malé. Totéž `public/` později načte Electron `BrowserWindow`. |
| D3 | **Backend: vestavěný `node:http`, endpoint `POST /api/lyrics`** | Express nebyl potřeba (jeden endpoint + statické soubory). Server drží logiku a síťové požadavky (CORS, scraping), výsledky cachuje 1 h. V Electronu poběží tentýž server v hlavním procesu. |
| D4 | **Primární zdroj: [LRCLIB](https://lrclib.net)** | Zdarma, bez API klíče, vrací čistý text (`plainLyrics`) **a synchronizované časy** (`syncedLyrics`, formát LRC) — základ pro Spotify styl. Nemusí se scrapovat reklamy. |
| D5 | **Druhý zdroj: Genius** (API pro hledání + stažení stránky) | Má označení sekcí (`[Куплет 1]`, `[Припев]`), které LRCLIB nemá. Vyžaduje zdarma Genius API token (`GENIUS_TOKEN`). Knihovnu *Lyricist* nepoužijeme (neudržovaná) — stačí `fetch` + `cheerio`. |
| D6 | **Obecné webové vyhledávání** (`"… текст песни"`) jako **volitelný** 3. zdroj | Potřebuje API klíč vyhledávače (např. Brave Search API). Rozhraní poskytovatelů je připravené, implementace až bude potřeba. |
| D7 | **Vlastní romanizér, ne `lyric-romanizer`** | Ten interně používá `cyrillic-to-translit-js`, jehož pravidla neumíme ovlivnit (ё, ь/ъ, `e` vs. `ye`). Pravidla níže mají ~100 řádků kódu a máme je plně pod kontrolou i pokryté testy. Ukrajinštinu můžeme přidat později jako další profil. |
| D8 | **Testy: vestavěný `node:test`** | Žádná závislost navíc, `npm test`. |
| D9 | **Testovací data jsou vymyšlená** | Fixtures jsou krátké vlastní ruské věty a uměle vytvořené HTML stránky. Do repozitáře neukládáme skutečné texty písní (autorská práva). |
| D10 | **Nic se nedoplňuje z paměti** | Text pochází výhradně ze zdrojů. Pokud chybí, aplikace to řekne. |
| D11 | **Dotaz v latince se zkusí i v azbuce** (`search/reverse.js`) | Zdroje mají názvy v azbuce. Převod latinka→azbuka (anglický i český styl: `zh`/`ž`, `ya`/`ja`) slouží **jen pro vyhledávání**, nikdy se nezobrazuje jako text. |
| D12 | **Zdroje si předávají přesné názvy** | LRCLIB → Genius → (znovu LRCLIB). Stránky „Genius Romanizations“ se nestahují, ale přes vazbu `translation_of` se dohledá originál. |
| D13 | **Jiná skladba se pozná podle textu** | Shoda textů < 50 % = různé skladby (např. dvě písně se slovem „осень“). Ponechá se ta s přesnějším názvem, druhá se zobrazí jako „nepoužito“. |
| D15 | **Hledání přes interpreta** | Když „interpret + název“ nic nenajde (typicky latinka: „egor kreed budilnik“), najde se interpret (Genius uvádí „Егор Крид (Egor Kreed)“) a název se hledá mezi jeho 200 nejpopulárnějšími skladbami. Názvy se porovnávají tolerantně k přepisu (kreed = krid, č = ch) a drobným překlepům. |
| D16 | **Originál = aspoň 80 % azbuky** | Některé záznamy v LRCLIB jsou pod ruským názvem už přepsané do latinky. Takové se přeskočí. |
| D17 | **Shoda zdrojů se počítá po slovech** | Nezávisí na zalomení řádků a ignoruje doprovodné vokály v závorkách. Nejisté řádky se dál značí po řádcích. |
| D14 | **Jiné zalomení řádků není rozdíl** | Genius a LRCLIB občas dělí stejná slova do řádků jinak. Validator to pozná (`reflows`) a nepočítá to jako neshodu; zobrazí se zalomení základního zdroje. |

---

## 2. Datový tok

```
UI (interpret, název)
        │  POST /api/lyrics
        ▼
search/        ─ dotazy na poskytovatele paralelně (LRCLIB, Genius, [web])
        ▼
extractor/     ─ HTML/JSON → surový text (odstranění reklam, odkazů, „You might also like“,
        │        hlaviček, copyrightu, metadat)
        ▼
parser/        ─ surový text → { sections: [{ name, lines[] }] }
        │        (+ synced: [{ timeMs, text }] pokud je k dispozici)
        ▼
validator/     ─ porovnání verzí mezi zdroji, výběr nejlepší, míra jistoty,
        │        označení nejistých řádků
        ▼
romanizer/     ─ řádek po řádku, 1:1, včetně názvů sekcí
        ▼
validator/     ─ kontrola: počty řádků v každé sekci sedí, pořadí, opakování
        ▼
formatter/     ─ textový výstup „[Sekce]\nřádky…“ + JSON pro UI
        ▼
UI             ─ originál | romanizace | kopírovat | zdroj, důvěryhodnost, statistiky
```

---

## 3. Struktura projektu

```
rylix/
  package.json
  src/
    server.js                 Express: statické UI + /api/lyrics
    pipeline.js               spojuje moduly dohromady
    search/
      index.js                spustí všechny poskytovatele, vrátí kandidáty
      providers/lrclib.js
      providers/genius.js
      providers/websearch.js  (volitelný, D6)
    extractor/
      genius.js               HTML Genius → text
      clean.js                obecné čištění textu (řádky smetí)
    parser/
      index.js                text → sekce; LRC → synchronizované řádky
    romanizer/
      ru.js                   pravidla romanizace ruštiny
      index.js                romanizace struktury (sekce, řádky)
    validator/
      index.js                počty řádků, porovnání verzí, confidence
      diff.js                 zarovnání řádků dvou verzí (LCS)
    formatter/
      index.js
  public/                     UI (index.html, app.js, style.css)
  test/
    fixtures/                 vymyšlené texty a HTML stránky
    *.test.js
  electron/                   (později) main.js, preload.js
```

---

## 4. Datové struktury

```jsonc
// Kandidát z jednoho zdroje (výstup parseru)
{
  "artist": "…", "title": "…",
  "source": { "provider": "genius", "url": "https://…" },
  "sections": [
    { "name": "Куплет 1", "lines": ["…", "…"] },
    { "name": null,       "lines": ["…"] }      // text bez označení sekcí
  ],
  "synced": [ { "timeMs": 12340, "text": "…" } ] // jen LRCLIB, jinak null
}

// Výsledek pro UI
{
  "original":  { "sections": [ … ] },
  "romanized": { "sections": [ … ] },           // stejný tvar, 1:1
  "synced":    [ { "timeMs": 12340, "text": "…", "romanized": "…" } ],
  "source":    { "provider": "…", "url": "…" },
  "alternatives": [ { "provider": "…", "url": "…", "agreement": 0.97 } ],
  "confidence": "high" | "medium" | "low",
  "stats": { "originalLines": 32, "romanizedLines": 32 },
  "uncertain": [ { "section": 1, "line": 3, "reason": "differs between sources", "variants": ["…","…"] } ],
  "valid": true
}
```

Prázdné řádky mezi sekcemi nejsou položky `lines`, generuje je formatter. Prázdné řádky
**uvnitř** sekce (pokud zdroj nemá hlavičky) rozdělí text na víc sekcí s `name: null`.

---

## 5. Romanizační specifikace (profil `ru-practical`)

Vychází z BGN/PCGN, zjednodušeno pro čtení bez diakritiky. Jedna tabulka pro celou aplikaci.

### Základní znaky

| А | Б | В | Г | Д | Ж | З | И | Й | К | Л | М | Н | О | П | Р | С | Т | У | Ф | Х | Ц | Ч | Ш | Щ | Ы | Э | Ю | Я |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a | b | v | g | d | zh | z | i | y | k | l | m | n | o | p | r | s | t | u | f | kh | ts | ch | sh | shch | y | e | yu | ya |

### Kontextová pravidla

| Znak | Pravidlo | Příklad |
|------|----------|---------|
| **е** | `ye` na začátku slova, po samohlásce, po ь/ъ; jinak `e` | ель → *yel'*, моё → *moyo*, небо → *nebo* |
| **ё** | `yo`; po ж, ш, ч, щ, ц jen `o` | тёплый → *tyoplyy*, жёлтый → *zholtyy*, ёж → *yozh* |
| **ь** | apostrof `'` | мышь → *mysh'* |
| **ъ** | apostrof `'` (+ následné е/ё/ю/я jako `ye/yo/yu/ya`) | съезд → *s'yezd* |
| **й** | `y` | мой → *moy*, край → *kray* |
| **ы** | `y` | мы → *my* |
| **-ий / -ый** | plyne z pravidel výše: `iy`, `yy` | синий → *siniy*, новый → *novyy* |

- **Velká písmena:** celé slovo velkými → i dvojznaky velkými (ЖУК → *ZHUK*); jinak jen první
  písmeno (Жук → *Zhuk*, Щука → *Shchuka*).
- **Vše ostatní** (interpunkce, čísla, latinka, emoji, mezery) se kopíruje beze změny.
- **Pozor:** mnoho zdrojů píše `е` místo `ё`. Aplikace nehádá, kde má být `ё` — romanizuje to, co
  ve zdroji je. Pokud se zdroje liší jen v `е`/`ё`, použije se varianta s `ё` a řádek se
  **neoznačí** jako nejistý (jde o pravopisnou variantu, ne o jiný text).
- **Názvy sekcí** se romanizují stejně: `[Куплет 1]` → `[Kuplet 1]`, `[Припев]` → `[Pripev]`.

Příklad (vymyšlená věta):

```
Тёплый ветер над рекой, съезд у дома   →   Tyoplyy veter nad rekoy, s'yezd u doma
```

---

## 6. Pravidla zachování struktury (tvrdé invarianty)

Romanizace je čistá funkce `line → line`. Nikdy:

- nespojuje ani nerozděluje řádky, nemění pořadí,
- neodstraňuje opakované řádky (žádná deduplikace),
- nepřekládá, neopravuje, nedoplňuje chybějící text.

Validator po romanizaci kontroluje pro **každou sekci** `original.lines.length === romanized.lines.length`
a počet sekcí. Pokud cokoli nesedí → `valid: false` a UI zobrazí varování místo „OK“.

---

## 7. Výběr zdroje a míra jistoty

1. Každý poskytovatel vrátí 0–N kandidátů. Filtr: shoda interpreta/názvu (normalizovaná),
   text obsahuje azbuku, není „instrumental“.
2. Kandidáti se porovnají po řádcích (normalizace: malá písmena, ё→е, bez interpunkce),
   zarovnání přes LCS → `agreement` 0–1.
3. **Základní text** = kandidát s označenými sekcemi (Genius), pokud se shoduje s ostatními;
   jinak kandidát s nejvyšší shodou. Synchronizované časy se převezmou z LRCLIB, pokud se
   texty shodují.
4. Řádky, které se mezi zdroji liší, jdou do `uncertain` se všemi variantami.
5. `confidence`: **high** = ≥ 2 zdroje, shoda ≥ 95 %; **medium** = 1 zdroj nebo shoda 80–95 %;
   **low** = shoda < 80 % nebo neprošla validace.

---

## 8. Čištění stránky (extractor)

Genius: bereme pouze elementy `[data-lyrics-container="true"]`, `<br>` → nový řádek, a pak
odstraníme: bloky „You might also like“, hlavičku „N Contributors … Lyrics“, „Embed“, odkazy na
anotace (text zůstane, odkaz zmizí), reklamní/doporučené bloky, copyright a metadata.
`clean.js` navíc odstraní řádky, které nejsou lyrika (URL, „Translations“, „Read more“,
počty zobrazení…). Každé pravidlo má vlastní test na uměle vytvořeném HTML.

---

## 9. UI

```
[ Interpret      ]  [ Název skladby ]  [ VYHLEDAT A ROMANIZOVAT ]

ORIGINÁL                         │ ROMANIZACE                 [ KOPÍROVAT ]
[Куплет 1]                       │ [Kuplet 1]
…                                │ …

Zdroj: genius.com/…   Důvěryhodnost: high   Řádky: 32 / 32   Neověřené řádky: 0
```

Obě kolonky mají stejnou výšku řádků, takže si řádky vizuálně odpovídají. Nejisté řádky
jsou zvýrazněné, po najetí myší ukážou varianty. Později: režim „přehrávání“ s
posouváním textu podle `synced` časů (Spotify styl).

---

## 10. Testy (`npm test`)

| Oblast | Co se ověřuje |
|--------|---------------|
| romanizer | každé písmeno tabulky; е/ё kontext; ь/ъ; velká písmena; interpunkce a latinka beze změny |
| struktura | počet řádků, pořadí, opakované řádky zůstanou, počet a názvy sekcí |
| extractor | odstranění reklam, „You might also like“, odkazů, hlaviček, copyrightu |
| parser | hlavičky sekcí, text bez hlaviček, LRC časy |
| validator | shodné verze → high; rozdílný řádek → uncertain; е/ё varianta není nejistá; nesedící počty → `valid: false` |
| providers | s mockovaným `fetch` (žádné síťové volání v testech) |

---

## 11. Plán implementace

1. `package.json`, `romanizer/` + testy
2. `parser/` + `formatter/` + testy
3. `validator/` (počty, diff, confidence) + testy
4. `search/providers/lrclib.js` + `pipeline.js` + `server.js` + základní UI → **první funkční verze v prohlížeči**
5. `extractor/genius.js` + `providers/genius.js` + testy (vyžaduje `GENIUS_TOKEN`)
6. Porovnání více zdrojů, zvýraznění nejistých řádků v UI
7. Synchronizované texty (Spotify styl) v UI
8. Electron obal (`electron/main.js`), build pro Windows

## Spuštění

Nejjednodušeji: **dvojklik na `rylix.cmd`**, otevře se prohlížeč na http://127.0.0.1:3000.

Z terminálu:

```bash
npm install
npm test          # 72 testů, bez sítě
npm start         # http://127.0.0.1:3000
```

Genius token patří do souboru `.env` (je v `.gitignore`):

```
GENIUS_TOKEN=...
```

Bez tokenu aplikace funguje jen s LRCLIB (bez označení sekcí a bez křížové kontroly).

## Ovládání

- **Sledovat přehrávání:** Rylix čte z Windows, co právě hraje (Spotify, YouTube v prohlížeči, …) — stejná data jako ovládání médií u hlasitosti. Nic se neposílá do Spotify ani se nečte účet. Při změně skladby se text sám najde a karaoke jede podle skutečné pozice v přehrávači.
- **Jazyky:** ruština, ukrajinština (oficiální norma KMU 2010) a běloruština se převádí do latinky; ostatní jazyky (čeština, angličtina, …) se zobrazí beze změny, časování funguje i u nich.
- **Knihovna (vlevo):** schválené texty uložené na tomto PC v `data/library.json` (mimo git). Uložená verze má přednost před novým hledáním.
- **Detail (vpravo):** obal, **Schválit a uložit**, stav časování (ruční synchronizace připravujeme).

- **Vedle sebe:** originál a latinka řádek po řádku. Zvýrazněné řádky se mezi zdroji liší, po najetí myší ukážou variantu.
- **Jen latinka:** čistý text na čtení / zpívání.
- **Karaoke:** časované řádky z LRCLIB. Spusť ▶ ve stejnou chvíli jako skladbu (mezerník = play/pauza), kliknutím na řádek skočíš na jeho čas.
- **Kopírovat latinku / originál:** celý text se sekcemi.

## Poznámka k použití

Aplikace je určena pro osobní použití. Texty písní jsou autorsky chráněné; aplikace je
nestahuje do úložiště, jen je zobrazí a přepíše pro uživatele.
