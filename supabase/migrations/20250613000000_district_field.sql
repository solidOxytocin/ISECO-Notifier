-- Replace is_district_wide with district ("1st" | "2nd")
-- No-op when initial_schema already created district (no is_district_wide column).
ALTER TABLE outages ADD COLUMN IF NOT EXISTS district TEXT
  CHECK (district IS NULL OR district IN ('1st', '2nd'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outages'
      AND column_name = 'is_district_wide'
  ) THEN
    UPDATE outages SET district = '1st' WHERE is_district_wide = true AND district IS NULL;
    ALTER TABLE outages DROP COLUMN is_district_wide;
  END IF;
END $$;
