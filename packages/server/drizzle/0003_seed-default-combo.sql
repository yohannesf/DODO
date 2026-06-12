-- Reserved `default` category combo + option combo (spec §3): every stored
-- value points at exactly one COC; undisaggregated data uses this one.
INSERT INTO "category_combo" (id, name, code) VALUES
  ('019754a0-0000-7000-8000-00000000c0c0', 'default', 'DEFAULT')
ON CONFLICT (id) DO NOTHING;
INSERT INTO "category_option_combo" (id, combo_id, name, option_ids) VALUES
  ('019754a0-0000-7000-8000-00000000c0c1', '019754a0-0000-7000-8000-00000000c0c0', 'default', '{}')
ON CONFLICT (id) DO NOTHING;
