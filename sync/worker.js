/**
 * Cloudflare Worker. Bind a D1 database as DB and set SYNC_SECRET.
 * POST /sync with Authorization: Bearer <secret>. Last write wins per card.
 * The browser calls this only after a URL and secret are saved in Settings.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname !== "/sync") return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method" }, 405);
    if (!env.SYNC_SECRET || request.headers.get("Authorization") !== `Bearer ${env.SYNC_SECRET}`) {
      return json({ error: "unauthorized" }, 401);
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
    const deviceId = String(body.deviceId || "");
    if (!/^[\w-]{8,80}$/.test(deviceId)) return json({ error: "bad_device" }, 400);

    const incoming = Array.isArray(body.cards) ? body.cards.slice(0, 5000) : [];
    for (const card of incoming) {
      if (!card || typeof card.id !== "string" || card.id.length > 200) continue;
      const updatedAt = Number(card.updatedAt) || 0;
      const existing = await env.DB.prepare(
        "SELECT updated_at FROM cards WHERE device_id = ? AND card_id = ?",
      ).bind(deviceId, card.id).first();
      if (!existing || updatedAt >= Number(existing.updated_at)) {
        await env.DB.prepare(
          `INSERT INTO cards (device_id, card_id, updated_at, data) VALUES (?, ?, ?, ?)
           ON CONFLICT(device_id, card_id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
        ).bind(deviceId, card.id, updatedAt, JSON.stringify(card)).run();
      }
    }

    if (body.settings && typeof body.settings === "object") {
      const updatedAt = Number(body.settings.updatedAt) || 0;
      const existing = await env.DB.prepare(
        "SELECT updated_at FROM devices WHERE device_id = ?",
      ).bind(deviceId).first();
      if (!existing || updatedAt >= Number(existing.updated_at)) {
        await env.DB.prepare(
          `INSERT INTO devices (device_id, settings, studied_days, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(device_id) DO UPDATE SET settings = excluded.settings, studied_days = excluded.studied_days, updated_at = excluded.updated_at`,
        ).bind(deviceId, JSON.stringify(body.settings), JSON.stringify(body.studiedDays || []), updatedAt).run();
      }
    }

    const stored = await env.DB.prepare("SELECT data FROM cards WHERE device_id = ?").bind(deviceId).all();
    const device = await env.DB.prepare(
      "SELECT settings, studied_days FROM devices WHERE device_id = ?",
    ).bind(deviceId).first();
    const cards = (stored.results || []).map((row) => JSON.parse(row.data));
    return json({
      cards,
      settings: device?.settings ? JSON.parse(device.settings) : null,
      studiedDays: device?.studied_days ? JSON.parse(device.studied_days) : [],
    });
  },
};
