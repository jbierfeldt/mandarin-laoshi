import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const OLD = ["lm_b1_l01", "lm_b1_l02", "mftgu_s1_l01", "mftgu_s1_l02", "mftgu_s1_l03", "mftgu_s1_l04", "mftgu_s1_l05", "mftgu_s1_l06"];
const TONE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;

test("textbook and podcast lesson ids are unchanged", () => {
  const diff = execSync("git diff --name-only origin/main -- lessons", { cwd: root }).toString().trim();
  assert.equal(diff, "");
  const idx = JSON.parse(fs.readFileSync(path.join(root, "lessons/index.json"), "utf8"));
  assert.deepEqual(idx.lessons.map((l) => l.id).sort(), [...OLD].sort());
  for (const id of OLD) {
    const lesson = JSON.parse(fs.readFileSync(path.join(root, "lessons", id, "lesson.json"), "utf8"));
    assert.equal(lesson.id, id);
  }
});

test("Nov 7 entry is a separate conversation, not a lesson id", () => {
  const lessons = JSON.parse(fs.readFileSync(path.join(root, "lessons/index.json"), "utf8"));
  assert.equal(lessons.lessons.some((l) => l.id === "cp_2026_11_07" || l.kind === "conversation"), false);
  const conv = JSON.parse(fs.readFileSync(path.join(root, "conversations/index.json"), "utf8"));
  assert.equal(conv.entries.length, 1);
  const entry = conv.entries[0];
  assert.equal(entry.id, "cp_2026_11_07");
  assert.equal(entry.title, "New shoes & playful replies");
  assert.equal(entry.source, "Conversation Practice");
  assert.equal(entry.kind, "conversation");
  assert.ok(entry.date.startsWith("2026-11-07"));
});

test("every example has tone-mark pinyin, English, and a word breakdown", () => {
  const entry = JSON.parse(fs.readFileSync(path.join(root, "conversations/cp_2026_11_07/entry.json"), "utf8"));
  assert.equal(entry.id, "cp_2026_11_07");
  assert.equal(entry.script, "hans");
  assert.equal(entry.kind, "conversation");
  const lines = entry.sections.filter((s) => s.type === "lines").flatMap((s) => s.items);
  assert.equal(lines[0].cells.filter((c) => c.ch).map((c) => c.s || c.ch).join(""), "我累了");
  const trad = lines.map((ln) => ln.cells.filter((c) => c.ch).map((c) => c.ch).join("")).join("\n");
  const simp = lines.map((ln) => ln.cells.map((c) => ("pu" in c ? c.pu : (c.s || c.ch) + (c.pz || ""))).join("")).join("\n");
  for (const phrase of ["我有點累", "但是你有腳", "你也有腳", "你的腳很好看", "腳可以換鞋", "我喜歡我的新棕色鞋子", "你也喜歡嗎", "我也喜歡你", "我沒有腳", "見到你就會晃的尾巴", "你怎麼知道我喜不喜歡", "這個句子聽起來很怪"]) {
    assert.ok(trad.includes(phrase), phrase);
  }
  assert.ok(simp.includes("我喜欢猫、海豚、棕色的新鞋和你"));
  for (const ln of lines) {
    assert.ok(ln.en && ln.note, ln.id);
    assert.ok(TONE.test(ln.py), ln.id + " " + ln.py);
    assert.equal(ln.words.map((w) => w.t).join(""), ln.cells.filter((c) => c.ch).map((c) => c.ch).join(""), ln.id);
    for (const cell of ln.cells) {
      if (!cell.ch) continue;
      assert.equal([...cell.ch].length, 1, cell.ch);
      assert.ok(cell.py && !/\s/.test(cell.py), ln.id);
      assert.equal(TONE.test(cell.py), cell.t !== 5, cell.py);
    }
    for (const word of ln.words) assert.ok(word.py && word.en && word.t, ln.id);
    assert.equal(ln.audio[0].real, false);
    assert.match(ln.audio[0].label, /synthetic/);
    const file = path.join(root, "conversations/cp_2026_11_07", ln.audio[0].src);
    const buf = fs.readFileSync(file);
    assert.ok(buf.length > 800, file);
    assert.ok(buf.subarray(0, 3).toString() === "ID3" || buf[0] === 0xff);
  }
  const huan = lines.flatMap((ln) => ln.cells).filter((c) => c.ch === "歡");
  assert.ok(huan.length > 0);
  assert.ok(huan.every((c) => c.t === 5 && c.py === "huan"));
  const blob = JSON.stringify(entry);
  for (const needle of ["Anonymized wording", "屄", "xǐhuan", "wingman", "Fragment", "Change of state", "I like you too", "You like them too", "a little", "to force"]) {
    assert.ok(blob.includes(needle), needle);
  }
  for (const banned of ["田佳森", "佳森", "Chunhua", "Gloria", "王明文", "@", "http://", "https://"]) {
    assert.equal(blob.includes(banned), false, banned);
  }
});

test("drills recall both directions and skip the incorrect 是 sentence", () => {
  const entry = JSON.parse(fs.readFileSync(path.join(root, "conversations/cp_2026_11_07/entry.json"), "utf8"));
  const drills = entry.sections.filter((s) => s.type === "drill");
  const tags = drills.map((d) => `${d.items[0].kind}:${d.items[0].tag}`);
  assert.ok(tags.includes("en:Vocabulary recall"));
  assert.ok(tags.includes("zh:Vocabulary flip"));
  assert.ok(tags.includes("en:Phrase recall"));
  assert.ok(tags.includes("zh:Phrase flip"));
  for (const drill of drills) {
    assert.ok(drill.items.length > 5);
    for (const item of drill.items) {
      assert.equal(item.note.startsWith("Incorrect"), false);
      assert.ok(item.cells.length && item.words.length && item.en && item.py);
      assert.equal(item.audio[0].real, false);
    }
  }
});

test("new files contain no images or contact details", () => {
  const bannedExt = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".svg"]);
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else assert.equal(bannedExt.has(path.extname(name).toLowerCase()), false, full);
    }
  }
  walk(path.join(root, "conversations"));
  walk(path.join(root, "standalone"));
});

test("standalone HTML is self-contained", () => {
  const html = fs.readFileSync(path.join(root, "standalone/2026-11-07-new-shoes.html"), "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.equal(/<script\b[^>]*\bsrc=/.test(html), false);
  assert.equal(/<link\b[^>]*stylesheet/.test(html), false);
  assert.ok(html.includes("我累了"));
  assert.ok(html.includes("Anonymized wording"));
  assert.ok(html.includes("data:audio/mpeg;base64,"));
  assert.equal(/<img\b/i.test(html), false);
  assert.equal(html.includes("田佳森"), false);
  assert.ok(html.includes("id=\"fpb\""));
  assert.ok(html.includes("id=\"dbtn\""));
});

test("practice route stays out of the lesson loader", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.match(app, /#\/practice/);
  assert.match(app, /conversations\//);
  assert.match(app, /case"drill"/);
  assert.equal(app.includes("田佳森"), false);
});
