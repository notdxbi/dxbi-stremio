-- dx.bi viewer sync: one row per Stremio account and synced key.
-- t: when the device changed it (the most recent wins); s: when this server stored it (what a device
-- asks for with "since"); v: the value, as JSON. The Stremio session key is never stored.
CREATE TABLE IF NOT EXISTS entries (
  account TEXT NOT NULL,
  k TEXT NOT NULL,
  t INTEGER NOT NULL,
  v TEXT NOT NULL,
  s INTEGER NOT NULL,
  PRIMARY KEY (account, k)
);
CREATE INDEX IF NOT EXISTS entries_since ON entries (account, s);
