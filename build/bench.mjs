import { lookupLyrics } from '../src/pipeline.js';
const songs = [['Кино','Кукушка'],['Kino','Gruppa krovi'],['egor kreed','budilnik'],['Океан Ельзи','Обійми'],['Zemfira','Iskala'],['Koukr','Ideal']];
let total = 0;
for (const [a, t] of songs) {
  const t0 = performance.now();
  const r = await lookupLyrics({ artist: a, title: t }, { token: process.env.GENIUS_TOKEN });
  const ms = Math.round(performance.now() - t0); total += ms;
  console.log((a + ' – ' + t).padEnd(28), String(ms).padStart(5), 'ms', r.found ? r.source.provider + (r.alternatives.length ? '+' + r.alternatives.map(x => x.provider).join('+') : '') : 'not found');
}
console.log('total', total, 'ms');
