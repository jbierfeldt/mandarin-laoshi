/**
 * Read a conversation entry published on main.
 *
 * This file does not define a second conversation schema and does not publish
 * entries. Authoring, validation, and the fast publishing workflow belong to
 * the conversation pipeline. The fields read here are the ones already stored
 * in conversations/<id>/entry.json:
 *
 *   kind: "conversation"
 *   script: "hans" (recorded on each source; simplified is still derived from cells)
 *   sections[].type "vocab" and "lines"
 *   cells[].ch traditional, cells[].s simplified when it differs
 *   words[].t traditional, words[].s simplified when it differs, words[].py, words[].en
 *   item py, en, note, id, audio[]
 *
 * Drills repeat those vocab items and lines, so a drill is indexed only when
 * its headword is not already in a vocab item or a line. Hints and grammar
 * cards are not entries.
 *
 * Links use the existing route #/practice/<id>. This adapter does not register
 * that route.
 */

import { occurrenceFromItem, occurrenceFromWord } from "../headword.mjs";

function drillRole(section) {
  const title = String(section.title || "");
  const tag = String(section.items && section.items[0] && section.items[0].tag || "");
  return /phrase/i.test(title) || /phrase/i.test(tag) ? "phrase" : "word";
}

export function conversationOccurrences(doc, meta, ctx) {
  const occurrences = [];
  const seen = new Set();
  let vocab = 0;
  let lines = 0;
  let drillsIndexed = 0;
  let drillsSkipped = 0;
  for (const section of doc.sections || []) {
    if (section.type !== "vocab" && section.type !== "lines") continue;
    for (const item of section.items || []) {
      const role = section.type === "vocab" ? "word" : "phrase";
      const occ = occurrenceFromItem(item, section, meta, ctx, role);
      if (!occ) continue;
      occurrences.push(occ);
      seen.add(occ.key);
      if (section.type === "vocab") vocab += 1;
      else lines += 1;
      for (const word of item.words || []) {
        const sub = occurrenceFromWord(word, item, section, meta, ctx);
        if (!sub || sub.key === occ.key) continue;
        occurrences.push(sub);
      }
    }
  }
  for (const section of doc.sections || []) {
    if (section.type !== "drill") continue;
    const role = drillRole(section);
    for (const item of section.items || []) {
      const occ = occurrenceFromItem(item, section, meta, ctx, role);
      if (!occ || seen.has(occ.key)) {
        drillsSkipped += 1;
        continue;
      }
      seen.add(occ.key);
      drillsIndexed += 1;
      occurrences.push(occ);
    }
  }
  return { occurrences, stats: { vocab, lines, drillsIndexed, drillsSkipped } };
}
