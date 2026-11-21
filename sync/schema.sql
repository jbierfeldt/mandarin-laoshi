-- Personal card sync. One shared secret, no accounts.
-- device_id is generated on the phone. card data is the SRS record as JSON.

CREATE TABLE IF NOT EXISTS cards (
  device_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (device_id, card_id)
);

CREATE INDEX IF NOT EXISTS cards_by_device ON cards (device_id, updated_at);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  settings TEXT,
  studied_days TEXT,
  updated_at INTEGER NOT NULL
);
