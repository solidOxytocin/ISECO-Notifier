-- Cancelled power interruptions: a previously scheduled/emergency outage is called off.
-- Cancellations arrive as their own ISECO post (a "CANCELLED" stamp over a poster, or a
-- caption stating the interruption is cancelled). We match them to existing active rows
-- and flip status to 'cancelled'; unmatched cancellations are stored as standalone rows.

ALTER TABLE outages
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled'));

ALTER TABLE outages
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE outages
  ADD COLUMN IF NOT EXISTS cancellation_source_post_id TEXT;

CREATE INDEX IF NOT EXISTS idx_outages_status_date ON outages (status, outage_date);
