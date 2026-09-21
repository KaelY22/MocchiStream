ALTER TABLE sessions ADD COLUMN expires_at DATETIME;
UPDATE sessions SET expires_at = datetime('now', '+30 days') WHERE expires_at IS NULL;
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
