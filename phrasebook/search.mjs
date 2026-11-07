/** Pinyin and text folding shared by the generator and the search page. */

const TONE = {
  ā: "a", á: "a", ǎ: "a", à: "a",
  ē: "e", é: "e", ě: "e", è: "e",
  ī: "i", í: "i", ǐ: "i", ì: "i",
  ō: "o", ó: "o", ǒ: "o", ò: "o",
  ū: "u", ú: "u", ǔ: "u", ù: "u",
  ǖ: "v", ǘ: "v", ǚ: "v", ǜ: "v", ü: "v",
  ń: "n", ň: "n", ǹ: "n",
  ḿ: "m",
  ê: "e",
};

export function isHan(ch) {
  const c = ch.codePointAt(0);
  return c >= 0x3400 && c <= 0x9fff;
}

/** Drop tone marks, tone numbers, spaces, and case. ü / u: / v all become v. */
export function foldPinyin(input) {
  let s = String(input ?? "").trim().toLowerCase().replace(/u:/g, "v");
  let out = "";
  for (const ch of s) out += TONE[ch] || ch;
  return out.replace(/[1-5]/g, "").replace(/[^a-z]+/g, "");
}

export function stripPunct(input) {
  let out = "";
  for (const ch of String(input ?? "")) {
    if (isHan(ch) || /[a-zA-Z0-9]/.test(ch)) out += ch;
  }
  return out;
}

function squeezeEnglish(input) {
  return String(input ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function englishHit(text, query) {
  const raw = String(text ?? "").toLowerCase();
  const q = query.toLowerCase();
  if (q && raw.includes(q)) return true;
  const qs = squeezeEnglish(query);
  return qs.length >= 2 && squeezeEnglish(text).includes(qs);
}

function pinyinHit(text, foldedQuery) {
  if (!foldedQuery) return false;
  return foldPinyin(text).includes(foldedQuery);
}

function hanVariants(query, charMap) {
  const chars = [...String(query ?? "")].filter(isHan).join("");
  if (!chars) return [];
  const rev = {};
  for (const [trad, simp] of Object.entries(charMap || {})) {
    if (!rev[simp]) rev[simp] = trad;
  }
  const toSimp = [...chars].map((ch) => charMap[ch] || ch).join("");
  const toTrad = [...chars].map((ch) => rev[ch] || ch).join("");
  return [...new Set([chars, toSimp, toTrad].map(stripPunct).filter(Boolean))];
}

function hanziHit(entry, query, charMap) {
  const forms = hanVariants(query, charMap);
  if (!forms.length) return false;
  const targets = [stripPunct(entry.simp), stripPunct(entry.trad)];
  for (const w of entry.words || []) targets.push(stripPunct(w.simp), stripPunct(w.trad));
  return forms.some((form) => targets.some((target) => target.includes(form)));
}

function entryTexts(entry) {
  const english = [];
  const pinyin = [entry.pinyin, entry.pinyinPlain];
  for (const sense of entry.senses || []) {
    english.push(sense.gloss);
    for (const src of sense.sources || []) english.push(src.note);
  }
  for (const w of entry.words || []) {
    english.push(w.en);
    pinyin.push(w.pinyin);
  }
  return { english, pinyin };
}

export function matchesEntry(entry, query, charMap) {
  const q = String(query ?? "").trim();
  if (!q) return true;
  const { english, pinyin } = entryTexts(entry);
  const forms = hanVariants(q, charMap);
  if (forms.length) {
    const inHead = hanziHit(entry, q, charMap);
    const inGloss = forms.some((form) => english.some((text) => String(text ?? "").includes(form)));
    if (inHead || inGloss) return true;
  }
  if (english.some((text) => englishHit(text, q))) return true;
  const folded = foldPinyin(q);
  return pinyin.some((text) => pinyinHit(text, folded));
}

/**
 * Browse when query is blank. kind is "all" | "word" | "phrase".
 * sourceId limits to one lesson or conversation id.
 */
export function searchEntries(index, query, filter = {}) {
  const kind = filter.kind || "all";
  const sourceId = filter.sourceId || "";
  let list = index.entries || [];
  if (kind === "word" || kind === "phrase") list = list.filter((entry) => entry.kind === kind);
  if (sourceId) {
    list = list.filter((entry) => (entry.senses || []).some((sense) =>
      (sense.sources || []).some((src) => src.id === sourceId)));
  }
  const q = String(query ?? "").trim();
  if (!q) return list;
  const charMap = index.charMap || {};
  return list.filter((entry) => matchesEntry(entry, q, charMap));
}
