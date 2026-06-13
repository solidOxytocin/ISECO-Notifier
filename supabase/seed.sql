-- Optional seed data for local/testing without Gemini API
INSERT INTO outages (
  outage_date, start_time, end_time, district, areas, areas_raw, exclusions,
  purpose, source_post_id, image_index, dedup_key, confidence
) VALUES
(
  '2026-06-15', '05:30', '13:30',
  '1st',
  '["Nagpanaoan, Santa"]',
  '["Whole 1st District of Ilocos Sur EXCEPT Puro, Caoayan", "Nagpanaoan, Santa"]',
  '["Puro, Caoayan"]',
  'NGCP Scheduled Power Interruption for Bantay Substation commissioning.',
  'fb_seed_001', 0,
  'fb_seed_001:0:2026-06-15:05:30:13:30:d:1st:nagpanaoan, santa:puro, caoayan',
  'high'
),
(
  '2026-06-17', '08:30', '17:00',
  NULL,
  '["Baluarte, Vigan City", "Salindeg, Vigan City"]',
  '["Baluarte, Vigan City", "Salindeg, Vigan City"]',
  '[]',
  'Clearing and maintenance of lines',
  'fb_seed_002', 1,
  'fb_seed_002:1:2026-06-17:08:30:17:00::baluarte, vigan city|salindeg, vigan city:',
  'high'
)
ON CONFLICT (dedup_key) DO NOTHING;
