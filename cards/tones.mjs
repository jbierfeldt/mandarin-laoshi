/** Tone colors for characters and pinyin. Same hues as the lesson viewer. */

import { esc } from "../phrasebook/card.mjs";
import { isHan } from "../phrasebook/search.mjs";
import { syllablesOf } from "../tools/conversation/pinyin.mjs";

const TONE_OF = {
  ā: 1, á: 2, ǎ: 3, à: 4,
  ē: 1, é: 2, ě: 3, è: 4,
  ī: 1, í: 2, ǐ: 3, ì: 4,
  ō: 1, ó: 2, ǒ: 3, ò: 4,
  ū: 1, ú: 2, ǔ: 3, ù: 4,
  ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4,
  ń: 2, ň: 3, ǹ: 4, ḿ: 2,
};

export function toneOf(token) {
  for (const ch of String(token || "").toLowerCase()) if (TONE_OF[ch]) return TONE_OF[ch];
  return 5;
}

function hansOf(text) {
  return [...String(text || "")].filter(isHan);
}

/**
 * One piece per Chinese character: the character, its syllable, and tone 1–5.
 * Spaced pinyin keeps the original capitalization. Unspaced pinyin is split
 * with the conversation syllable list.
 */
export function readingParts(hanzi, pinyin) {
  const hans = hansOf(hanzi);
  const raw = String(pinyin || "").trim();
  const spaced = raw.split(/[\s,，.。!！?？…~～]+/).filter(Boolean);
  if (hans.length && spaced.length === hans.length) {
    return hans.map((han, i) => ({ han, py: spaced[i], tone: toneOf(spaced[i]) }));
  }
  const spoken = raw ? syllablesOf(raw, hans.length || null) : null;
  if (spoken?.syllables && spoken.syllables.length === hans.length) {
    return hans.map((han, i) => ({ han, py: spoken.syllables[i].display, tone: spoken.syllables[i].tone || 5 }));
  }
  return hans.map((han) => ({ han, py: "", tone: 0 }));
}

function paint(text, tone, colors) {
  if (!colors || !tone) return esc(text);
  return `<span class="tone t${tone}">${esc(text)}</span>`;
}

export function hanziHtml(text, pinyin, colors) {
  const parts = readingParts(text, pinyin);
  let i = 0;
  let html = "";
  for (const ch of String(text || "")) {
    if (!isHan(ch)) html += esc(ch);
    else html += paint(ch, parts[i++]?.tone || 0, colors);
  }
  return html;
}

export function pinyinHtml(hanzi, pinyin, colors) {
  const parts = readingParts(hanzi, pinyin);
  if (!parts.length || parts.some((p) => !p.py)) return esc(pinyin || "");
  return parts.map((p) => paint(p.py, p.tone, colors)).join(" ");
}
