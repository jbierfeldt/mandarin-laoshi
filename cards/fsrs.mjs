/**
 * FSRS-5 (the scheduler Anki uses), plus short learning steps for one sitting.
 * Weights are the FSRS-5 defaults. The forgetting curve is
 * R = (1 + FACTOR * t / S) ^ DECAY. Fuzz is off, so the same grade always
 * schedules the same interval. Again / Hard / Good / Easy map to grades 1–4.
 * A new Good waits 10 minutes and is asked once more; Easy graduates immediately.
 */

export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const S_MIN = 0.01;
export const DEFAULT_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
export const RATINGS = { again: 1, hard: 2, good: 3, easy: 4 };
const DAY = 86400000;
const MINUTE = 60000;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function constrainDifficulty(d) {
  return Math.min(Math.max(+Number(d).toFixed(8), 1), 10);
}

export function initStability(g, w = DEFAULT_W) {
  return Math.max(w[g - 1], 0.1);
}

export function initDifficulty(g, w = DEFAULT_W) {
  return constrainDifficulty(w[4] - Math.exp((g - 1) * w[5]) + 1);
}

function linearDamping(delta, oldD) {
  return +(delta * (10 - oldD) / 9).toFixed(8);
}

function meanReversion(w, init, current) {
  return +(w[7] * init + (1 - w[7]) * current).toFixed(8);
}

function nextDifficulty(d, g, w) {
  const next = d + linearDamping(-w[6] * (g - 3), d);
  return constrainDifficulty(meanReversion(w, initDifficulty(4, w), next));
}

export function intervalModifier(requestRetention = 0.9) {
  if (requestRetention <= 0 || requestRetention > 1) throw new Error("retention must be in (0, 1]");
  return +((requestRetention ** (1 / DECAY) - 1) / FACTOR).toFixed(8);
}

export function nextIntervalDays(stability, requestRetention = 0.9, maximum = 36500) {
  const raw = stability * intervalModifier(requestRetention);
  return Math.min(maximum, Math.max(1, Math.round(raw)));
}

function forgettingCurve(elapsedDays, stability) {
  return +((1 + (FACTOR * elapsedDays) / stability) ** DECAY).toFixed(8);
}

function nextRecallStability(d, s, r, g, w) {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return +clamp(
    s * (1 + Math.exp(w[8]) * (11 - d) * s ** -w[9] * (Math.exp((1 - r) * w[10]) - 1) * hard * easy),
    S_MIN,
    36500,
  ).toFixed(8);
}

function nextForgetStability(d, s, r, w) {
  return +clamp(
    w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp((1 - r) * w[14]),
    S_MIN,
    36500,
  ).toFixed(8);
}

function nextShortTermStability(s, g, w) {
  return +clamp(s * Math.exp(w[17] * (g - 3 + w[18])), S_MIN, 36500).toFixed(8);
}

/** Next difficulty and stability. `elapsedDays` is 0 for a same-day step. */
export function nextMemory(state, elapsedDays, rating, w = DEFAULT_W) {
  const g = typeof rating === "number" ? rating : RATINGS[rating];
  if (!g) throw new Error(`bad rating ${rating}`);
  const d = state?.difficulty || 0;
  const s = state?.stability || 0;
  if (d === 0 && s === 0) return { difficulty: initDifficulty(g, w), stability: initStability(g, w) };
  if (elapsedDays < 0) throw new Error("negative elapsed");
  const r = forgettingCurve(elapsedDays, s);
  let stability = nextRecallStability(d, s, r, g, w);
  if (g === 1) {
    const nextMin = s / Math.exp(w[17] * w[18]);
    stability = clamp(+nextMin.toFixed(8), S_MIN, nextForgetStability(d, s, r, w));
  }
  if (elapsedDays === 0) stability = nextShortTermStability(s, g, w);
  return { difficulty: nextDifficulty(d, g, w), stability };
}

export function blankCard(id, now = 0) {
  return {
    id,
    state: "new",
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    learningStep: 0,
    scheduledDays: 0,
    lastReview: null,
    introduced: null,
    updatedAt: 0,
  };
}

function elapsedDays(card, now) {
  if (!card.lastReview) return 0;
  const days = (now - card.lastReview) / DAY;
  return days < 1 ? 0 : days;
}

function learn(next, state, step, minutes, now) {
  next.state = state;
  next.learningStep = step;
  next.scheduledDays = 0;
  next.due = now + minutes * MINUTE;
}

function graduate(next, now) {
  const days = nextIntervalDays(next.stability);
  next.state = "review";
  next.learningStep = 0;
  next.scheduledDays = days;
  next.due = now + days * DAY;
}

/**
 * @param {object} card
 * @param {"again"|"hard"|"good"|"easy"} rating
 * @param {number} now epoch ms
 */
export function schedule(card, rating, now) {
  if (!RATINGS[rating]) throw new Error(`bad rating ${rating}`);
  const base = card && card.state ? card : blankCard(card?.id, now);
  const first = base.state === "new" || !(base.stability > 0);
  const memory = nextMemory(first ? null : { difficulty: base.difficulty, stability: base.stability }, first ? 0 : elapsedDays(base, now), rating);
  const next = {
    ...base,
    stability: memory.stability,
    difficulty: memory.difficulty,
    reps: (base.reps || 0) + 1,
    lastReview: now,
    updatedAt: now,
  };
  if (!base.introduced && base.state === "new") next.introduced = now;

  if (base.state === "new" || base.state === "learning") {
    const step = base.state === "new" ? -1 : (base.learningStep || 0);
    if (rating === "again") learn(next, "learning", 0, 1, now);
    else if (rating === "hard") learn(next, "learning", Math.max(0, step), 6, now);
    else if (rating === "easy") graduate(next, now);
    else if (step < 1) learn(next, "learning", 1, 10, now);
    else graduate(next, now);
    return next;
  }
  if (base.state === "review") {
    if (rating === "again") {
      next.lapses = (base.lapses || 0) + 1;
      learn(next, "relearning", 0, 10, now);
      return next;
    }
    graduate(next, now);
    return next;
  }
  if (rating === "again") learn(next, "relearning", 0, 10, now);
  else if (rating === "hard") learn(next, "relearning", 0, 10, now);
  else graduate(next, now);
  return next;
}

export function preview(card, now) {
  return {
    again: schedule(card, "again", now),
    hard: schedule(card, "hard", now),
    good: schedule(card, "good", now),
    easy: schedule(card, "easy", now),
  };
}

export function staysInSession(card) {
  return card.state === "learning" || card.state === "relearning";
}

export function formatGap(ms) {
  const n = Math.max(0, Number(ms) || 0);
  if (n < MINUTE) return "<1m";
  if (n < 3600000) return `${Math.round(n / MINUTE)}m`;
  if (n < DAY) return `${Math.max(1, Math.round(n / 3600000))}h`;
  const days = Math.round(n / DAY);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}
