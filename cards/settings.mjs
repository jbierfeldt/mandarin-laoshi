/** Study settings stored with the SRS cards. Essentials is always on. */

export const DEFAULT_SETTINGS = {
  schema: 1,
  newPerDay: 10,
  direction: "zh-en",
  showPinyin: true,
  toneColors: true,
  showEnglish: false,
  speech: true,
  packs: { everyday: false, phrases: false },
  syncUrl: "",
  syncSecret: "",
  theme: "system",
  updatedAt: 0,
};

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const packs = src.packs && typeof src.packs === "object" ? src.packs : {};
  const direction = src.direction === "en-zh" ? "en-zh" : "zh-en";
  const theme = src.theme === "light" || src.theme === "dark" ? src.theme : "system";
  return {
    schema: 1,
    newPerDay: clampInt(src.newPerDay, 0, 50, DEFAULT_SETTINGS.newPerDay),
    direction,
    showPinyin: src.showPinyin !== false,
    toneColors: src.toneColors !== false,
    showEnglish: !!src.showEnglish,
    speech: src.speech !== false,
    packs: { everyday: !!packs.everyday, phrases: !!packs.phrases },
    syncUrl: String(src.syncUrl || "").trim(),
    syncSecret: String(src.syncSecret || ""),
    theme,
    updatedAt: Number(src.updatedAt) || 0,
  };
}
