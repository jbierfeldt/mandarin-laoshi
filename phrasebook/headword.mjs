/** Headword shapes shared by the lesson and conversation adapters. */

import { foldPinyin, isHan, stripPunct } from "./search.mjs";

export function buildCharMap(docs) {
  const map = {};
  const conflicts = [];
  const add = (trad, simp) => {
    if (!trad || !simp || trad === simp) return;
    if ([...trad].length !== 1 || [...simp].length !== 1) return;
    if (!isHan(trad) || !isHan(simp)) return;
    if (map[trad] && map[trad] !== simp) conflicts.push([trad, map[trad], simp]);
    else map[trad] = simp;
  };
  const walkWords = (words) => {
    for (const w of words || []) {
      if (!w || !w.t || !w.s || w.t === w.s) continue;
      const ts = [...String(w.t)];
      const ss = [...String(w.s)];
      if (ts.length !== ss.length) continue;
      for (let i = 0; i < ts.length; i++) add(ts[i], ss[i]);
    }
  };
  for (const doc of docs) {
    for (const section of doc.sections || []) {
      for (const item of section.items || []) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        for (const cell of item.cells || []) if (cell && cell.ch && cell.s) add(String(cell.ch), String(cell.s));
        walkWords(item.words);
        if (item.word) walkWords([item.word]);
      }
    }
  }
  conflicts.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { map, conflicts };
}

export function reverseMap(map) {
  const rev = {};
  for (const trad of Object.keys(map).sort()) {
    const simp = map[trad];
    if (!rev[simp]) rev[simp] = trad;
  }
  return rev;
}

export function applyPair(tradStr, simpStr, map, rev) {
  const tradChars = [...String(tradStr ?? "")];
  const simpChars = simpStr ? [...String(simpStr)] : [];
  const zipped = simpChars.length === tradChars.length && tradChars.length > 0;
  let trad = "";
  let simp = "";
  for (let i = 0; i < tradChars.length; i++) {
    const ch = tradChars[i];
    const s = zipped ? simpChars[i] : "";
    if (!isHan(ch)) {
      trad += ch;
      simp += s && !isHan(ch) ? s : ch;
      continue;
    }
    if (s && s !== ch && isHan(s)) {
      trad += ch;
      simp += s;
      continue;
    }
    if (map[ch]) {
      trad += ch;
      simp += map[ch];
      continue;
    }
    if (rev[ch]) {
      trad += rev[ch];
      simp += ch;
      continue;
    }
    trad += ch;
    simp += ch;
  }
  return { trad, simp };
}

export function readCells(cells, map, rev) {
  let displayTrad = "";
  let displaySimp = "";
  let keyTrad = "";
  let keySimp = "";
  const syllables = [];
  for (const cell of cells || []) {
    if (!cell || typeof cell !== "object") continue;
    if (cell.pu) {
      displayTrad += cell.pu;
      displaySimp += cell.pu;
      continue;
    }
    if (cell.lat || !cell.ch) continue;
    const forms = applyPair(String(cell.ch), cell.s ? String(cell.s) : "", map, rev);
    displayTrad += forms.trad;
    displaySimp += forms.simp;
    keyTrad += stripPunct(forms.trad);
    keySimp += stripPunct(forms.simp);
    if (cell.pz) {
      displayTrad += cell.pz;
      displaySimp += cell.pz;
    }
    if (cell.py && String(cell.py).trim()) syllables.push(String(cell.py).trim());
  }
  return { displayTrad, displaySimp, keyTrad, keySimp, syllables };
}

export function mapWords(words, map, rev) {
  const out = [];
  for (const w of words || []) {
    if (!w || !w.t) continue;
    const forms = applyPair(String(w.t), w.s ? String(w.s) : "", map, rev);
    if (!stripPunct(forms.simp)) continue;
    out.push({
      trad: forms.trad,
      simp: forms.simp,
      pinyin: String(w.py || "").trim(),
      en: String(w.en || "").trim(),
    });
  }
  return out;
}

export function wordKeyOf(word, map, rev) {
  if (!word || !word.t) return "";
  const forms = applyPair(String(word.t), word.s ? String(word.s) : "", map, rev);
  const simp = stripPunct(forms.simp);
  if (!simp) return "";
  return `${simp}\n${foldPinyin(word.py || "")}`;
}

export function sourceOf(meta, section, item, note) {
  const text = note === undefined ? String(item.note || "") : String(note || "");
  return {
    origin: meta.origin,
    id: meta.id,
    kind: meta.kind,
    title: meta.title,
    short: meta.short,
    source: meta.source,
    date: meta.date,
    href: meta.href,
    script: meta.script || "",
    sectionType: section.type || "",
    sectionTitle: section.title || "",
    itemId: item.id || "",
    group: item.grp || item.tag || "",
    note: text.trim(),
  };
}

function pickClip(item) {
  const clips = (item.audio || []).filter((a) => a && a.src && !String(a.src).includes(".."));
  return clips.find((a) => a.real && a.kind !== "slow") || clips.find((a) => a.real) || clips[0] || null;
}

export function resolveAudio(item, meta, fileExists) {
  const clip = pickClip(item);
  if (!clip) return null;
  const src = `${meta.base}${String(clip.src).replace(/^\//, "")}`;
  if (src.includes("..") || !fileExists(src)) return null;
  return { src, label: String(clip.label || ""), real: !!clip.real };
}

export function occurrenceFromItem(item, section, meta, ctx, role) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const cells = readCells(item.cells, ctx.map, ctx.rev);
  if (!cells.keySimp) return null;
  const authored = String(item.py || "").trim();
  const pinyin = authored || cells.syllables.join(" ");
  const syllables = cells.syllables.length ? cells.syllables : (authored ? authored.split(/\s+/).filter(Boolean) : []);
  const words = role === "phrase" ? mapWords(item.words, ctx.map, ctx.rev) : [];
  const wordKeys = (item.words || []).map((w) => wordKeyOf(w, ctx.map, ctx.rev)).filter(Boolean);
  return {
    key: `${cells.keySimp}\n${foldPinyin(pinyin)}`,
    keySimp: cells.keySimp,
    keyTrad: cells.keyTrad,
    displayTrad: cells.displayTrad,
    displaySimp: cells.displaySimp,
    pinyin,
    authored: !!authored,
    syllables,
    role,
    gloss: String(item.en || "").trim(),
    incorrect: incorrectItem(item),
    subword: false,
    words,
    wordKeys,
    source: sourceOf(meta, section, item),
    audio: resolveAudio(item, meta, ctx.fileExists),
  };
}

export function occurrenceFromWord(word, item, section, meta, ctx) {
  const key = wordKeyOf(word, ctx.map, ctx.rev);
  if (!key) return null;
  const forms = applyPair(String(word.t), word.s ? String(word.s) : "", ctx.map, ctx.rev);
  const pinyin = String(word.py || "").trim();
  return {
    key,
    keySimp: stripPunct(forms.simp),
    keyTrad: stripPunct(forms.trad),
    displayTrad: forms.trad,
    displaySimp: forms.simp,
    pinyin,
    authored: !!pinyin,
    syllables: pinyin ? pinyin.split(/\s+/).filter(Boolean) : [],
    role: "word",
    gloss: String(word.en || "").trim(),
    incorrect: false,
    subword: true,
    words: [],
    wordKeys: [],
    source: sourceOf(meta, section, item, ""),
    audio: null,
  };
}

export function incorrectItem(item) {
  if (!item || typeof item !== "object") return false;
  const note = String(item.note || "");
  const en = String(item.en || "");
  return note.startsWith("Incorrect") || en.startsWith("Incorrect");
}

export function lessonVocabRole(item) {
  const group = String(item.grp || "").trim().toLowerCase();
  if (group.startsWith("phrase")) return "phrase";
  if (group.startsWith("word")) return "word";
  const han = (item.cells || []).map((c) => c.ch || c.pu || "").join("");
  const gloss = String(item.en || "").trim();
  if (/[。？！?!…]/.test(han) || /[?？!！]$/.test(gloss) || /…|\.\.\./.test(gloss)) return "phrase";
  return "word";
}

export function metaFrom(catalog, doc, origin) {
  const id = String(catalog.id || doc.id || "");
  return {
    origin,
    id,
    kind: catalog.kind || (origin === "conversation" ? "conversation" : ""),
    title: catalog.title || doc.title || id,
    short: catalog.short || doc.short || catalog.title || id,
    source: catalog.source || doc.source || "",
    date: catalog.date || doc.date || "",
    script: doc.script || "",
    href: origin === "conversation"
      ? `#/practice/${encodeURIComponent(id)}`
      : `#/lesson/${encodeURIComponent(id)}`,
    base: origin === "conversation" ? `conversations/${id}/` : `lessons/${id}/`,
  };
}
