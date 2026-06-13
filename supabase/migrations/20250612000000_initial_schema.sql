-- ISECO Outage Notifier schema

CREATE TABLE IF NOT EXISTS outages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outage_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  areas JSONB NOT NULL DEFAULT '[]',
  areas_raw JSONB NOT NULL DEFAULT '[]',
  exclusions JSONB NOT NULL DEFAULT '[]',
  district TEXT CHECK (district IS NULL OR district IN ('1st', '2nd')),
  purpose TEXT,
  source_post_id TEXT NOT NULL,
  image_index INT NOT NULL DEFAULT 0,
  dedup_key TEXT NOT NULL UNIQUE,
  confidence TEXT DEFAULT 'medium',
  parser_version TEXT,
  raw_caption TEXT
);

CREATE INDEX IF NOT EXISTS idx_outages_date ON outages (outage_date);
CREATE INDEX IF NOT EXISTS idx_outages_source ON outages (source_post_id);

CREATE TABLE IF NOT EXISTS processed_posts (
  source_post_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  image_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'complete',
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS parse_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_post_id TEXT,
  image_url TEXT,
  image_index INT,
  raw_response TEXT,
  error TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fcm_token TEXT NOT NULL UNIQUE,
  platform TEXT,
  barangays JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_devices_barangays ON devices USING GIN (barangays);

-- RLS: public read for outages, service role for writes
ALTER TABLE outages ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE parse_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read outages" ON outages
  FOR SELECT USING (outage_date >= CURRENT_DATE);

CREATE POLICY "Service role full access outages" ON outages
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role processed_posts" ON processed_posts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role parse_failures" ON parse_failures
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Anon insert devices" ON devices
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update devices" ON devices
  FOR UPDATE USING (true);

CREATE POLICY "Anon read devices" ON devices
  FOR SELECT USING (true);

-- Notify on new outage insert (calls edge function via pg_net or webhook)
CREATE OR REPLACE FUNCTION notify_new_outage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send_outage_notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'outage_id', NEW.id,
      'outage_date', NEW.outage_date,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'areas', NEW.areas,
      'purpose', NEW.purpose
    )
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't block insert if notification fails
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: trigger disabled by default; enable after FCM secrets are configured
-- CREATE TRIGGER on_outage_insert AFTER INSERT ON outages
--   FOR EACH ROW EXECUTE FUNCTION notify_new_outage();
