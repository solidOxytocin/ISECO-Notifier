-- Emergency (unscheduled) power outages: no end time, distinct from scheduled notices

ALTER TABLE outages
  ADD COLUMN IF NOT EXISTS outage_type TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (outage_type IN ('scheduled', 'emergency'));

ALTER TABLE outages
  ALTER COLUMN end_time DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outages_type_date ON outages (outage_type, outage_date);
