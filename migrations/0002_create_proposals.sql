CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'accepted', 'declined')),
  title TEXT NOT NULL,
  guest_count INTEGER NOT NULL,
  price_per_guest_cents INTEGER NOT NULL DEFAULT 0,
  food_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  server_count INTEGER NOT NULL DEFAULT 0,
  server_hours REAL NOT NULL DEFAULT 0,
  server_hourly_rate_cents INTEGER NOT NULL DEFAULT 4000,
  staffing_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  additional_label TEXT NOT NULL DEFAULT '',
  additional_amount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  menu TEXT NOT NULL DEFAULT '',
  client_notes TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_proposals_status
  ON proposals (status);

CREATE INDEX IF NOT EXISTS idx_proposals_updated_at
  ON proposals (updated_at DESC);
