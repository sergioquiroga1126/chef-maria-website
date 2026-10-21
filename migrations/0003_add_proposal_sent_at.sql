ALTER TABLE proposals ADD COLUMN sent_at TEXT;

UPDATE proposals
SET sent_at = updated_at
WHERE status = 'sent'
  AND sent_at IS NULL;
