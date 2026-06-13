-- Partial-area coverage ("Some parts of: …") — not whole barangay
ALTER TABLE outages ADD COLUMN IF NOT EXISTS partial_areas JSONB NOT NULL DEFAULT '[]';
