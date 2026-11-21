/** Which cards are studied today: pack order, the daily new-card cap, and streak. */

import { blankCard } from "./fsrs.mjs";

export function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftDay(key, delta) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return dayKey(dt);
}

/** Consecutive study days ending today, or yesterday if today has not started. */
export function streakFrom(days, now) {
  const set = new Set(days || []);
  let key = dayKey(now);
  if (!set.has(key)) key = shiftDay(key, -1);
  let n = 0;
  while (set.has(key)) {
    n += 1;
    key = shiftDay(key, -1);
  }
  return n;
}

export function countIntroduced(cards, now) {
  const day = dayKey(now);
  let n = 0;
  for (const card of cards.values()) {
    if (card.introduced && dayKey(card.introduced) === day) n += 1;
  }
  return n;
}

/** Essentials (start: true) is always included. Later packs follow settings. */
export function enabledIds(packDoc, settings) {
  const ids = [];
  for (const pack of packDoc?.packs || []) {
    if (pack.start || settings?.packs?.[pack.id]) ids.push(...pack.ids);
  }
  return ids;
}

export function summarize({ cards, packIds, studiedDays, settings, now }) {
  let due = 0;
  let learned = 0;
  let unseen = 0;
  for (const id of packIds) {
    const card = cards.get(id);
    if (!card || card.state === "new") unseen += 1;
    else if (card.due <= now) due += 1;
    if (card && card.state === "review") learned += 1;
  }
  const introduced = countIntroduced(cards, now);
  const perDay = settings?.newPerDay ?? 10;
  return {
    due,
    learned,
    unseen,
    streak: streakFrom(studiedDays, now),
    introduced,
    budget: Math.max(0, perDay - introduced),
  };
}

/**
 * Due reviews, then learning cards due within 15 minutes, then new cards
 * in pack order up to the cards still allowed today.
 */
export function buildSession({ entries, cards, packIds, settings, now }) {
  const byId = new Map((entries || []).map((entry) => [entry.id, entry]));
  const reviews = [];
  const learning = [];
  const fresh = [];
  for (const id of packIds) {
    const entry = byId.get(id);
    if (!entry) continue;
    const card = cards.get(id) || blankCard(id, now);
    if (card.state === "new") fresh.push({ entry, card });
    else if (card.due <= now) reviews.push({ entry, card });
    else if ((card.state === "learning" || card.state === "relearning") && card.due - now <= 15 * 60000) learning.push({ entry, card });
  }
  reviews.sort((a, b) => a.card.due - b.card.due);
  learning.sort((a, b) => a.card.due - b.card.due);
  const budget = Math.max(0, (settings?.newPerDay ?? 10) - countIntroduced(cards, now));
  return {
    queue: [...reviews, ...learning, ...fresh.slice(0, budget)],
    budget,
    due: reviews.length,
    waiting: fresh.length,
  };
}
