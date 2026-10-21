CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'website',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'proposal_sent', 'booked', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'high', 'urgent')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  event_time TEXT NOT NULL DEFAULT '',
  guest_count TEXT NOT NULL DEFAULT '',
  service_type TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  cuisine TEXT NOT NULL DEFAULT '',
  menu_preferences TEXT NOT NULL DEFAULT '',
  dietary_restrictions TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  follow_up_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  email_delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (email_delivery_status IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status
  ON leads (status);

CREATE INDEX IF NOT EXISTS idx_leads_event_date
  ON leads (event_date);

CREATE INDEX IF NOT EXISTS idx_leads_follow_up
  ON leads (follow_up_at);

CREATE INDEX IF NOT EXISTS idx_leads_created_at
  ON leads (created_at DESC);
