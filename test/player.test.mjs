import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const BASE = "https://jbierfeldt.github.io/mandarin-laoshi/";
const KEY = "audio/Tl.mp3";

function lessonSrcs(id) {
  const lesson = JSON.parse(fs.readFileSync(path.join(root, "lessons", id, "lesson.json"), "utf8"));
  const srcs = new Set();
  for (const section of lesson.sections) {
    for (const item of section.items || []) {
      for (const clip of item.audio || []) srcs.add(clip.src);
    }
  }
  return srcs;
}

test("lesson 08 and 09 reuse relative audio keys for different files", () => {
  const a = lessonSrcs("mftgu_s1_l08");
  const b = lessonSrcs("mftgu_s1_l09");
  const shared = [...a].filter((src) => b.has(src));
  assert.ok(shared.includes(KEY));
  const size = (id) => fs.statSync(path.join(root, "lessons", id, KEY)).size;
  assert.notEqual(size("mftgu_s1_l08"), size("mftgu_s1_l09"));
});

function loadPlay() {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const start = app.indexOf("const mark=on=>");
  const end = app.indexOf("function seek(");
  assert.ok(start > 0 && end > start);
  const player = app.slice(start, end);
  assert.match(player, /abs\(au\.src\)===abs\(url\)/);
  assert.equal(player.includes("if(curK!==k)"), false);
  let sets = 0;
  const au = {
    _src: "",
    paused: true,
    sets: 0,
    get src() { return this._src; },
    set src(v) {
      sets += 1;
      this.sets = sets;
      this._src = v ? new URL(v, BASE).href : "";
    },
    removeAttribute(name) { if (name === "src") this.src = ""; },
    load() {},
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
  const context = vm.createContext({
    au,
    URL,
    document: { baseURI: BASE, body: { classList: { add() {}, remove() {} } } },
    navigator: {},
  });
  vm.runInContext(`
"use strict";
let A = {}, LBL = {}, curK = null, curEl = null, rate = 1;
const $ = () => ({ textContent: "", classList: { add() {}, remove() {} } });
${player}
globalThis.tap = (k) => play(k, { classList: { toggle() {} } });
globalThis.read = () => ({ curK, src: au.src, paused: au.paused, sets: au.sets });
globalThis.useLesson = (id) => { const key = ${JSON.stringify(KEY)}; A = { [key]: "lessons/" + id + "/" + key }; LBL = { [key]: id }; };
`, context);
  return { tap: context.tap, read: context.read, useLesson: context.useLesson };
}

test("a reused relative key loads the new lesson URL and a repeat does not restart", () => {
  const player = loadPlay();
  player.useLesson("mftgu_s1_l08");
  player.tap(KEY);
  const first = player.read();
  assert.match(first.src, /\/lessons\/mftgu_s1_l08\/audio\/Tl\.mp3$/);
  assert.equal(first.sets, 1);
  assert.equal(first.paused, false);
  player.tap(KEY);
  assert.equal(player.read().paused, true);
  assert.equal(player.read().sets, 1);
  player.tap(KEY);
  const resumed = player.read();
  assert.equal(resumed.paused, false);
  assert.equal(resumed.sets, 1, "resuming the same resolved URL reloads the clip");
  player.useLesson("mftgu_s1_l09");
  player.tap(KEY);
  const second = player.read();
  assert.match(second.src, /\/lessons\/mftgu_s1_l09\/audio\/Tl\.mp3$/);
  assert.equal(second.curK, KEY);
  assert.equal(second.sets, 2);
  assert.doesNotMatch(second.src, /mftgu_s1_l08/);
});

test("renderLesson clears the shared player before the next lesson reuses keys", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const body = app.slice(app.indexOf("function renderLesson("), app.indexOf("async function route("));
  assert.ok(body.indexOf("curK=null") < body.indexOf("A={}"));
  assert.ok(body.indexOf("curEl=null") < body.indexOf("A={}"));
  assert.match(body, /au\.pause\(\)/);
  assert.match(body, /classList\.remove\("show"\)/);
  assert.match(body, /removeAttribute\("src"\)/);
  assert.match(body, /au\.load\(\)/);
});
