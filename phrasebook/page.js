/** Phrasebook screen for #/phrasebook. Search logic lives in search.mjs. */
import { searchEntries } from "./search.mjs";

const state = { q: "", kind: "all", sourceId: "", focus: "" };
let index = null;
let clip = null;
let clipBtn = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function safeHref(href) {
  return /^#\/(lesson|practice)\/[A-Za-z0-9_.~%-]+$/.test(href) ? href : "#/";
}

function safeSrc(src) {
  return /^[a-zA-Z0-9_./-]+$/.test(src || "") && !src.includes("..") ? src : "";
}

function kindLabel(kind) {
  if (kind === "textbook") return "Class lesson";
  if (kind === "podcast") return "Podcast";
  if (kind === "conversation") return "Conversation";
  return kind || "";
}

async function loadIndex() {
  if (index) return index;
  const res = await fetch("phrasebook/index.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`phrasebook/index.json ${res.status}`);
  index = await res.json();
  return index;
}

function wordsHtml(words) {
  if (!words || !words.length) return "";
  return `<ul class="phrase-bits">${words.map((word) => {
    const trad = word.trad && word.trad !== word.simp ? `<span class="phrase-bit-trad">${esc(word.trad)}</span>` : "";
    return `<li><span class="phrase-bit-hz">${esc(word.simp)}</span>${trad}<span class="phrase-bit-py">${esc(word.pinyin)}</span><span class="phrase-bit-en">${esc(word.en)}</span></li>`;
  }).join("")}</ul>`;
}

function cardHtml(entry) {
  const trad = entry.trad !== entry.simp ? `<div class="phrase-trad">Traditional: ${esc(entry.trad)}</div>` : "";
  const senses = entry.senses.map((sense) => {
    const sources = sense.sources.map((src) => {
      const where = [kindLabel(src.kind), src.sectionTitle].filter(Boolean).join(" · ");
      const note = src.note ? `<p class="phrase-note">${esc(src.note)}</p>` : "";
      return `<li><a href="${safeHref(src.href)}">${esc(src.short || src.title)}</a><span class="phrase-meta">${esc(where)}</span>${note}</li>`;
    }).join("");
    return `<p class="phrase-en">${esc(sense.gloss)}</p><ul class="phrase-srcs">${sources}</ul>`;
  }).join("");
  const examples = entry.examples && entry.examples.length ? `<h3 class="phrase-exh">Examples from the lessons</h3>${entry.examples.map((ex) => {
    const note = ex.note ? `<p class="phrase-note">${esc(ex.note)}</p>` : "";
    return `<div class="phrase-ex"><a href="${safeHref(ex.href)}">${esc(ex.short || "")}</a><div class="phrase-simp" style="font-size:22px">${esc(ex.simp)}</div><div class="phrase-py">${esc(ex.pinyin)}</div><div>${esc(ex.en)}</div>${wordsHtml(ex.words)}${note}</div>`;
  }).join("")}` : "";
  const src = safeSrc(entry.audio && entry.audio.src);
  const audio = src ? `<button type="button" class="phrase-play" data-src="${esc(src)}">Play clip</button><span class="phrase-clip">${esc(entry.audio.label || (entry.audio.real ? "Lesson clip" : "Computer voice"))}</span>` : "";
  const focus = state.focus === entry.id ? " phrase-focus" : "";
  return `<article class="phrase-card${focus}" id="${esc(entry.id)}" data-kind="${esc(entry.kind)}"><div class="phrase-simp">${esc(entry.simp)}<span class="phrase-kind">${entry.kind === "phrase" ? "Phrase" : "Word"}</span></div>${trad}<div class="phrase-py">${esc(entry.pinyin)}</div>${wordsHtml(entry.words)}${senses}${examples}${audio}</article>`;
}

function drawList() {
  const list = document.getElementById("phrase-list");
  const count = document.getElementById("phrase-count");
  if (!list || !index) return;
  const shown = searchEntries(index, state.q, { kind: state.kind, sourceId: state.sourceId });
  count.textContent = shown.length ? `${shown.length} shown` : "";
  if (!shown.length) {
    list.innerHTML = `<p class="phrase-empty" role="status">Nothing in your lessons matches that. Try English, pinyin with or without tone marks, or Chinese characters.</p>`;
    return;
  }
  list.innerHTML = shown.map(cardHtml).join("");
  document.querySelectorAll("#phrase-kinds .phrase-chip").forEach((btn) => btn.classList.toggle("on", btn.dataset.kind === state.kind));
  if (state.focus) {
    const el = document.getElementById(state.focus);
    if (el) el.scrollIntoView({ block: "nearest" });
  }
}

function sourceOptions(data) {
  const groups = [
    ["textbook", "Class lessons"],
    ["podcast", "Podcast"],
    ["conversation", "Conversation"],
  ];
  const byKind = new Map(groups.map(([kind]) => [kind, []]));
  const other = [];
  for (const src of data.sources || []) {
    if (byKind.has(src.kind)) byKind.get(src.kind).push(src);
    else other.push(src);
  }
  const opts = [`<option value="">All sources</option>`];
  for (const [kind, label] of groups) {
    const rows = byKind.get(kind) || [];
    if (!rows.length) continue;
    opts.push(`<optgroup label="${esc(label)}">${rows.map((src) => `<option value="${esc(src.id)}">${esc(src.short || src.title)}</option>`).join("")}</optgroup>`);
  }
  if (other.length) opts.push(`<optgroup label="Other">${other.map((src) => `<option value="${esc(src.id)}">${esc(src.short || src.title)}</option>`).join("")}</optgroup>`);
  return opts.join("");
}

function drawShell() {
  const counts = index.counts || {};
  const conv = counts.conversations === 1 ? "1 conversation" : `${counts.conversations || 0} conversations`;
  const app = document.getElementById("app");
  app.innerHTML = `<div class="phrase"><p class="phrase-intro">Only words and phrases from your class lessons, podcast lessons, and conversation notes. Not a full dictionary, and not a score of what you have memorized. ${esc(counts.words)} words and ${esc(counts.phrases)} phrases from ${esc(counts.lessons)} lessons and ${esc(conv)}.</p>
  <div class="phrase-bar"><label class="phrase-sr" for="phrase-q">Search words and phrases</label>
  <input id="phrase-q" class="phrase-q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="English, pinyin, or characters" value="${esc(state.q)}">
  <div class="phrase-chips" id="phrase-kinds"><button type="button" class="phrase-chip" data-kind="all">All</button><button type="button" class="phrase-chip" data-kind="word">Words</button><button type="button" class="phrase-chip" data-kind="phrase">Phrases</button></div>
  <label class="phrase-sr" for="phrase-src">Source</label>
  <select id="phrase-src" class="phrase-srcpick">${sourceOptions(index)}</select>
  <p class="phrase-count" id="phrase-count" aria-live="polite"></p></div>
  <div id="phrase-list"></div></div>`;
  const select = document.getElementById("phrase-src");
  select.value = state.sourceId;
  document.getElementById("phrase-q").addEventListener("input", (event) => {
    state.q = event.target.value;
    state.focus = "";
    drawList();
  });
  select.addEventListener("change", () => {
    state.sourceId = select.value;
    state.focus = "";
    drawList();
  });
  document.getElementById("phrase-kinds").addEventListener("click", (event) => {
    const btn = event.target.closest(".phrase-chip");
    if (!btn) return;
    state.kind = btn.dataset.kind || "all";
    state.focus = "";
    drawList();
  });
  drawList();
}

function stopClip() {
  if (clip) clip.pause();
  if (clipBtn) clipBtn.textContent = "Play clip";
  clip = null;
  clipBtn = null;
}

function toggleClip(src, btn) {
  if (window.au && !window.au.paused) window.au.pause();
  if (clip && clipBtn === btn && !clip.paused) {
    stopClip();
    return;
  }
  stopClip();
  clip = new Audio(src);
  clipBtn = btn;
  btn.textContent = "Stop";
  clip.onended = () => { if (clipBtn === btn) btn.textContent = "Play clip"; };
  clip.play().catch(() => { if (clipBtn === btn) btn.textContent = "Play clip"; });
}

if (!window.__phrasebookClicks) {
  window.__phrasebookClicks = true;
  document.getElementById("app").addEventListener("click", (event) => {
    const btn = event.target.closest(".phrase-play");
    if (!btn) return;
    event.stopPropagation();
    const src = safeSrc(btn.dataset.src);
    if (src) toggleClip(src, btn);
  });
}

window.renderPhrasebook = async function renderPhrasebook(focus) {
  if (focus) {
    state.q = "";
    state.kind = "all";
    state.sourceId = "";
    state.focus = focus;
  }
  await loadIndex();
  if (!/^#\/phrasebook(?:\/|$)/.test(location.hash || "")) return;
  if (!document.getElementById("phrase-q")) drawShell();
  else drawList();
  if (state.focus && !document.getElementById(state.focus)) {
    const list = document.getElementById("phrase-list");
    if (list && state.q === "" && state.kind === "all" && state.sourceId === "") {
      list.insertAdjacentHTML("afterbegin", `<p class="phrase-empty">That entry is not in the phrasebook.</p>`);
    }
  }
};

window.dispatchEvent(new Event("phrasebook-ready"));
