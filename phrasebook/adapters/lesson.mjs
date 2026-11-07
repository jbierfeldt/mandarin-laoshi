/** Read textbook and podcast lessons. Vocab items and dialogue lines only. */

import { lessonVocabRole, occurrenceFromItem } from "../headword.mjs";

export function lessonOccurrences(doc, meta, ctx) {
  const occurrences = [];
  let vocab = 0;
  let lines = 0;
  for (const section of doc.sections || []) {
    if (section.type !== "vocab" && section.type !== "lines") continue;
    for (const item of section.items || []) {
      const role = section.type === "vocab" ? lessonVocabRole(item) : "phrase";
      const occ = occurrenceFromItem(item, section, meta, ctx, role);
      if (!occ) continue;
      occurrences.push(occ);
      if (section.type === "vocab") vocab += 1;
      else lines += 1;
    }
  }
  return { occurrences, stats: { vocab, lines } };
}
