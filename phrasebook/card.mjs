/** Compact phrasebook row. The closed summary is the scan line. The panel keeps every field. */

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function shortMeaning(gloss, max = 42) {
  const text = String(gloss || "").replace(/\s+/g, " ").trim();
  const clause = text.split(/[;；]/)[0].trim();
  let base = clause;
  if (base.length > max) {
    const slice = base.slice(0, max);
    const breakAt = Math.max(slice.lastIndexOf(","), slice.lastIndexOf(" "));
    base = (breakAt >= 16 ? slice.slice(0, breakAt) : slice).replace(/[\s,:/–—-]+$/, "");
  }
  return base === text ? base : `${base}…`;
}

function kindLabel(kind) {
  if (kind === "textbook") return "Class lesson";
  if (kind === "podcast") return "Podcast";
  if (kind === "conversation") return "Conversation";
  return kind || "";
}

function safeHref(href) {
  return /^#\/(lesson|practice)\/[A-Za-z0-9_.~%-]+$/.test(href) ? href : "#/";
}

function safeSrc(src) {
  return /^[a-zA-Z0-9_./-]+$/.test(src || "") && !src.includes("..") ? src : "";
}

function wordsHtml(words) {
  if (!words || !words.length) return "";
  return `<ul class="phrase-bits">${words.map((word) => {
    const trad = word.trad && word.trad !== word.simp ? `<span class="phrase-bit-trad">${esc(word.trad)}</span>` : "";
    return `<li><span class="phrase-bit-hz">${esc(word.simp)}</span>${trad}<span class="phrase-bit-py">${esc(word.pinyin)}</span><span class="phrase-bit-en">${esc(word.en)}</span></li>`;
  }).join("")}</ul>`;
}

export function cardHtml(entry, focusId = "") {
  const senses = entry.senses || [];
  const first = senses[0]?.gloss || "";
  const summaryEn = shortMeaning(first);
  const extra = Math.max(0, senses.length - 1);
  const more = extra ? `<span class="phrase-extra">+${extra}</span>` : "";
  const trad = entry.trad && entry.trad !== entry.simp ? `<p class="phrase-trad">Traditional: ${esc(entry.trad)}</p>` : "";
  const senseHtml = senses.map((sense) => {
    const sources = (sense.sources || []).map((src) => {
      const where = [kindLabel(src.kind), src.sectionTitle].filter(Boolean).join(" · ");
      const note = src.note ? `<p class="phrase-note">${esc(src.note)}</p>` : "";
      return `<li><a href="${safeHref(src.href)}">${esc(src.short || src.title)}</a><span class="phrase-meta">${esc(where)}</span>${note}</li>`;
    }).join("");
    return `<p class="phrase-en">${esc(sense.gloss)}</p><ul class="phrase-srcs">${sources}</ul>`;
  }).join("");
  const examples = entry.examples && entry.examples.length ? `<h3 class="phrase-exh">Examples from the lessons</h3>${entry.examples.map((ex) => {
    const note = ex.note ? `<p class="phrase-note">${esc(ex.note)}</p>` : "";
    return `<div class="phrase-ex"><a href="${safeHref(ex.href)}">${esc(ex.short || "")}</a><div class="phrase-ex-hz">${esc(ex.simp)}</div><div class="phrase-py">${esc(ex.pinyin)}</div><div>${esc(ex.en)}</div>${wordsHtml(ex.words)}${note}</div>`;
  }).join("")}` : "";
  const src = safeSrc(entry.audio && entry.audio.src);
  const audio = src ? `<p class="phrase-audio"><button type="button" class="phrase-play" data-src="${esc(src)}">Play clip</button><span class="phrase-clip">${esc(entry.audio.label || (entry.audio.real ? "Lesson clip" : "Computer voice"))}</span></p>` : "";
  const open = focusId && focusId === entry.id ? " open" : "";
  const focus = open ? " phrase-focus" : "";
  const kind = entry.kind === "phrase" ? "Phrase" : "Word";
  return `<article class="phrase-card${focus}" id="${esc(entry.id)}" data-kind="${esc(entry.kind)}"><details${open}><summary><span class="phrase-simp">${esc(entry.simp)}</span><span class="phrase-line"><span class="phrase-py">${esc(entry.pinyin)}</span><span class="phrase-sum-en">${esc(summaryEn)}${more}</span></span><span class="phrase-more" aria-hidden="true"></span><span class="phrase-sr">Details</span></summary><div class="phrase-detail"><p class="phrase-kind">${kind}</p><p class="phrase-py-full">${esc(entry.pinyin)}</p>${trad}<h3 class="phrase-exh">Meanings</h3>${senseHtml}${wordsHtml(entry.words)}${examples}${audio}</div></details></article>`;
}
