import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { buildFromDisk, serialize } from "../phrasebook/build.mjs";
import { buildIndex, validateIndex } from "../phrasebook/extract.mjs";
import { cardHtml, shortMeaning } from "../phrasebook/card.mjs";
import { foldPinyin, searchEntries, stripPunct } from "../phrasebook/search.mjs";

const root = path.resolve(import.meta.dirname, "..");
const OLD = ["lm_b1_l01", "lm_b1_l02", "mftgu_s1_l01", "mftgu_s1_l02", "mftgu_s1_l03", "mftgu_s1_l04", "mftgu_s1_l05", "mftgu_s1_l06", "mftgu_s1_l07"];

function loadIndex() {
  return JSON.parse(fs.readFileSync(path.join(root, "phrasebook/index.json"), "utf8"));
}
function findEntry(index, simp, plain) {
  return index.entries.find((e) => stripPunct(e.simp) === simp && (!plain || e.pinyinPlain === plain));
}
function sourceIds(entry) {
  return [...new Set(entry.senses.flatMap((s) => s.sources.map((src) => src.id)))];
}

test("pinyin folding drops tones, numbers, spaces, and case", () => {
  const cases = [
    ["hǎo", "hao"],
    ["HǍO", "hao"],
    ["hao3", "hao"],
    ["ní hǎo", "nihao"],
    ["ni3 hao3", "nihao"],
    ["nǚ", "nv"],
    ["nv3", "nv"],
    ["nü3", "nv"],
    ["nu:3", "nv"],
    ["Zěnme", "zenme"],
    ["shen2me5", "shenme"],
    ["xǐ bu xǐhuan", "xibuxihuan"],
    ["Duì, wǒ yǒu", "duiwoyou"],
  ];
  for (const [input, expect] of cases) assert.equal(foldPinyin(input), expect, input);
});

test("fixture merges duplicates, keeps senses, and survives missing audio", () => {
  const lesson = {
    id: "fixture_lesson",
    kind: "textbook",
    title: "Fixture",
    short: "Fixture",
    source: "Textbook",
    date: "2026-01-01",
    sections: [
      { type: "vocab", title: "Vocabulary", items: [
        { id: "v1", grp: "Words 1-10", en: "good, fine", cells: [{ ch: "好", py: "hǎo", t: 3 }], audio: [{ src: "audio/missing.mp3", real: true, label: "好" }] },
        { id: "v2", grp: "Words 1-10", en: "at/in", cells: [{ ch: "在", py: "zài", t: 4 }] },
        { id: "v3", grp: "Names + supplementary", en: "Taiwan", cells: [{ ch: "臺", py: "Tái", t: 2, s: "台" }, { ch: "灣", py: "wān", t: 1, s: "湾" }] },
      ]},
      { type: "lines", title: "Dialogue", items: [
        { id: "d1", en: "Hello.", cells: [{ ch: "你", py: "Nǐ", t: 3 }, { ch: "好", py: "hǎo", t: 3, pz: "。" }] },
      ]},
    ],
  };
  const lesson2 = {
    id: "fixture_pod",
    kind: "podcast",
    title: "Pod",
    short: "Pod",
    source: "Podcast",
    date: "2026-02-01",
    sections: [{ type: "vocab", title: "Vocabulary", items: [
      { id: "v1", en: "good / OK", cells: [{ ch: "好", py: "hǎo", t: 3 }] },
      { id: "v2", en: "currently doing sth", cells: [{ ch: "在", py: "zài", t: 4 }] },
      { id: "v3", en: "Taiwan", cells: [{ ch: "台", py: "tái", t: 2 }, { ch: "灣", py: "wān", t: 1, s: "湾" }] },
    ]}],
  };
  const conversation = {
    id: "cp_fixture",
    kind: "conversation",
    script: "hans",
    title: "Fixture chat",
    short: "Fixture chat",
    source: "Conversation Practice",
    date: "2026-03-01",
    sections: [
      { type: "vocab", title: "Vocabulary", items: [
        { id: "v1", en: "tired", py: "lèi", cells: [{ ch: "累", py: "lèi", t: 4 }], words: [{ t: "累", py: "lèi", en: "tired" }] },
      ]},
      { type: "lines", title: "Lines", items: [
        { id: "s1", en: "I'm tired.", py: "Wǒ lèi le", note: "Change of state.", cells: [
          { ch: "我", py: "Wǒ", t: 3 }, { ch: "累", py: "lèi", t: 4 }, { ch: "了", py: "le", t: 5, pz: "。" },
        ], words: [
          { t: "我", py: "wǒ", en: "I; me" },
          { t: "累", py: "lèi", en: "tired" },
          { t: "了", py: "le", en: "change-of-state particle" },
        ]},
        { id: "s2", en: "Incorrect form.", py: "Wǒ shì lèi", note: "Incorrect. Do not say this.", cells: [
          { ch: "我", py: "Wǒ", t: 3 }, { ch: "是", py: "shì", t: 4 }, { ch: "累", py: "lèi", t: 4 },
        ], words: [{ t: "我", py: "wǒ", en: "I; me" }, { t: "是", py: "shì", en: "to be" }, { t: "累", py: "lèi", en: "tired" }] },
      ]},
      { type: "drill", title: "Phrase recall", items: [
        { tag: "Phrase recall", en: "I'm tired.", py: "Wǒ lèi le", cells: [
          { ch: "我", py: "Wǒ", t: 3 }, { ch: "累", py: "lèi", t: 4 }, { ch: "了", py: "le", t: 5 },
        ], words: [{ t: "我", py: "wǒ", en: "I; me" }] },
      ]},
    ],
  };
  const index = buildIndex({
    lessons: [
      { catalog: { id: "fixture_lesson", kind: "textbook", title: "Fixture", short: "Fixture", source: "Textbook", date: "2026-01-01" }, doc: lesson },
      { catalog: { id: "fixture_pod", kind: "podcast", title: "Pod", short: "Pod", source: "Podcast", date: "2026-02-01" }, doc: lesson2 },
    ],
    conversations: [
      { catalog: { id: "cp_fixture", kind: "conversation", title: "Fixture chat", short: "Fixture chat", source: "Conversation Practice", date: "2026-03-01" }, doc: conversation },
    ],
    fileExists: () => false,
  });
  const hao = findEntry(index, "好", "hao");
  assert.equal(hao.kind, "word");
  assert.equal(hao.audio, null);
  assert.ok(searchEntries(index, "hao3").some((e) => e.id === hao.id));
  assert.deepEqual(hao.senses.map((s) => s.gloss).sort(), ["good / OK", "good, fine"]);
  assert.deepEqual(sourceIds(hao).sort(), ["fixture_lesson", "fixture_pod"]);
  const zai = findEntry(index, "在", "zai");
  assert.equal(zai.senses.length, 2);
  const tw = findEntry(index, "台湾", "taiwan");
  assert.equal(stripPunct(tw.trad), "臺灣");
  assert.deepEqual(sourceIds(tw).sort(), ["fixture_lesson", "fixture_pod"]);
  assert.ok(searchEntries(index, "台").some((e) => e.id === tw.id));
  assert.ok(searchEntries(index, "臺").some((e) => e.id === tw.id));
  assert.ok(searchEntries(index, "台湾").some((e) => e.id === tw.id));
  const tired = findEntry(index, "我累了");
  assert.equal(tired.kind, "phrase");
  assert.equal(tired.senses[0].sources[0].href, "#/practice/cp_fixture");
  assert.equal(tired.senses[0].sources[0].script, "hans");
  assert.equal(tired.words.length, 3);
  assert.equal(index.inputs.conversations[0].drillsIndexed, 0);
  assert.equal(index.counts.incorrectExcluded, 1);
  assert.equal(findEntry(index, "我是累"), undefined);
  assert.equal(index.entries.some((e) => e.examples.some((ex) => stripPunct(ex.simp) === "我是累")), false);
  assert.equal(searchEntries(index, "BROTHER").length, 0);
  assert.equal(searchEntries(index, "zzzz-not-a-word").length, 0);
  assert.equal(searchEntries(index, "").length, index.entries.length);
  assert.equal(searchEntries(index, "???").length, 0);
  const broken = structuredClone(index);
  broken.entries[0].senses[0].sources[0].href = "#/lesson/missing";
  assert.throws(() => validateIndex(broken, () => false), /broken link/);
  assert.deepEqual(serialize(index), serialize(buildIndex({
    lessons: [
      { catalog: { id: "fixture_lesson", kind: "textbook", title: "Fixture", short: "Fixture", source: "Textbook", date: "2026-01-01" }, doc: lesson },
      { catalog: { id: "fixture_pod", kind: "podcast", title: "Pod", short: "Pod", source: "Podcast", date: "2026-02-01" }, doc: lesson2 },
    ],
    conversations: [
      { catalog: { id: "cp_fixture", kind: "conversation", title: "Fixture chat", short: "Fixture chat", source: "Conversation Practice", date: "2026-03-01" }, doc: conversation },
    ],
    fileExists: () => false,
  })));
});

test("committed index matches the generator", () => {
  execSync("node phrasebook/build.mjs --check", { cwd: root, stdio: "pipe" });
  const again = serialize(buildFromDisk(root));
  assert.equal(again, fs.readFileSync(path.join(root, "phrasebook/index.json"), "utf8"));
});

test("real index counts, merges, and conversation provenance", () => {
  const index = loadIndex();
  assert.equal(index.schema, 1);
  assert.equal(index.regen, "node phrasebook/build.mjs");
  assert.deepEqual(index.counts, {
    lessons: 9,
    conversations: 3,
    entries: 326,
    words: 148,
    phrases: 178,
    senses: 409,
    withAudio: 294,
    withExamples: 139,
    withBreakdown: 46,
    multiSource: 42,
    incorrectExcluded: 1,
  });
  assert.equal(index.charMapConflicts.length, 0);
  assert.deepEqual(index.sources.map((s) => s.id).sort(), [...OLD, "cp_2026_11_07", "cp_2026_11_07_smoking", "cp_2026_11_10_chat"].sort());
  const shoesIn = index.inputs.conversations.find((c) => c.id === "cp_2026_11_07");
  assert.equal(shoesIn.vocab, 44);
  assert.equal(shoesIn.lines, 27);
  assert.equal(shoesIn.drillsIndexed, 0);
  assert.equal(shoesIn.drillsSkipped, 140);
  assert.equal(shoesIn.script, "hans");
  const smoke = index.entries.find((e) => stripPunct(e.simp) === "你少抽烟");
  assert.equal(smoke.pinyin, "Nǐ shǎo chōu yān");
  assert.equal(smoke.senses[0].sources[0].href, "#/practice/cp_2026_11_07_smoking");
  assert.equal(smoke.audio, null);
  const cough = index.entries.find((e) => stripPunct(e.simp) === "抽烟会咳嗽");
  assert.match(cough.senses[0].sources[0].note, /fully Chinese version/);
  assert.match(cough.senses[0].sources[0].note, /抽烟会 cough/);

  const momo = index.entries.find((e) => stripPunct(e.simp) === "摸摸");
  assert.equal(momo.kind, "word");
  assert.equal(momo.senses[0].sources[0].href, "#/practice/cp_2026_11_10_chat");
  const haishi = index.entries.find((e) => stripPunct(e.simp) === "还是");
  assert.equal(haishi.kind, "word");
  assert.match(haishi.senses[0].gloss, /or/i);

  const shenme = findEntry(index, "什么", "shenme");
  assert.equal(shenme.kind, "word");
  assert.deepEqual(sourceIds(shenme).sort(), ["lm_b1_l01", "mftgu_s1_l04", "mftgu_s1_l05"]);
  assert.ok(shenme.senses.some((s) => s.gloss === "what"));
  assert.ok(shenme.senses.some((s) => s.gloss === "what (question pronoun)"));

  const zai = findEntry(index, "在", "zai");
  assert.ok(zai.senses.some((s) => s.gloss === "at/in"));
  assert.ok(zai.senses.some((s) => s.gloss.includes("currently doing")));

  const tw = findEntry(index, "台湾", "taiwan");
  assert.equal(stripPunct(tw.trad), "臺灣");
  assert.ok(sourceIds(tw).includes("lm_b1_l01"));
  assert.ok(sourceIds(tw).includes("mftgu_s1_l03"));

  const sentence = findEntry(index, "我累了", "woleile");
  assert.equal(sentence.kind, "phrase");
  assert.equal(sentence.pinyin, "Wǒ lèi le");
  assert.equal(sentence.words.map((w) => w.en).join("|").includes("tired"), true);
  const src = sentence.senses[0].sources[0];
  assert.equal(src.href, "#/practice/cp_2026_11_07");
  assert.equal(src.origin, "conversation");
  assert.equal(src.kind, "conversation");
  assert.equal(src.script, "hans");
  assert.equal(src.itemId, "s01");
  assert.equal(sentence.audio.src, "conversations/cp_2026_11_07/audio/s01.mp3");

  assert.equal(findEntry(index, "我是累", "woshilei"), undefined);
  assert.equal(searchEntries(index, "我是累").some((e) => stripPunct(e.simp) === "我是累" || e.kind === "phrase" && stripPunct(e.simp).includes("我是累")), false);
  for (const entry of index.entries) {
    assert.equal(entry.examples.some((ex) => stripPunct(ex.simp) === "我是累"), false);
    assert.equal(entry.senses.some((s) => s.gloss.startsWith("Incorrect")), false);
  }
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /data-status="incorrect"/);
  assert.match(app, /Do not learn this sentence/);

  const bi = findEntry(index, "逼", "bi");
  assert.match(bi.senses[0].gloss, /stand-in/);
  assert.equal(bi.audio, null);
  assert.equal(sourceIds(bi)[0], "cp_2026_11_07");
  assert.ok(searchEntries(index, "bi").some((e) => e.id === bi.id));

  const lei = findEntry(index, "累", "lei");
  assert.ok(sourceIds(lei).includes("mftgu_s1_l02"));
  assert.ok(sourceIds(lei).includes("cp_2026_11_07"));
  assert.match(lei.audio.src, /^lessons\/mftgu_s1_l02\//);

  for (const entry of index.entries) {
    for (const sense of entry.senses) {
      for (const source of sense.sources) assert.notEqual(source.sectionType, "drill");
    }
  }
});

test("search covers English, pinyin, hanzi, empty input, and no match", () => {
  const index = loadIndex();
  assert.ok(searchEntries(index, "shoes").some((e) => stripPunct(e.simp) === "鞋"));
  assert.equal(searchEntries(index, "shoes").some((e) => stripPunct(e.simp) === "但是"), false);
  assert.ok(searchEntries(index, "SHOES").some((e) => stripPunct(e.simp) === "鞋子" || stripPunct(e.simp) === "鞋"));
  assert.ok(searchEntries(index, "younger brother").some((e) => stripPunct(e.simp) === "弟弟"));
  assert.ok(searchEntries(index, "xie2").some((e) => stripPunct(e.simp) === "鞋"));
  assert.ok(searchEntries(index, "xié").some((e) => stripPunct(e.simp) === "鞋"));
  assert.ok(searchEntries(index, "hao3").some((e) => stripPunct(e.simp) === "好"));
  assert.ok(searchEntries(index, "ni3 hao3").some((e) => stripPunct(e.simp) === "你好"));
  const jiao = searchEntries(index, "脚").map((e) => e.id);
  const jiaoTrad = searchEntries(index, "腳").map((e) => e.id);
  assert.deepEqual(jiao, jiaoTrad);
  assert.ok(jiao.some((id) => id.includes("脚")));
  assert.equal(searchEntries(index, "zzzz-not-a-word").length, 0);
  assert.equal(searchEntries(index, "   ").length, index.entries.length);
  const phrases = searchEntries(index, "", { kind: "phrase" });
  assert.ok(phrases.every((e) => e.kind === "phrase"));
  assert.equal(phrases.length, index.counts.phrases);
  const onlyChat = searchEntries(index, "", { sourceId: "cp_2026_11_07" });
  assert.ok(onlyChat.every((e) => e.senses.some((s) => s.sources.some((src) => src.id === "cp_2026_11_07"))));
  assert.ok(onlyChat.some((e) => stripPunct(e.simp) === "我累了"));
  assert.equal(onlyChat.some((e) => stripPunct(e.simp) === "弟弟"), false);
});

test("every gloss, note, example, and link comes from a real source file", () => {
  const index = loadIndex();
  const raw = new Map();
  const read = (file) => {
    if (!raw.has(file)) raw.set(file, fs.readFileSync(path.join(root, file), "utf8"));
    return raw.get(file);
  };
  for (const entry of index.entries) {
    const pieces = [];
    for (const sense of entry.senses) {
      for (const src of sense.sources) {
        pieces.push([src, sense.gloss, src.note]);
        const file = src.origin === "conversation"
          ? `conversations/${src.id}/entry.json`
          : `lessons/${src.id}/lesson.json`;
        assert.equal(fs.existsSync(path.join(root, file)), true, file);
        const href = src.origin === "conversation" ? `#/practice/${src.id}` : `#/lesson/${src.id}`;
        assert.equal(src.href, href);
        assert.equal(/^https?:/i.test(src.href), false);
      }
    }
    for (const [src, gloss, note] of pieces) {
      const file = src.origin === "conversation"
        ? `conversations/${src.id}/entry.json`
        : `lessons/${src.id}/lesson.json`;
      const text = read(file);
      const glossNeedle = JSON.stringify(gloss).slice(1, -1);
      assert.equal(text.includes(glossNeedle), true, gloss);
      if (note) assert.equal(text.includes(JSON.stringify(note).slice(1, -1)), true, note);
    }
    for (const ex of entry.examples) {
      const file = ex.origin === "conversation"
        ? `conversations/${ex.sourceId}/entry.json`
        : `lessons/${ex.sourceId}/lesson.json`;
      const text = read(file);
      assert.equal(text.includes(JSON.stringify(ex.en).slice(1, -1)), true, ex.en);
      assert.equal(ex.href, ex.origin === "conversation" ? `#/practice/${ex.sourceId}` : `#/lesson/${ex.sourceId}`);
    }
    for (const word of entry.words) {
      const files = [...new Set(entry.senses.flatMap((sense) => sense.sources.map((src) =>
        src.origin === "conversation" ? `conversations/${src.id}/entry.json` : `lessons/${src.id}/lesson.json`)))];
      const needle = JSON.stringify(word.en).slice(1, -1);
      assert.equal(files.some((file) => read(file).includes(needle)), true, word.en);
    }
    if (entry.audio) {
      assert.equal(entry.audio.src.includes(".."), false);
      assert.equal(fs.existsSync(path.join(root, entry.audio.src)), true, entry.audio.src);
    }
  }
  const convOnly = index.entries.filter((e) => e.senses.every((s) => s.sources.every((src) => src.origin === "conversation")));
  for (const entry of convOnly) {
    const blob = JSON.stringify(entry);
    for (const banned of ["田佳森", "佳森", "Chunhua", "Gloria"]) assert.equal(blob.includes(banned), false, entry.id);
  }
});

test("list cards stay closed and keep the full meaning in the panel", () => {
  const long = "to want; going to; must; important; the rest of this gloss stays in the panel";
  const entry = {
    id: "pb-yao-要",
    kind: "word",
    trad: "要",
    simp: "要",
    pinyin: "yào",
    senses: [
      { gloss: long, sources: [{ kind: "conversation", short: "Nov 7 · New shoes", title: "New shoes", href: "#/practice/cp_2026_11_07", sectionTitle: "Vocabulary", note: "A long usage note that should not sit in the scan line." }] },
      { gloss: "to ask for", sources: [{ kind: "podcast", short: "MFTGU L06", title: "L06", href: "#/lesson/mftgu_s1_l06", sectionTitle: "Vocabulary", note: "" }] },
    ],
    words: [{ trad: "要", simp: "要", pinyin: "yào", en: "to want" }],
    examples: [{ simp: "我要茶。", trad: "我要茶。", pinyin: "Wǒ yào chá", en: "I want tea.", note: "", href: "#/practice/cp_2026_11_07", short: "Nov 7 · New shoes", words: [] }],
    audio: { src: "conversations/cp_2026_11_07/audio/v12.mp3", label: "要 · synthetic", real: false },
  };
  const html = cardHtml(entry);
  assert.equal(html.includes("<details open"), false);
  assert.match(html, /<summary>/);
  const summary = html.slice(html.indexOf("<summary>"), html.indexOf("</summary>"));
  const panel = html.slice(html.indexOf("</summary>"));
  assert.match(summary, /要/);
  assert.match(summary, /yào/);
  assert.match(summary, /to want…/);
  assert.match(summary, /\+1/);
  assert.equal(summary.includes(long), false);
  assert.equal(summary.includes("A long usage note"), false);
  assert.equal(summary.includes("I want tea."), false);
  assert.equal(summary.includes("phrase-play"), false);
  assert.equal(summary.includes("<a "), false);
  assert.match(panel, new RegExp(long.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(panel, /to ask for/);
  assert.match(panel, /A long usage note/);
  assert.match(panel, /I want tea\./);
  assert.match(panel, /#\/practice\/cp_2026_11_07/);
  assert.match(panel, /#\/lesson\/mftgu_s1_l06/);
  assert.match(panel, /class="phrase-play"/);
  assert.match(panel, /to want/);
  const opened = cardHtml(entry, entry.id);
  assert.match(opened, /<details open>/);
  assert.equal(shortMeaning("good, fine"), "good, fine");
  assert.equal(shortMeaning(long).endsWith("…"), true);
  assert.equal(shortMeaning(long).includes("the rest of this gloss"), false);
});

test("existing lesson ids, practice route, and phrasebook route stay in place", () => {
  const diff = execSync("git diff --name-only origin/main -- lessons conversations/cp_2026_11_07/entry.json scripts/build_conversation.py standalone", { cwd: root }).toString().trim();
  assert.equal(diff, "");
  const oldCatalog = JSON.parse(execSync("git show origin/main:conversations/index.json", { cwd: root }).toString());
  const nowCatalog = JSON.parse(fs.readFileSync(path.join(root, "conversations/index.json"), "utf8"));
  assert.deepEqual(nowCatalog.entries.find((e) => e.id === "cp_2026_11_07"), oldCatalog.entries.find((e) => e.id === "cp_2026_11_07"));
  assert.equal(nowCatalog.entries.filter((e) => e.id === "cp_2026_11_07_smoking").length, 1);
  assert.equal(nowCatalog.entries.filter((e) => e.id === "cp_2026_11_10_chat").length, 1);
  const lessons = JSON.parse(fs.readFileSync(path.join(root, "lessons/index.json"), "utf8"));
  assert.deepEqual(lessons.lessons.map((l) => l.id).sort(), [...OLD].sort());
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const route = app.slice(app.indexOf("async function route"));
  assert.match(route, /lessons\/\$\{encodeURIComponent\(id\)\}\/lesson\.json/);
  assert.match(route, /conversations\/\$\{encodeURIComponent\(id\)\}\/entry\.json/);
  assert.ok(route.includes("phrasebook"));
  assert.ok(route.indexOf("entry.json") > route.indexOf("lesson.json"));
  assert.equal(app.includes("田佳森"), false);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /href="#\/phrasebook"/);
  assert.match(html, /phrasebook\/page\.js/);
  assert.match(html, /width=device-width/);
  const css = fs.readFileSync(path.join(root, "phrasebook/page.css"), "utf8");
  assert.match(css, /\.phrase-q,\.phrase-srcpick\{[^}]*font-size:16px/);
  assert.match(css, /\.phrase-q,\.phrase-srcpick\{[^}]*min-height:44px/);
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(sw, /laoshi-20261110chat/);
  assert.match(sw, /phrasebook\/page\.js/);
  for (const file of ["phrasebook/page.js", "phrasebook/page.css", "phrasebook/SCHEMA.md", "README.md"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(text.includes("田佳森"), false, file);
    assert.equal(/https?:\/\/(?!jbierfeldt\.github\.io)/.test(text), false, file);
  }
});
