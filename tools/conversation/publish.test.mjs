import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assess, applyResult, REPO_ROOT } from "./publish.mjs";
import { validateAuthoring } from "./validate.mjs";
import { syllableCount } from "./pinyin.mjs";
import { UNAMBIGUOUS, AMBIGUOUS } from "./s2t.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "fixtures/sample-entry.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const cli = join(here, "publish.mjs");

function run(args, extra = {}) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: REPO_ROOT, ...extra });
}

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "laoshi-pub-"));
  mkdirSync(join(root, "conversations/cp_2026_11_07"), { recursive: true });
  mkdirSync(join(root, "lessons"), { recursive: true });
  const index = JSON.parse(readFileSync(join(REPO_ROOT, "conversations/index.json"), "utf8"));
  writeFileSync(join(root, "conversations/index.json"), JSON.stringify(index));
  writeFileSync(join(root, "conversations/cp_2026_11_07/entry.json"), "{\"id\":\"cp_2026_11_07\",\"sentinel\":true}\n");
  const lessons = JSON.parse(readFileSync(join(REPO_ROOT, "lessons/index.json"), "utf8"));
  writeFileSync(join(root, "lessons/index.json"), JSON.stringify(lessons));
  return root;
}

test("pinyin inventory and s2t maps load", () => {
  assert.ok(syllableCount() > 300);
  assert.equal(UNAMBIGUOUS["请"], "請");
  assert.equal(UNAMBIGUOUS["个"], "個");
  assert.ok(AMBIGUOUS["后"].includes("後"));
  for (const key of Object.keys(AMBIGUOUS)) assert.equal(UNAMBIGUOUS[key], undefined);
});

test("sample fixture is generic and publishes to the live player schema", () => {
  const raw = readFileSync(fixturePath, "utf8");
  for (const banned of ["@", "http://", "https://", "田佳森", "佳森", "Chunhua", "Gloria"]) {
    assert.equal(raw.includes(banned), false, banned);
  }
  const root = tempRoot();
  const result = assess(fixture, root);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.warnings.length, 0);
  const entry = result.entry;
  assert.equal(entry.schema, 1);
  assert.equal(entry.kind, "conversation");
  assert.equal(entry.script, "hans");
  assert.equal(entry.id, "cp_2026_01_15_tea");
  assert.equal(entry.h1, undefined);
  const lines = entry.sections.filter((s) => s.type === "lines").flatMap((s) => s.items);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].py, "Wǒ xiǎng hē chá");
  assert.equal(lines[0].note, "想 is to want. 喝 is to drink.");
  assert.equal(lines[0].audio, undefined);
  assert.equal(lines[1].cells.map((c) => c.ch).join(""), "請給我一杯茶");
  assert.equal(lines[1].cells.map((c) => c.s || c.ch).join(""), "请给我一杯茶");
  assert.equal(lines[2].words.find((w) => w.t === "多少").py, "duōshǎo");
  assert.equal(lines[2].cells.at(-1).pz, "？");
  for (const ln of lines) {
    assert.equal(ln.words.map((w) => w.t).join(""), ln.cells.map((c) => c.ch).join(""));
    assert.equal(ln.words.map((w) => w.s || w.t).join(""), ln.cells.map((c) => c.s || c.ch).join(""));
    for (const cell of ln.cells) {
      assert.equal([...cell.ch].length, 1);
      assert.equal(/\s/.test(cell.py), false);
      assert.equal(cell.t === 5, !/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(cell.py));
    }
    for (const word of ln.words) assert.ok(word.t && word.py && word.en);
  }
  const drills = entry.sections.filter((s) => s.type === "drill");
  assert.deepEqual(drills.map((s) => [s.title, s.items.length]), [
    ["Vocabulary recall", 12],
    ["Vocabulary flip", 12],
    ["Phrase recall", 3],
    ["Phrase flip", 3],
  ]);
  assert.equal(drills[0].items[0].kind, "en");
  assert.equal(drills[1].items[0].kind, "zh");
  assert.equal(JSON.stringify(entry).includes("\"audio\""), false);
});

test("dry-run writes nothing and --push is rejected", () => {
  const before = readFileSync(join(REPO_ROOT, "conversations/index.json"), "utf8");
  const shoes = readFileSync(join(REPO_ROOT, "conversations/cp_2026_11_07/entry.json"), "utf8");
  const ran = run([fixturePath]);
  assert.equal(ran.status, 0, ran.stdout + ran.stderr);
  assert.match(ran.stdout, /preflight ok/);
  assert.match(ran.stdout, /writes: 0/);
  assert.match(ran.stdout, /#\/practice\/cp_2026_01_15_tea/);
  assert.match(ran.stdout, /cp_2026_11_07: left untouched/);
  assert.match(ran.stdout, /publish: not performed/);
  assert.equal(readFileSync(join(REPO_ROOT, "conversations/index.json"), "utf8"), before);
  assert.equal(readFileSync(join(REPO_ROOT, "conversations/cp_2026_11_07/entry.json"), "utf8"), shoes);
  assert.equal(existsSync(join(REPO_ROOT, "conversations/cp_2026_01_15_tea")), false);
  const pushed = run([fixturePath, "--push"]);
  assert.equal(pushed.status, 2);
  assert.match(pushed.stderr, /unknown flag/);
});

test("apply is idempotent and does not change the Nov 7 entry", () => {
  const root = tempRoot();
  const shoesBefore = readFileSync(join(root, "conversations/cp_2026_11_07/entry.json"), "utf8");
  const lessonsBefore = readFileSync(join(root, "lessons/index.json"), "utf8");
  const first = run([fixturePath, "--apply", "--root", root]);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.match(first.stdout, /action: created/);
  const index = JSON.parse(readFileSync(join(root, "conversations/index.json"), "utf8"));
  assert.equal(index.entries.length, 2);
  assert.deepEqual(index.entries[0], JSON.parse(readFileSync(join(REPO_ROOT, "conversations/index.json"), "utf8")).entries[0]);
  assert.equal(index.entries.filter((e) => e.id === "cp_2026_01_15_tea").length, 1);
  assert.equal(readFileSync(join(root, "conversations/cp_2026_11_07/entry.json"), "utf8"), shoesBefore);
  assert.equal(readFileSync(join(root, "lessons/index.json"), "utf8"), lessonsBefore);
  assert.equal(existsSync(join(root, "conversations/cp_2026_01_15_tea/audio")), false);
  const entryText = readFileSync(join(root, "conversations/cp_2026_01_15_tea/entry.json"), "utf8");
  const second = run([fixturePath, "--apply", "--root", root]);
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.match(second.stdout, /action: unchanged/);
  assert.match(second.stdout, /writes: 0/);
  assert.equal(readFileSync(join(root, "conversations/cp_2026_01_15_tea/entry.json"), "utf8"), entryText);
  assert.equal(JSON.parse(readFileSync(join(root, "conversations/index.json"), "utf8")).entries.length, 2);

  const edited = structuredClone(fixture);
  edited.title = "Ordering tea again";
  const editedPath = join(root, "edited.json");
  writeFileSync(editedPath, JSON.stringify(edited));
  const third = run([editedPath, "--apply", "--root", root]);
  assert.equal(third.status, 0, third.stdout + third.stderr);
  assert.match(third.stdout, /action: updated/);
  const after = JSON.parse(readFileSync(join(root, "conversations/index.json"), "utf8"));
  assert.equal(after.entries.filter((e) => e.id === "cp_2026_01_15_tea").length, 1);
  assert.equal(after.entries.find((e) => e.id === "cp_2026_01_15_tea").title, "Ordering tea again");
  assert.equal(after.entries.find((e) => e.id === "cp_2026_11_07").title, "New shoes & playful replies");
  assert.equal(readFileSync(join(root, "conversations/cp_2026_11_07/entry.json"), "utf8"), shoesBefore);
  assert.deepEqual(readdirSync(join(root, "conversations/cp_2026_01_15_tea")), ["entry.json"]);
});

test("clear failures for required data, alignment, dates, ids, and collisions", () => {
  const bad = (mutate) => {
    const doc = structuredClone(fixture);
    mutate(doc);
    return validateAuthoring(doc);
  };
  assert.equal(bad((d) => { d.lines[0].en = " "; }).errors.some((e) => e.code === "missing_english"), true);
  assert.equal(bad((d) => { d.lines[0].words[1].en = ""; }).errors.some((e) => e.code === "missing_gloss"), true);
  assert.equal(bad((d) => { d.lines[0].words = d.lines[0].words.slice(0, 2); }).errors.some((e) => e.code === "token_alignment"), true);
  assert.equal(bad((d) => { d.lines[0].py = "Wǒ hǎo"; }).errors.some((e) => e.code === "pinyin_alignment"), true);
  assert.equal(bad((d) => { d.lines[0].words[0].py = "wo3"; }).errors.some((e) => e.code === "malformed_pinyin"), true);
  assert.equal(bad((d) => { d.date = "01/15/2026"; }).errors.some((e) => e.code === "malformed_date"), true);
  assert.equal(bad((d) => { d.date = "2026-02-29T12:00:00-05:00"; d.id = "cp_2026_02_29_tea"; }).errors.some((e) => e.code === "malformed_date"), true);
  assert.equal(bad((d) => { d.id = "tea"; }).errors.some((e) => e.code === "malformed_id"), true);
  assert.equal(bad((d) => { d.id = "cp_2026_01_16_tea"; }).errors.some((e) => e.code === "id_date_mismatch"), true);
  assert.equal(bad((d) => { d.id = "cp_2026_11_07"; d.date = "2026-11-07T12:00:00-05:00"; }).errors.some((e) => e.code === "reserved_id"), true);
  assert.equal(bad((d) => { d.lines[0].zh = "以后"; d.lines[0].py = "Yǐ hòu"; d.lines[0].words = [{ zh: "以后", py: "yǐhòu", en: "after" }]; }).errors.some((e) => e.code === "ambiguous_traditional" && e.message.includes("後")), true);
  assert.equal(bad((d) => { d.lines[1].words[2].en = "we"; }).errors.some((e) => e.code === "gloss_conflict"), true);
  assert.equal(bad((d) => { d.pinyin = "nope"; }).errors.some((e) => e.code === "unknown_field"), true);

  const dupLines = structuredClone(fixture);
  dupLines.lines.push(structuredClone(dupLines.lines[0]));
  dupLines.lines[3].id = "s04";
  const dup = validateAuthoring(dupLines);
  assert.equal(dup.ok, true, JSON.stringify(dup.errors));
  const built = assess(dupLines, tempRoot());
  const phrase = built.entry.sections.find((s) => s.title === "Phrase recall");
  assert.equal(phrase.items.length, 3);

  const audio = structuredClone(fixture);
  audio.lines[0].audio = [{ src: "audio/s01.mp3", label: "我想喝茶 · computer", real: false, voice: "HsiaoChen" }];
  assert.equal(validateAuthoring(audio).errors.some((e) => e.code === "audio_label"), true);
  audio.lines[0].audio[0].label = "我想喝茶 · synthetic";
  const withAudio = validateAuthoring(audio);
  assert.equal(withAudio.ok, true, JSON.stringify(withAudio.errors));
  const root = tempRoot();
  const applied = assess(audio, root);
  applyResult(applied);
  const written = JSON.parse(readFileSync(join(root, "conversations/cp_2026_01_15_tea/entry.json"), "utf8"));
  assert.equal(written.sections[0].items[0].audio[0].real, false);
  assert.match(written.sections[0].items[0].audio[0].label, /synthetic/);
  assert.equal(existsSync(join(root, "conversations/cp_2026_01_15_tea/audio/s01.mp3")), false);

  const collide = tempRoot();
  const lessons = JSON.parse(readFileSync(join(collide, "lessons/index.json"), "utf8"));
  lessons.lessons.push({ id: "cp_2026_01_15_tea" });
  writeFileSync(join(collide, "lessons/index.json"), JSON.stringify(lessons));
  assert.equal(assess(fixture, collide).errors.some((e) => e.code === "index_collision"), true);

  const messy = tempRoot();
  const catalog = JSON.parse(readFileSync(join(messy, "conversations/index.json"), "utf8"));
  catalog.entries.push(catalog.entries[0]);
  writeFileSync(join(messy, "conversations/index.json"), JSON.stringify(catalog));
  assert.equal(assess(fixture, messy).errors.some((e) => e.code === "index_collision"), true);
});

test("explicit traditional override is kept", () => {
  const doc = structuredClone(fixture);
  doc.lines = [{
    zh: "以后",
    trad: "以後",
    py: "Yǐ hòu",
    en: "Afterwards.",
    words: [{ zh: "以后", py: "yǐ hòu", en: "afterwards" }],
  }];
  const result = validateAuthoring(doc);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.lines[0].cells.map((c) => c.trad).join(""), "以後");
  assert.equal(result.value.lines[0].cells.map((c) => c.simp).join(""), "以后");
});

test("publisher source does not call the network, git, or a speech API", () => {
  const blob = ["publish.mjs", "build.mjs", "validate.mjs", "pinyin.mjs", "s2t.mjs"].map((name) => readFileSync(join(here, name), "utf8")).join("\n");
  for (const banned of ["edge-tts", "fetch(", "git push", "force-push", "child_process", "phrasebook/"]) {
    assert.equal(blob.includes(banned), false, banned);
  }
});
