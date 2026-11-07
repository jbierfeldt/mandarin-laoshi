/** Merge lesson and conversation occurrences into one phrasebook index. */

import { conversationOccurrences } from "./adapters/conversation.mjs";
import { lessonOccurrences } from "./adapters/lesson.mjs";
import { buildCharMap, metaFrom, reverseMap } from "./headword.mjs";
import { foldPinyin, stripPunct } from "./search.mjs";

function cmp(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function toneCount(text) {
  return [...String(text ?? "")].filter((ch) => /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]/.test(ch)).length;
}

function punctCount(text) {
  let n = 0;
  for (const ch of String(text ?? "")) if (!/[\p{Script=Han}a-zA-Z0-9]/u.test(ch)) n += 1;
  return n;
}

function hanBetter(a, b) {
  const score = (occ) => [punctCount(occ.displayTrad), [...occ.displayTrad].filter((ch, i) => [...occ.displaySimp][i] !== ch).length, occ.displayTrad.length];
  const sa = score(a);
  const sb = score(b);
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] > sb[i];
  return a.displayTrad < b.displayTrad;
}

function pyBetter(a, b) {
  if (a.authored !== b.authored) return a.authored;
  const ta = toneCount(a.pinyin);
  const tb = toneCount(b.pinyin);
  if (ta !== tb) return ta > tb;
  const sa = (String(a.pinyin).match(/ /g) || []).length;
  const sb = (String(b.pinyin).match(/ /g) || []).length;
  if (sa !== sb) return sa > sb;
  return a.pinyin < b.pinyin;
}

function fresh(occ) {
  return {
    key: occ.key,
    keySimp: occ.keySimp,
    kind: occ.role,
    senses: [],
    words: occ.role === "phrase" ? occ.words.slice() : [],
    audio: occ.audio,
    _han: occ,
    _py: occ,
    _syls: [],
    _audioOcc: occ,
  };
}

function addSource(entry, gloss, source) {
  let sense = entry.senses.find((s) => s.gloss === gloss);
  if (!sense) {
    sense = { gloss, sources: [], _line: new Set(), _item: new Set() };
    entry.senses.push(sense);
  }
  if (source.sectionType === "lines" || source.sectionType === "drill") {
    const lineKey = `${source.origin}|${source.id}|${gloss}`;
    if (sense._line.has(lineKey)) return;
    sense._line.add(lineKey);
  }
  const itemKey = `${source.origin}|${source.id}|${source.sectionType}|${source.itemId}`;
  if (sense._item.has(itemKey)) return;
  sense._item.add(itemKey);
  sense.sources.push(source);
}

function considerDisplay(entry, occ) {
  if (hanBetter(occ, entry._han)) entry._han = occ;
  if (pyBetter(occ, entry._py)) entry._py = occ;
}

function rememberAudio(entry, occ) {
  if (!occ.audio) return;
  if (!entry.audio) {
    entry.audio = occ.audio;
    entry._audioOcc = occ;
    return;
  }
  if (occ.audio.real && !entry.audio.real) {
    entry.audio = occ.audio;
    entry._audioOcc = occ;
  }
}

function mergeFull(map, occ) {
  let entry = map.get(occ.key);
  if (!entry) {
    entry = fresh(occ);
    map.set(occ.key, entry);
  } else {
    considerDisplay(entry, occ);
    if (occ.role === "word") entry.kind = "word";
    if ((occ.words || []).length > entry.words.length) entry.words = occ.words.slice();
    rememberAudio(entry, occ);
  }
  addSource(entry, occ.gloss, occ.source);
  entry._syls.push(occ.syllables || []);
}

function mergeSub(map, occ) {
  let entry = map.get(occ.key);
  if (!entry) {
    entry = fresh(occ);
    entry.kind = "word";
    entry.words = [];
    entry.audio = null;
    map.set(occ.key, entry);
    addSource(entry, occ.gloss, occ.source);
    entry._syls.push(occ.syllables || []);
    return;
  }
  if (!entry.senses.some((s) => s.gloss === occ.gloss)) addSource(entry, occ.gloss, occ.source);
  entry._syls.push(occ.syllables || []);
}

function bestSlug(lists, plain) {
  let best = null;
  for (const list of lists) {
    const folds = (list || []).map((syl) => foldPinyin(syl)).filter(Boolean);
    if (!folds.length) continue;
    if (plain && folds.join("") !== plain) continue;
    const slug = folds.join("-");
    if (!best || folds.length > best.n || (folds.length === best.n && slug < best.slug)) best = { n: folds.length, slug };
  }
  if (best) return best.slug;
  return plain || "x";
}

function senseId(gloss, used) {
  let base = gloss.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  if (!base) base = "gloss";
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function sortSources(sources) {
  return sources.slice().sort((a, b) => cmp(b.date, a.date) || cmp(a.id, b.id) || cmp(a.sectionType, b.sectionType) || cmp(a.itemId, b.itemId));
}

function publicSource(src) {
  return {
    origin: src.origin,
    id: src.id,
    kind: src.kind,
    title: src.title,
    short: src.short,
    source: src.source,
    date: src.date,
    href: src.href,
    script: src.script || "",
    sectionType: src.sectionType,
    sectionTitle: src.sectionTitle,
    itemId: src.itemId,
    group: src.group || "",
    note: src.note || "",
  };
}

function mentions(entry, phrase) {
  if (phrase.key === entry.key) return false;
  if (phrase.wordKeys && phrase.wordKeys.length) return phrase.wordKeys.includes(entry.key);
  const simp = stripPunct(entry._han.displaySimp);
  const trad = stripPunct(entry._han.displayTrad);
  if ([...simp].length < 2 && [...trad].length < 2) return false;
  const ps = stripPunct(phrase.displaySimp);
  const pt = stripPunct(phrase.displayTrad);
  return (simp.length >= 2 && (ps.includes(simp) || pt.includes(simp)))
    || (trad.length >= 2 && (ps.includes(trad) || pt.includes(trad)));
}

function exampleFrom(phrase) {
  return {
    trad: phrase.displayTrad,
    simp: phrase.displaySimp,
    pinyin: phrase.pinyin,
    en: phrase.gloss,
    note: phrase.source.note || "",
    href: phrase.source.href,
    sourceId: phrase.source.id,
    itemId: phrase.source.itemId,
    origin: phrase.source.origin,
    kind: phrase.source.kind,
    short: phrase.source.short,
    date: phrase.source.date,
    words: phrase.words || [],
  };
}

function attachExamples(entries, phrases) {
  for (const entry of entries) {
    const found = [];
    const seen = new Set();
    for (const phrase of phrases) {
      if (!mentions(entry, phrase)) continue;
      const mark = `${phrase.source.id}|${phrase.source.itemId}`;
      if (seen.has(mark)) continue;
      seen.add(mark);
      found.push(exampleFrom(phrase));
    }
    found.sort((a, b) => cmp(b.date, a.date) || cmp(b.sourceId, a.sourceId) || cmp(a.itemId, b.itemId));
    entry.examples = found.slice(0, 3).map((ex) => ({
      trad: ex.trad,
      simp: ex.simp,
      pinyin: ex.pinyin,
      en: ex.en,
      note: ex.note,
      href: ex.href,
      sourceId: ex.sourceId,
      itemId: ex.itemId,
      origin: ex.origin,
      kind: ex.kind,
      short: ex.short,
      words: ex.words,
    }));
  }
}

function finalize(entry) {
  const trad = entry._han.displayTrad;
  const simp = entry._han.displaySimp;
  const pinyin = entry._py.pinyin;
  const pinyinPlain = foldPinyin(pinyin);
  const simpKey = stripPunct(simp);
  const slug = bestSlug(entry._syls, pinyinPlain);
  const used = new Set();
  const senses = entry.senses.slice().sort((a, b) => cmp(a.gloss, b.gloss)).map((sense) => ({
    id: senseId(sense.gloss, used),
    gloss: sense.gloss,
    sources: sortSources(sense.sources).map(publicSource),
  }));
  return {
    id: `pb-${slug}-${simpKey}`,
    kind: entry.kind,
    trad,
    simp,
    pinyin,
    pinyinPlain,
    senses,
    words: entry.words || [],
    examples: entry.examples || [],
    audio: entry.audio || null,
  };
}

export function entryIdParts(entry) {
  const simpKey = stripPunct(entry.simp);
  const suffix = `-${simpKey}`;
  const slug = entry.id.startsWith("pb-") && entry.id.endsWith(suffix)
    ? entry.id.slice(3, entry.id.length - suffix.length)
    : "";
  return { slug, simpKey, flat: slug === "x" ? "" : slug.replace(/-/g, "") };
}

export function validateIndex(index, fileExists = () => true) {
  const errors = [];
  const ids = new Set();
  const allowed = new Set((index.sources || []).map((src) => src.href));
  for (const src of index.sources || []) {
    const route = src.origin === "conversation" ? "practice" : "lesson";
    const expect = `#/${route}/${encodeURIComponent(src.id)}`;
    if (src.href !== expect) errors.push(`broken link: ${src.href}`);
    if (!/^#\/(lesson|practice)\/[A-Za-z0-9_.~%-]+$/.test(src.href)) errors.push(`broken link: ${src.href}`);
  }
  for (const entry of index.entries || []) {
    if (ids.has(entry.id)) errors.push(`duplicate id: ${entry.id}`);
    ids.add(entry.id);
    if (entry.kind !== "word" && entry.kind !== "phrase") errors.push(`bad kind: ${entry.id}`);
    if (!stripPunct(entry.simp) || !stripPunct(entry.trad)) errors.push(`empty headword: ${entry.id}`);
    if (foldPinyin(entry.pinyin) !== entry.pinyinPlain) errors.push(`pinyin fold: ${entry.id}`);
    const parts = entryIdParts(entry);
    if (!parts.slug || parts.flat !== entry.pinyinPlain) errors.push(`bad id: ${entry.id}`);
    if (!entry.senses.length) errors.push(`no senses: ${entry.id}`);
    for (const sense of entry.senses) {
      if (!sense.sources.length) errors.push(`no sources: ${entry.id}`);
      for (const src of sense.sources) {
        if (!allowed.has(src.href)) errors.push(`broken link: ${src.href}`);
        if (src.origin === "conversation" && !src.href.startsWith("#/practice/")) errors.push(`broken link: ${src.href}`);
        if (src.origin === "lesson" && !src.href.startsWith("#/lesson/")) errors.push(`broken link: ${src.href}`);
        if (/^https?:/i.test(src.href)) errors.push(`broken link: ${src.href}`);
      }
    }
    if (entry.audio) {
      if (entry.audio.src.includes("..") || !fileExists(entry.audio.src)) errors.push(`broken audio: ${entry.audio.src}`);
    }
  }
  if (errors.length) {
    const err = new Error(errors.slice(0, 8).join("; "));
    err.errors = errors;
    throw err;
  }
  return index;
}

export function buildIndex({ lessons, conversations, fileExists }) {
  const exists = fileExists || (() => false);
  const docs = [...lessons.map((row) => row.doc), ...conversations.map((row) => row.doc)];
  const { map, conflicts } = buildCharMap(docs);
  const rev = reverseMap(map);
  const ctx = { map, rev, fileExists: exists };
  const full = [];
  const subs = [];
  const inputs = { lessons: [], conversations: [] };
  const sources = [];
  let incorrectExcluded = 0;
  const keep = (occ) => {
    if (occ.incorrect) {
      if (!occ.subword) incorrectExcluded += 1;
      return;
    }
    (occ.subword ? subs : full).push(occ);
  };
  for (const row of lessons) {
    const meta = metaFrom(row.catalog, row.doc, "lesson");
    sources.push(publicSource({ ...meta, sectionType: "", sectionTitle: "", itemId: "", group: "", note: "" }));
    const { occurrences, stats } = lessonOccurrences(row.doc, meta, ctx);
    inputs.lessons.push({ id: meta.id, ...stats });
    for (const occ of occurrences) keep(occ);
  }
  for (const row of conversations) {
    const meta = metaFrom(row.catalog, row.doc, "conversation");
    sources.push(publicSource({ ...meta, sectionType: "", sectionTitle: "", itemId: "", group: "", note: "" }));
    const { occurrences, stats } = conversationOccurrences(row.doc, meta, ctx);
    inputs.conversations.push({ id: meta.id, script: meta.script, ...stats });
    for (const occ of occurrences) keep(occ);
  }
  const mapEntries = new Map();
  for (const occ of full) mergeFull(mapEntries, occ);
  for (const occ of subs) mergeSub(mapEntries, occ);
  const merged = [...mapEntries.values()];
  const phrases = full.filter((occ) => occ.role === "phrase");
  attachExamples(merged, phrases);
  const entries = merged.map(finalize).sort((a, b) => cmp(a.pinyinPlain, b.pinyinPlain) || cmp(stripPunct(a.simp), stripPunct(b.simp)) || cmp(a.id, b.id));
  sources.sort((a, b) => cmp(b.date, a.date) || cmp(a.id, b.id));
  const charMap = {};
  for (const key of Object.keys(map).sort()) charMap[key] = map[key];
  const words = entries.filter((e) => e.kind === "word").length;
  const phrasesN = entries.filter((e) => e.kind === "phrase").length;
  const index = {
    schema: 1,
    title: "Phrasebook",
    regen: "node phrasebook/build.mjs",
    description: "Words and phrases copied from lesson files and conversation entries. No extra dictionary, and no record of how well a word is known.",
    counts: {
      lessons: inputs.lessons.length,
      conversations: inputs.conversations.length,
      entries: entries.length,
      words,
      phrases: phrasesN,
      senses: entries.reduce((n, e) => n + e.senses.length, 0),
      withAudio: entries.filter((e) => e.audio).length,
      withExamples: entries.filter((e) => e.examples.length).length,
      withBreakdown: entries.filter((e) => e.words.length).length,
      multiSource: entries.filter((e) => new Set(e.senses.flatMap((s) => s.sources.map((src) => src.id))).size > 1).length,
      incorrectExcluded,
    },
    inputs,
    charMapConflicts: conflicts,
    sources,
    charMap,
    entries,
  };
  return validateIndex(index, exists);
}
