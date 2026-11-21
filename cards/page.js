/** Flashcards (#/cards) and Settings (#/settings). Progress stays on this device. */
import { esc } from "../phrasebook/card.mjs";
import { formatGap, preview, schedule, staysInSession } from "./fsrs.mjs";
import { buildSession, dayKey, enabledIds, summarize } from "./queue.mjs";
import { normalizeSettings } from "./settings.mjs";
import { askToPersist, exportPayload, loadProgress, openStore, parseBackup, replaceProgress } from "./storage.mjs";
import { syncConfigured, syncNow } from "./sync.mjs";
import { hanziHtml, pinyinHtml } from "./tones.mjs";

const store = openStore();
let index = null;
let packDoc = null;
let session = null;
let clip = null;
let themeWatch = false;

function $(id) { return document.getElementById(id); }

function safeSrc(src) {
  return /^[a-zA-Z0-9_./-]+$/.test(src || "") && !src.includes("..") ? src : "";
}

function glosses(entry) {
  return (entry.senses || []).map((sense) => sense.gloss).filter(Boolean);
}

function cardHan(text) {
  return String(text || "").replace(/^[，。、,…\s]+|[，。、,…\s]+$/g, "");
}

function hanLen(text) {
  const n = [...String(text || "")].length;
  if (n <= 2) return "s";
  if (n <= 8) return "m";
  return "l";
}

function applyTheme(theme) {
  const systemDark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme !== "light" && systemDark);
  document.documentElement.classList.toggle("dark", !!dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#14161a" : "#212529");
}

async function readState() {
  const progress = await loadProgress(store);
  return progress;
}

async function saveSettings(settings) {
  const next = normalizeSettings({ ...settings, updatedAt: Date.now() });
  await store.putSettings(next);
  applyTheme(next.theme);
  return next;
}

async function loadCatalog() {
  if (index && packDoc) return;
  const [indexRes, packRes] = await Promise.all([
    fetch("phrasebook/index.json", { cache: "no-cache" }),
    fetch("phrasebook/packs.json", { cache: "no-cache" }),
  ]);
  if (!indexRes.ok) throw new Error(`phrasebook ${indexRes.status}`);
  if (!packRes.ok) throw new Error(`packs ${packRes.status}`);
  index = await indexRes.json();
  packDoc = await packRes.json();
}

function stopAudio() {
  if (clip) { clip.pause(); clip = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function playEntry(entry, settings) {
  stopAudio();
  if (window.au && !window.au.paused) window.au.pause();
  const src = safeSrc(entry.audio && entry.audio.src);
  if (src) {
    clip = new Audio(src);
    clip.play().catch(() => { if (settings.speech) speak(entry); });
    return;
  }
  if (settings.speech) speak(entry, settings);
}

function speak(entry) {
  if (!window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(entry.simp);
  utter.lang = "zh-CN";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function packLine(settings) {
  const on = (packDoc.packs || []).filter((pack) => pack.start || settings.packs[pack.id]);
  return on.map((pack) => pack.title).join(" · ");
}

function faceHtml(entry, settings, revealed) {
  const shown = cardHan(entry.simp);
  const zhFront = settings.direction !== "en-zh";
  const showZh = zhFront || revealed;
  const showPy = settings.showPinyin && showZh;
  const showEn = settings.direction === "en-zh" ? true : (settings.showEnglish || revealed);
  const main = glosses(entry)[0] || "";
  const han = showZh ? `<p class="han" data-len="${hanLen(shown)}">${hanziHtml(shown, entry.pinyin, settings.toneColors)}</p>` : "";
  const py = showPy ? `<p class="fc-py">${pinyinHtml(shown, entry.pinyin, settings.toneColors)}</p>` : "";
  const en = showEn ? `<p class="fc-en">${esc(main)}</p>` : "";
  const answerHidden = zhFront ? !settings.showEnglish : true;
  const hint = revealed ? "" : `<p class="fc-hint">${answerHidden ? (zhFront ? "Tap to show the English" : "Tap to show the Chinese") : "Tap to grade"}</p>`;
  return `${han}${py}${en}${hint}`;
}

function gradesHtml(card, now) {
  const next = preview(card, now);
  const rows = [["again", "Again"], ["hard", "Hard"], ["good", "Good"], ["easy", "Easy"]];
  return rows.map(([id, label]) => {
    const gap = formatGap(next[id].due - now);
    return `<button type="button" class="grade g-${id}" data-grade="${id}" aria-label="${label}, ${gap}"><span>${label}</span><small>${gap}</small></button>`;
  }).join("");
}

function dashHtml(progress, stats) {
  const settings = progress.settings;
  const note = store.volatile ? `<p class="fc-warn" role="status">This browser may clear saved cards. Export a backup from Settings.</p>` : "";
  const ready = stats.due + Math.min(stats.budget, stats.unseen);
  const lead = ready ? `${ready} to study` : "Caught up";
  return `<div class="fc">
    <p class="fc-kicker">${esc(packLine(settings))}</p>
    <h1>${lead}</h1>
    <div class="stats" aria-label="Study stats">
      <div class="stat"><b>${stats.due}</b><span>Due</span></div>
      <div class="stat"><b>${stats.budget}</b><span>New today</span></div>
      <div class="stat"><b>${stats.learned}</b><span>Learned</span></div>
      <div class="stat"><b>${stats.streak}</b><span>Streak</span></div>
    </div>
    ${note}
    <button type="button" class="fc-go" id="fc-start" ${ready ? "" : "disabled"}>${ready ? "Study" : "Nothing due"}</button>
    <p class="fc-quiet">Essentials stays on. More packs are in Settings.</p>
    <p class="fc-links"><a href="#/settings">Settings</a> · <a href="#/phrasebook">Phrasebook</a></p>
  </div>`;
}

function sessionHtml(progress) {
  const item = session.queue[0];
  const settings = progress.settings;
  const left = session.queue.length;
  if (!item) {
    return `<div class="fc">
      <h1>Done</h1>
      <p class="fc-quiet">Reviewed ${session.reviewed}. Again ${session.again}.</p>
      <div class="stats" aria-label="This sitting">
        <div class="stat"><b>${session.reviewed}</b><span>Reviewed</span></div>
        <div class="stat"><b>${session.again}</b><span>Again</span></div>
        <div class="stat"><b>${session.learnedNew}</b><span>New</span></div>
      </div>
      <button type="button" class="fc-go" id="fc-done">Back</button>
    </div>`;
  }
  const audio = item.entry.audio?.src || settings.speech;
  return `<div class="fc fc-run">
    <div class="fc-top">
      <span>${left} left</span>
      <button type="button" class="fc-text" id="fc-undo" ${session.undo ? "" : "disabled"}>Undo</button>
      <button type="button" class="fc-text" id="fc-end">End</button>
    </div>
    <div class="fc-toggles" role="group" aria-label="Card display">
      <button type="button" class="phrase-chip ${settings.showPinyin ? "on" : ""}" data-toggle="showPinyin">Pinyin</button>
      <button type="button" class="phrase-chip ${settings.toneColors ? "on" : ""}" data-toggle="toneColors">Tones</button>
      <button type="button" class="phrase-chip ${settings.showEnglish ? "on" : ""}" data-toggle="showEnglish">English</button>
      <button type="button" class="phrase-chip" data-toggle="direction">${settings.direction === "en-zh" ? "EN → 中" : "中 → EN"}</button>
    </div>
    <div class="fc-stage">
      <button type="button" class="fc-face" id="fc-face">${faceHtml(item.entry, settings, session.revealed)}</button>
      ${audio ? `<button type="button" class="fc-play" id="fc-play">Play</button>` : ""}
    </div>
    ${session.revealed ? `<div class="grades">${gradesHtml(item.card, Date.now())}</div>` : ""}
  </div>`;
}

function settingsHtml(settings, status) {
  const syncOn = syncConfigured(settings);
  return `<form class="fc fc-set" id="fc-set">
    <h1>Settings</h1>
    <fieldset>
      <legend>Study</legend>
      <label class="fc-field">New cards a day
        <input name="newPerDay" type="number" min="0" max="50" inputmode="numeric" value="${settings.newPerDay}">
      </label>
      <label class="fc-field">Direction
        <select name="direction">
          <option value="zh-en" ${settings.direction === "zh-en" ? "selected" : ""}>Chinese, then English</option>
          <option value="en-zh" ${settings.direction === "en-zh" ? "selected" : ""}>English, then Chinese</option>
        </select>
      </label>
    </fieldset>
    <fieldset>
      <legend>Show on the card</legend>
      <label class="fc-check"><input name="showPinyin" type="checkbox" ${settings.showPinyin ? "checked" : ""}> Pinyin</label>
      <label class="fc-check"><input name="toneColors" type="checkbox" ${settings.toneColors ? "checked" : ""}> Tone colors</label>
      <label class="fc-check"><input name="showEnglish" type="checkbox" ${settings.showEnglish ? "checked" : ""}> English before the answer</label>
      <label class="fc-check"><input name="speech" type="checkbox" ${settings.speech ? "checked" : ""}> Speak the word if there is no clip</label>
    </fieldset>
    <fieldset>
      <legend>Packs</legend>
      <p class="fc-quiet">Essentials stays on.</p>
      <label class="fc-check"><input type="checkbox" checked disabled> Essentials</label>
      <label class="fc-check"><input name="everyday" type="checkbox" ${settings.packs.everyday ? "checked" : ""}> Everyday</label>
      <label class="fc-check"><input name="phrases" type="checkbox" ${settings.packs.phrases ? "checked" : ""}> Phrases &amp; texting</label>
    </fieldset>
    <fieldset>
      <legend>Appearance</legend>
      <label class="fc-field">Theme
        <select name="theme">
          <option value="system" ${settings.theme === "system" ? "selected" : ""}>Match the phone</option>
          <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option>
          <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
        </select>
      </label>
    </fieldset>
    <fieldset>
      <legend>Backup</legend>
      <p class="fc-quiet">A JSON file you can keep or move to another phone.</p>
      <div class="fc-row">
        <button type="button" class="fc-text" id="fc-export">Export</button>
        <label class="fc-text fc-file">Import<input id="fc-import" type="file" accept="application/json,.json"></label>
      </div>
    </fieldset>
    <fieldset>
      <legend>Sync</legend>
      <p class="fc-quiet">Off until both fields are set. No account. ${syncOn ? "Ready." : "Not configured."}</p>
      <label class="fc-field">Sync URL
        <input name="syncUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://…" value="${esc(settings.syncUrl)}">
      </label>
      <label class="fc-field">Secret
        <input name="syncSecret" type="password" autocomplete="off" value="${esc(settings.syncSecret)}">
      </label>
      <button type="button" class="fc-text" id="fc-sync">Sync now</button>
    </fieldset>
    <p class="fc-status" id="fc-status" role="status">${esc(status || "")}</p>
    <p class="fc-links"><a href="#/cards">Back to cards</a></p>
  </form>`;
}

async function draw(which, status) {
  if (!/^#\/(cards|settings)\/?$/.test(location.hash || "")) return;
  const progress = await readState();
  applyTheme(progress.settings.theme);
  const app = $("app");
  if (!app) return;
  if (which === "settings") {
    app.innerHTML = settingsHtml(progress.settings, status);
    bindSettings(progress.settings);
    return;
  }
  if (session) {
    app.innerHTML = sessionHtml(progress);
    bindSession(progress);
    const item = session.queue[0];
    if (item && session.played !== item.entry.id) {
      session.played = item.entry.id;
      playEntry(item.entry, progress.settings);
    }
    return;
  }
  const packIds = enabledIds(packDoc, progress.settings);
  const stats = summarize({
    cards: progress.cards,
    packIds,
    studiedDays: progress.studiedDays,
    settings: progress.settings,
    now: Date.now(),
  });
  app.innerHTML = dashHtml(progress, stats);
  $("fc-start")?.addEventListener("click", () => startSession(progress));
}

function bindSession(progress) {
  $("fc-face")?.addEventListener("click", () => {
    if (!session || session.revealed) return;
    session.revealed = true;
    draw("cards");
  });
  $("fc-play")?.addEventListener("click", () => {
    const item = session?.queue[0];
    if (item) playEntry(item.entry, progress.settings);
  });
  $("fc-end")?.addEventListener("click", () => { stopAudio(); session = null; draw("cards"); });
  $("fc-done")?.addEventListener("click", () => { session = null; draw("cards"); });
  $("fc-undo")?.addEventListener("click", () => undo());
  document.querySelectorAll("[data-toggle]").forEach((btn) => btn.addEventListener("click", async () => {
    const key = btn.dataset.toggle;
    const settings = { ...progress.settings };
    if (key === "direction") settings.direction = settings.direction === "en-zh" ? "zh-en" : "en-zh";
    else settings[key] = !settings[key];
    progress.settings = await saveSettings(settings);
    draw("cards");
  }));
  document.querySelectorAll("[data-grade]").forEach((btn) => btn.addEventListener("click", () => grade(btn.dataset.grade)));
}

function settingsFromForm(form, previous) {
  const data = new FormData(form);
  return normalizeSettings({
    ...previous,
    newPerDay: data.get("newPerDay"),
    direction: data.get("direction"),
    showPinyin: data.get("showPinyin") === "on",
    toneColors: data.get("toneColors") === "on",
    showEnglish: data.get("showEnglish") === "on",
    speech: data.get("speech") === "on",
    packs: { everyday: data.get("everyday") === "on", phrases: data.get("phrases") === "on" },
    theme: data.get("theme"),
    syncUrl: data.get("syncUrl"),
    syncSecret: data.get("syncSecret"),
    updatedAt: previous.updatedAt,
  });
}

function bindSettings(settings) {
  const form = $("fc-set");
  form.addEventListener("submit", (event) => event.preventDefault());
  const persist = async () => saveSettings(settingsFromForm(form, settings)).then((next) => { settings = next; return next; });
  form.addEventListener("change", () => { persist(); });
  $("fc-export")?.addEventListener("click", async () => {
    await persist();
    const payload = await exportPayload(store);
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `laoshi-backup-${dayKey(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("Backup downloaded.");
  });
  $("fc-import")?.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      const ok = window.confirm(`Replace cards on this phone with ${parsed.cards.length} from the file?`);
      if (!ok) return;
      await replaceProgress(store, parsed);
      session = null;
      setStatus(`Imported ${parsed.cards.length} cards.`);
      draw("settings", `Imported ${parsed.cards.length} cards.`);
    } catch (err) {
      setStatus(err.message);
    }
  });
  $("fc-sync")?.addEventListener("click", async () => {
    const next = await persist();
    setStatus("Syncing…");
    const result = await syncNow(store, next);
    if (result.ok) setStatus(`Synced ${result.cards} cards.`);
    else if (result.reason === "off") setStatus("Add an https URL and a secret of 8 or more characters.");
    else if (result.reason === "offline") setStatus("Could not reach the sync URL.");
    else setStatus(`Sync failed (${result.reason}).`);
  });
}

function setStatus(text) {
  const node = $("fc-status");
  if (node) node.textContent = text;
}

async function startSession(progress) {
  const packIds = enabledIds(packDoc, progress.settings);
  const built = buildSession({
    entries: index.entries,
    cards: progress.cards,
    packIds,
    settings: progress.settings,
    now: Date.now(),
  });
  session = { queue: built.queue, revealed: false, reviewed: 0, again: 0, learnedNew: 0, undo: null, busy: false };
  draw("cards");
}

async function grade(rating) {
  if (!session || session.busy || !session.revealed) return;
  const item = session.queue[0];
  if (!item) return;
  session.busy = true;
  stopAudio();
  const now = Date.now();
  const before = item.card;
  const next = schedule(before, rating, now);
  const queueBefore = session.queue.slice();
  session.queue.shift();
  if (staysInSession(next)) session.queue.push({ entry: item.entry, card: next });
  const days = await store.getDays();
  const key = dayKey(now);
  const addedDay = !days.includes(key);
  if (addedDay) await store.putDays([...days, key]);
  await store.putCard(next);
  session.undo = { card: before, queue: queueBefore, reviewed: session.reviewed, again: session.again, learnedNew: session.learnedNew, addedDay };
  session.reviewed += 1;
  if (rating === "again") session.again += 1;
  if (before.state === "new") session.learnedNew += 1;
  session.revealed = false;
  session.busy = false;
  draw("cards");
}

async function undo() {
  if (!session?.undo) return;
  const snap = session.undo;
  await store.putCard(snap.card);
  if (snap.addedDay) {
    const days = await store.getDays();
    await store.putDays(days.filter((day) => day !== dayKey(Date.now())));
  }
  session.queue = snap.queue;
  session.reviewed = snap.reviewed;
  session.again = snap.again;
  session.learnedNew = snap.learnedNew;
  session.revealed = true;
  session.undo = null;
  draw("cards");
}

function onKey(event) {
  if (!/^#\/cards\/?$/.test(location.hash || "") || !session) return;
  const tag = (event.target && event.target.tagName) || "";
  if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag)) return;
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    if (!session.revealed) {
      session.revealed = true;
      draw("cards");
    }
    return;
  }
  const gradeOf = { "1": "again", "2": "hard", "3": "good", "4": "easy" }[event.key];
  if (gradeOf && session.revealed) {
    event.preventDefault();
    grade(gradeOf);
  }
}

async function renderStudy(which) {
  await loadCatalog();
  if (which === "settings") session = null;
  await draw(which === "settings" ? "settings" : "cards");
  window.scrollTo(0, 0);
}

if (!window.__studyKeys) {
  window.__studyKeys = true;
  document.addEventListener("keydown", onKey);
}

window.renderStudy = renderStudy;
window.dispatchEvent(new Event("study-ready"));

loadProgress(store).then((progress) => applyTheme(progress.settings.theme)).catch(() => {});
askToPersist();
if (!themeWatch && typeof matchMedia === "function") {
  themeWatch = true;
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    loadProgress(store).then((progress) => { if (progress.settings.theme === "system") applyTheme("system"); }).catch(() => {});
  });
}
