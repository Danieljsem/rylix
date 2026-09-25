// Genius song page HTML → lyrics text.
// Only [data-lyrics-container] is used; header, ads and "You might also like"
// blocks inside it are marked data-exclude-from-selection and dropped.
import * as cheerio from 'cheerio';
import { cleanLyricsText } from './clean.js';

export function extractGeniusLyrics(html) {
  const $ = cheerio.load(html);
  const containers = $('[data-lyrics-container="true"]');
  if (containers.length === 0) return null;

  const parts = [];
  containers.each((_, el) => {
    const c = $(el).clone();
    c.find('[data-exclude-from-selection="true"], script, style, iframe').remove();
    // As in a browser: whitespace in the HTML source is not a line break, only <br> is.
    c.find('*').addBack().contents()
      .filter((_, node) => node.type === 'text')
      .each((_, node) => { node.data = node.data.replace(/[ \t\r\n\f]+/g, ' '); });
    c.find('br').replaceWith('\n');
    parts.push(c.text());
  });

  const lines = parts.join('\n').split('\n').map((l) => l.trim());
  const text = cleanLyricsText(lines.join('\n'));
  return text === '' ? null : text;
}
