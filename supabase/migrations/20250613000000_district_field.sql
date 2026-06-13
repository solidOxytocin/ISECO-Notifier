-- Replace is_district_wide with district ("1st" | "2nd")
ALTER TABLE outages ADD COLUMN IF NOT EXISTS district TEXT
  CHECK (district IS NULL OR district IN ('1st', '2nd'));

UPDATE outages SET district = '1st' WHERE is_district_wide = true AND district IS NULL;

ALTER TABLE outages DROP COLUMN IF EXISTS is_district_wide;
