import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { blankCard, formatGap, schedule } from "../cards/fsrs.mjs";
import { buildSession, dayKey, enabledIds, streakFrom, summarize } from "../cards/queue.mjs";
import { hanziHtml, readingParts } from "../cards/tones.mjs";
import { normalizeSettings } from "../cards/settings.mjs";
import { createMemoryStore, exportPayload, parseBackup, replaceProgress } from "../cards/storage.mjs";
import { mergeState, publicSettings, syncConfigured } from "../cards/sync.mjs";
import { searchEntries, stripPunct } from "../phrasebook/search.mjs";

const root = path.resolve(import.meta.dirname, "..");
const now = new Date(2026, 10, 21, 12, 0, 0).getTime();

test("FSRS grades a new card, a second good, and a lapse", () => {
  for (const rating of ["again", "hard", "good", "easy"]) {
    const card = schedule(blankCard("x", now), rating, now);
    assert.ok(card.difficulty >= 1 && card.difficulty <= 10, rating);
    assert.ok(card.stability > 0, rating);
  }
  const easy = schedule(blankCard("x", now), "easy", now);
  assert.equal(easy.state, "review");
  assert.equal(easy.scheduledDays, 16);
  assert.equal(easy.due, now + 16 * 86400000);

  let good = schedule(blankCard("x", now), "good", now);
  assert.equal(good.state, "learning");
  assert.equal(good.due, now + 10 * 60000);
  const firstStability = good.stability;
  good = schedule(good, "good", now + 10 * 60000);
  assert.equal(good.state, "review");
  assert.ok(good.scheduledDays >= 1);
  assert.notEqual(good.stability, firstStability);

  const again = schedule(blankCard("x", now), "again", now);
  assert.equal(again.state, "learning");
  assert.equal(again.due, now + 60000);
  assert.equal(again.introduced, now);

  const lapsed = schedule(easy, "again", easy.due);
  assert.equal(lapsed.state, "relearning");
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.stability < easy.stability);
  assert.equal(formatGap(10 * 60000), "10m");
  assert.equal(formatGap(16 * 86400000), "16d");
  assert.throws(() => schedule(blankCard("x", now), "nope", now));
});

test("daily new-card limit, pack order, and streak", () => {
  const entries = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const settings = normalizeSettings({ newPerDay: 2 });
  const first = buildSession({ entries, cards: new Map(), packIds: ["a", "b", "c"], settings, now });
  assert.deepEqual(first.queue.map((item) => item.entry.id), ["a", "b"]);

  const cards = new Map();
  cards.set("b", { ...schedule(blankCard("b", 0), "easy", 0), due: now - 1000 });
  const second = buildSession({ entries, cards, packIds: ["a", "b", "c"], settings, now });
  assert.equal(second.queue[0].entry.id, "b");
  assert.equal(second.queue[0].card.state, "review");

  const filled = new Map();
  for (let i = 0; i < 10; i++) filled.set(`old${i}`, { id: `old${i}`, state: "review", introduced: now, due: now + 86400000 });
  const capped = buildSession({
    entries,
    cards: filled,
    packIds: ["a"],
    settings: normalizeSettings({ newPerDay: 10 }),
    now,
  });
  assert.equal(capped.budget, 0);
  assert.equal(capped.queue.length, 0);

  assert.equal(dayKey(now), "2026-11-21");
  assert.equal(streakFrom(["2026-11-19", "2026-11-20", "2026-11-21"], now), 3);
  assert.equal(streakFrom(["2026-11-19", "2026-11-20"], now), 2);
  assert.equal(streakFrom(["2026-11-19"], now), 0);

  const stats = summarize({
    cards,
    packIds: ["a", "b"],
    studiedDays: ["2026-11-20", "2026-11-21"],
    settings,
    now,
  });
  assert.equal(stats.learned, 1);
  assert.equal(stats.due, 1);
  assert.equal(stats.streak, 2);
  assert.equal(stats.unseen, 1);
});

test("tone colors follow the syllable, including unspaced pinyin", () => {
  assert.deepEqual(readingParts("你好", "Nǐ hǎo").map((part) => part.tone), [3, 3]);
  assert.equal(readingParts("你好", "Nǐ hǎo")[0].py, "Nǐ");
  assert.deepEqual(readingParts("妈", "mā").map((part) => part.tone), [1]);
  assert.deepEqual(readingParts("吗", "ma").map((part) => part.tone), [5]);
  assert.deepEqual(readingParts("外面", "wàimiàn").map((part) => part.tone), [4, 4]);
  const html = hanziHtml("你好", "nǐ hǎo", true);
  assert.match(html, /class="tone t3"/);
  assert.equal(hanziHtml("你好", "nǐ hǎo", false).includes("tone"), false);
});

test("packs start on essentials and keep texting out of that pack", () => {
  const packs = JSON.parse(fs.readFileSync(path.join(root, "phrasebook/packs.json"), "utf8"));
  const index = JSON.parse(fs.readFileSync(path.join(root, "phrasebook/index.json"), "utf8"));
  const known = new Set(index.entries.map((entry) => entry.id));
  const seen = new Set();
  for (const pack of packs.packs) {
    assert.ok(pack.ids.length > 0, pack.id);
    for (const id of pack.ids) {
      assert.ok(known.has(id), id);
      assert.equal(seen.has(id), false, id);
      seen.add(id);
    }
  }
  const bySimp = (simp) => index.entries.find((entry) => stripPunct(entry.simp) === simp);
  const essentials = new Set(packs.packs.find((pack) => pack.id === "essentials").ids);
  const phrases = new Set(packs.packs.find((pack) => pack.id === "phrases").ids);
  for (const word of ["我", "是", "你好", "什么", "一"]) assert.ok(essentials.has(bySimp(word).id), word);
  for (const word of ["亲亲", "举高高", "想得挺美", "不急", "慢慢来"]) {
    assert.ok(phrases.has(bySimp(word).id), word);
    assert.equal(essentials.has(bySimp(word).id), false, word);
  }
  for (const word of ["牛逼", "佳", "你叫李佳吻"]) assert.equal(seen.has(bySimp(word).id), false, word);
  const settings = normalizeSettings({});
  const on = enabledIds(packs, settings);
  assert.ok(on.includes(bySimp("我").id));
  assert.equal(on.includes(bySimp("亲亲").id), false);
  assert.ok(enabledIds(packs, normalizeSettings({ packs: { phrases: true } })).includes(bySimp("亲亲").id));
  assert.equal(packs.packs.find((pack) => pack.id === "essentials").start, true);
});

test("backup round trip and sync merge keep the local secret", async () => {
  const store = createMemoryStore();
  await store.putSettings(normalizeSettings({ newPerDay: 4, syncUrl: "https://example.test", syncSecret: "local-secret", updatedAt: 5 }));
  await store.putCard(schedule(blankCard("pb-wo-我", now), "good", now));
  await store.putDays(["2026-11-21"]);
  const parsed = parseBackup(JSON.stringify(await exportPayload(store)));
  assert.equal(parsed.cards.length, 1);
  assert.equal(parsed.cards[0].state, "learning");
  const other = createMemoryStore();
  await replaceProgress(other, parsed);
  assert.equal((await other.allCards()).length, 1);
  assert.equal((await other.getSettings()).newPerDay, 4);
  assert.throws(() => parseBackup("{}"));

  const merged = mergeState(
    { settings: { updatedAt: 1, syncUrl: "https://x", syncSecret: "secretsecret", newPerDay: 10 }, cards: [{ id: "a", updatedAt: 5, state: "review" }], studiedDays: ["2026-11-20"] },
    { settings: { updatedAt: 2, newPerDay: 20 }, cards: [{ id: "a", updatedAt: 4, state: "new" }, { id: "b", updatedAt: 3, state: "learning" }], studiedDays: ["2026-11-21"] },
  );
  assert.equal(merged.settings.newPerDay, 20);
  assert.equal(merged.settings.syncSecret, "secretsecret");
  assert.equal(merged.settings.syncUrl, "https://x");
  assert.equal(merged.cards.find((card) => card.id === "a").state, "review");
  assert.equal(merged.cards.length, 2);
  assert.deepEqual(merged.studiedDays, ["2026-11-20", "2026-11-21"]);
  assert.equal(syncConfigured({ syncUrl: "http://x", syncSecret: "12345678" }), false);
  assert.equal(syncConfigured({ syncUrl: "https://x.workers.dev", syncSecret: "short" }), false);
  assert.equal(syncConfigured({ syncUrl: "https://x.workers.dev/sync", syncSecret: "12345678" }), true);
  assert.equal(publicSettings({ syncSecret: "abcdefghi", newPerDay: 10 }).syncSecret, undefined);

  const index = { entries: [{ id: "a", kind: "word", senses: [] }, { id: "b", kind: "word", senses: [] }] };
  assert.deepEqual(searchEntries(index, "", { ids: new Set(["b"]) }).map((entry) => entry.id), ["b"]);
});

test("service worker shell includes the card modules", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  for (const file of ["cards/page.js", "cards/fsrs.mjs", "cards/tones.mjs", "phrasebook/packs.json", "tools/conversation/pinyin.mjs"]) {
    assert.ok(sw.includes(file), file);
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
});
