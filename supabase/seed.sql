-- Optional seed data for local/testing without Gemini API
INSERT INTO outages (
  outage_date, start_time, end_time, areas, areas_raw, exclusions,
  is_district_wide, purpose, source_post_id, image_index, dedup_key, confidence
) VALUES
(
  '2026-06-15', '05:30', '13:30',
  '["Whole 1st District of Ilocos Sur", "Nagpanaoan, Santa"]',
  '["Whole 1st District of Ilocos Sur", "Nagpanaoan, Santa"]',
  '["Puro, Caoayan"]',
  true,
  'NGCP Scheduled Power Interruption for Bantay Substation commissioning.',
  'fb_seed_001', 0,
  'fb_seed_001:0:2026-06-15:05:30:13:30:whole 1st district of ilocos sur|nagpanaoan, santa',
  'high'
),
(
  '2026-06-17', '08:30', '17:00',
  '["Baluarte, Vigan City", "Salindeg, Vigan City"]',
  '["Baluarte, Vigan City", "Salindeg, Vigan City"]',
  '[]',
  false,
  'Clearing and maintenance of lines',
  'fb_seed_002', 1,
  'fb_seed_002:1:2026-06-17:08:30:17:00:baluarte, vigan city|salindeg, vigan city',
  'high'
)
ON CONFLICT (dedup_key) DO NOTHING;
