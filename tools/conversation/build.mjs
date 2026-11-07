import { capFirst } from "./pinyin.mjs";

/**
 * Player contract on main (a70ce244): conversations/index.json entries[],
 * conversations/<id>/entry.json, kind conversation, script hans,
 * route #/practice/<id>. Words are {t, py, en, s?}. Cells are one syllable:
 * {ch, py, t, s?, pz?}. This module only fills that shape. It does not render
 * HTML and it does not build the phrasebook search index.
 */

const KEY = '<span class="syn">synthetic</span> audio is optional. This page is readable without clips. When a clip is added later, it is computer speech and the label says synthetic. Simplified characters are the main script on this page. Grey characters are traditional. ☰ Options flips the script and can hide pinyin or English. The pinyin line under the English is the dictionary reading with tone marks.';
const FOOT = "Study cards. Personal names, contact details, and screenshots are not included. Audio is not required to publish the entry.";

function wordChip(word) {
  const chip = { t: word.trad, py: word.py, en: word.en };
  if (word.simp !== word.trad) chip.s = word.simp;
  return chip;
}

function cellsOf(line) {
  return line.cells.map((c, i) => {
    const cell = { ch: c.trad, py: i === 0 ? capFirst(c.display) : c.display, t: c.tone };
    if (c.simp !== c.trad) cell.s = c.simp;
    if (c.pz) cell.pz = c.pz;
    return cell;
  });
}

function linePy(cells) {
  return cells.map((c) => c.py).join(" ");
}

function assertInvariant(line, cells, words) {
  const trad = cells.filter((c) => c.ch).map((c) => c.ch).join("");
  const simp = cells.filter((c) => c.ch).map((c) => c.s || c.ch).join("");
  const wordTrad = words.map((w) => w.t).join("");
  const wordSimp = words.map((w) => w.s || w.t).join("");
  if (trad !== wordTrad || simp !== wordSimp) {
    throw new Error(`template_invariant ${line.id}: ${wordTrad}/${wordSimp} vs ${trad}/${simp}`);
  }
  for (const cell of cells) {
    if (cell.ch && [...cell.ch].length !== 1) throw new Error(`template_invariant ${line.id}: cell ${cell.ch} is not one character`);
    if (cell.py && /\s/.test(cell.py)) throw new Error(`template_invariant ${line.id}: ${cell.py} is not one syllable`);
  }
}

function lineItem(line) {
  const cells = cellsOf(line);
  const words = line.words.map(wordChip);
  assertInvariant(line, cells, words);
  const item = {
    id: line.id,
    en: line.en,
    py: linePy(cells),
    ...(line.note ? { note: line.note } : {}),
    cells,
    words,
    cues: [],
  };
  if (line.audio) item.audio = line.audio;
  return item;
}

function vocabItem(word, index) {
  const cells = word.chars.map((c) => {
    const cell = { ch: c.trad, py: c.display, t: c.tone };
    if (c.simp !== c.trad) cell.s = c.simp;
    return cell;
  });
  const chip = wordChip(word);
  return {
    id: `v${String(index + 1).padStart(2, "0")}`,
    grp: "Words",
    en: word.en,
    py: word.py,
    cells,
    words: [chip],
    cues: [],
  };
}

function drillItem(kind, tag, prompt, en, py, note, cells, words, audio) {
  const item = { kind, tag, prompt, en, py, ...(note ? { note } : {}), cells, words };
  if (audio) item.audio = audio;
  return item;
}

function dedupe(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function toPlayerEntry(value) {
  const lineItems = value.lines.map(lineItem);
  const vocab = value.vocab.map(vocabItem);
  const phraseEn = [];
  const phraseZh = [];
  for (const item of lineItems) {
    const base = {
      prompt: item.en,
      en: item.en,
      py: item.py,
      note: item.note || "",
      cells: item.cells,
      words: item.words,
      audio: item.audio,
    };
    phraseEn.push(drillItem("en", "Phrase recall", base.prompt, base.en, base.py, base.note, base.cells, base.words, base.audio));
    phraseZh.push(drillItem("zh", "Phrase flip", base.prompt, base.en, base.py, base.note, base.cells, base.words, base.audio));
  }
  const phraseKey = (it) => `${it.en}\n${it.cells.map((c) => c.s || c.ch).join("")}`;
  const vocabEn = vocab.map((v) => drillItem("en", "Vocabulary recall", v.en, v.en, v.py, "", v.cells, v.words));
  const vocabZh = vocab.map((v) => drillItem("zh", "Vocabulary flip", v.en, v.en, v.py, "", v.cells, v.words));

  const entry = {
    schema: 1,
    id: value.id,
    kind: "conversation",
    script: "hans",
    source: "Conversation Practice",
    title: value.title,
    short: value.short,
    subtitle: value.subtitle,
    date: value.date,
    emoji: value.emoji,
    color: value.color,
    kick: "Conversation Practice · readable text first · audio optional",
    ...(value.focus ? { focus: value.focus } : {}),
    key: KEY,
    foot: FOOT,
    sections: [
      {
        type: "lines",
        title: "Lines",
        kick: "Tone-mark pinyin, English, and a word breakdown on every line",
        items: lineItems,
      },
      {
        type: "vocab",
        title: "Vocabulary",
        zh: { t: "生詞", s: "生词" },
        kick: "First-seen words. A repeated word stays one card.",
        items: vocab,
      },
      {
        type: "drill",
        title: "Vocabulary recall",
        lead: "Read the English. Say the Chinese. Then reveal characters, pinyin, and the meaning.",
        items: dedupe(vocabEn, (it) => `${it.en}\n${it.py}`),
      },
      {
        type: "drill",
        title: "Vocabulary flip",
        lead: "Read the characters. Say the English. Then reveal.",
        items: dedupe(vocabZh, (it) => `${it.en}\n${it.py}`),
      },
      {
        type: "drill",
        title: "Phrase recall",
        lead: "Read the English. Say the sentence. Then reveal the score, the dictionary pinyin, and each word.",
        items: dedupe(phraseEn, phraseKey),
      },
      {
        type: "drill",
        title: "Phrase flip",
        lead: "Read the characters. Say the English. Then reveal.",
        items: dedupe(phraseZh, phraseKey),
      },
    ],
  };
  return entry;
}

export function toIndexRow(value) {
  return {
    id: value.id,
    title: value.title,
    subtitle: value.subtitle,
    short: value.short,
    source: "Conversation Practice",
    kind: "conversation",
    date: value.date,
    emoji: value.emoji,
    color: value.color,
    tags: value.tags || ["conversation", value.date.slice(0, 10)],
  };
}
