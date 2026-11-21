/** Local progress. IndexedDB in the browser, a memory map in tests. */

import { normalizeSettings } from "./settings.mjs";

const STATES = new Set(["new", "learning", "review", "relearning"]);

function memory() {
  const cards = new Map();
  const kv = new Map();
  return {
    volatile: false,
    async getSettings() { return kv.get("settings") ?? null; },
    async putSettings(value) { kv.set("settings", value); },
    async allCards() { return [...cards.values()]; },
    async putCard(card) { cards.set(card.id, card); },
    async putCards(list) {
      cards.clear();
      for (const card of list) cards.set(card.id, card);
    },
    async getDays() { return kv.get("days") || []; },
    async putDays(days) { kv.set("days", [...days]); },
    async getDeviceId() { return kv.get("device") ?? null; },
    async putDeviceId(id) { kv.set("device", id); },
  };
}

export function createMemoryStore() {
  return memory();
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createIdbStore() {
  const opening = new Promise((resolve, reject) => {
    const req = indexedDB.open("laoshi", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const kv = async (mode, fn) => {
    const db = await opening;
    return requestToPromise(fn(db.transaction("kv", mode).objectStore("kv")));
  };
  return {
    volatile: false,
    async getSettings() { return (await kv("readonly", (store) => store.get("settings"))) ?? null; },
    async putSettings(value) { await kv("readwrite", (store) => store.put(value, "settings")); },
    async allCards() {
      const db = await opening;
      const rows = await requestToPromise(db.transaction("cards").objectStore("cards").getAll());
      return rows || [];
    },
    async putCard(card) {
      const db = await opening;
      await requestToPromise(db.transaction("cards", "readwrite").objectStore("cards").put(card));
    },
    async putCards(list) {
      const db = await opening;
      await new Promise((resolve, reject) => {
        const tx = db.transaction("cards", "readwrite");
        const store = tx.objectStore("cards");
        store.clear();
        for (const card of list) store.put(card);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async getDays() { return (await kv("readonly", (store) => store.get("days"))) || []; },
    async putDays(days) { await kv("readwrite", (store) => store.put([...days], "days")); },
    async getDeviceId() { return (await kv("readonly", (store) => store.get("device"))) ?? null; },
    async putDeviceId(id) { await kv("readwrite", (store) => store.put(id, "device")); },
  };
}

let singleton = null;

export function openStore() {
  if (singleton) return singleton;
  if (typeof indexedDB === "undefined") {
    singleton = createMemoryStore();
    singleton.volatile = true;
    return singleton;
  }
  singleton = createIdbStore();
  return singleton;
}

export async function loadProgress(store) {
  const [settings, cards, studiedDays, deviceId] = await Promise.all([
    store.getSettings(),
    store.allCards(),
    store.getDays(),
    store.getDeviceId(),
  ]);
  return {
    settings: normalizeSettings(settings),
    saved: !!settings,
    cards: new Map(cards.map((card) => [card.id, card])),
    studiedDays: studiedDays || [],
    deviceId: deviceId || null,
  };
}

export async function exportPayload(store) {
  const progress = await loadProgress(store);
  return {
    schema: 1,
    app: "mandarin-laoshi",
    exportedAt: new Date().toISOString(),
    settings: progress.saved ? await store.getSettings() : progress.settings,
    cards: [...progress.cards.values()],
    studiedDays: progress.studiedDays,
    deviceId: progress.deviceId,
  };
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That file is not JSON."); }
  if (!data || data.schema !== 1 || data.app !== "mandarin-laoshi" || !Array.isArray(data.cards)) {
    throw new Error("That file is not a Laoshi backup.");
  }
  const cards = data.cards.map((card) => {
    if (!card || typeof card.id !== "string" || !STATES.has(card.state)) throw new Error("A card in that backup is incomplete.");
    return card;
  });
  const studiedDays = Array.isArray(data.studiedDays) ? data.studiedDays.filter((day) => typeof day === "string") : [];
  return { ...data, cards, studiedDays };
}

export async function replaceProgress(store, data) {
  const parsed = data.cards ? data : parseBackup(typeof data === "string" ? data : JSON.stringify(data));
  await store.putSettings(normalizeSettings(parsed.settings));
  await store.putCards(parsed.cards);
  await store.putDays(parsed.studiedDays || []);
  if (parsed.deviceId) await store.putDeviceId(parsed.deviceId);
}

export async function askToPersist() {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* private mode or an older webview */ }
  return false;
}

export async function ensureDeviceId(store) {
  const existing = await store.getDeviceId();
  if (existing) return existing;
  const id = (globalThis.crypto?.randomUUID && crypto.randomUUID()) || `device-${Date.now()}`;
  await store.putDeviceId(id);
  return id;
}
