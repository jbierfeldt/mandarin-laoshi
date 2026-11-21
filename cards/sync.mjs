/**
 * Optional backup to a sync worker. Off until Settings has an https URL and
 * a secret of at least 8 characters. The app does not need this to study.
 */

export function syncConfigured(settings) {
  const secret = String(settings?.syncSecret || "");
  if (secret.length < 8) return false;
  try {
    const url = new URL(String(settings.syncUrl || ""));
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function publicSettings(settings) {
  if (!settings) return null;
  const copy = { ...settings };
  delete copy.syncSecret;
  return copy;
}

/** Last write wins per card. Study days are a union. The sync secret stays local. */
export function mergeState(local, remote) {
  const cards = new Map((local.cards || []).map((card) => [card.id, card]));
  for (const card of remote?.cards || []) {
    if (!card || typeof card.id !== "string") continue;
    const prev = cards.get(card.id);
    if (!prev || (Number(card.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) cards.set(card.id, card);
  }
  const localSettings = local.settings || {};
  const remoteSettings = remote?.settings;
  const settings = remoteSettings && (Number(remoteSettings.updatedAt) || 0) > (Number(localSettings.updatedAt) || 0)
    ? { ...remoteSettings, syncUrl: localSettings.syncUrl || "", syncSecret: localSettings.syncSecret || "" }
    : localSettings;
  const studiedDays = [...new Set([...(local.studiedDays || []), ...(remote?.studiedDays || [])])].sort();
  return { settings, cards: [...cards.values()], studiedDays };
}

export function syncBody({ deviceId, settings, cards, studiedDays }) {
  return {
    deviceId,
    settings: publicSettings(settings),
    studiedDays: studiedDays || [],
    cards: cards || [],
  };
}

export async function syncNow(store, settings, fetchImpl = globalThis.fetch) {
  if (!syncConfigured(settings)) return { ok: false, reason: "off" };
  const { ensureDeviceId, loadProgress, replaceProgress } = await import("./storage.mjs");
  const deviceId = await ensureDeviceId(store);
  const local = await loadProgress(store);
  const body = syncBody({
    deviceId,
    settings: local.saved ? await store.getSettings() : settings,
    cards: [...local.cards.values()],
    studiedDays: local.studiedDays,
  });
  const endpoint = new URL(settings.syncUrl);
  if (!endpoint.pathname || endpoint.pathname === "/") endpoint.pathname = "/sync";
  let response;
  try {
    response = await fetchImpl(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.syncSecret}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: "offline" };
  }
  if (!response.ok) return { ok: false, reason: `http ${response.status}` };
  const remote = await response.json();
  const merged = mergeState(
    { settings: body.settings, cards: body.cards, studiedDays: body.studiedDays },
    remote,
  );
  merged.settings.syncUrl = settings.syncUrl;
  merged.settings.syncSecret = settings.syncSecret;
  await replaceProgress(store, { schema: 1, app: "mandarin-laoshi", ...merged, deviceId });
  return { ok: true, cards: merged.cards.length };
}
