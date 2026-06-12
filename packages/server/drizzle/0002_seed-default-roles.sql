-- Default roles (spec §7.2). Fixed UUIDs so re-running installs and bundle
-- sharing reference the same role ids.
INSERT INTO "role" (id, name, code, permissions) VALUES
  ('019754a0-0000-7000-8000-000000000001', 'Superuser', 'SUPERUSER',
   ARRAY['metadata:read','metadata:write','data:read','data:write','approvals:act','dashboards:manage','users:manage','system:admin']),
  ('019754a0-0000-7000-8000-000000000002', 'Program Admin', 'PROGRAM_ADMIN',
   ARRAY['metadata:read','metadata:write','data:read','data:write','approvals:act','dashboards:manage','users:manage']),
  ('019754a0-0000-7000-8000-000000000003', 'M&E Officer', 'ME_OFFICER',
   ARRAY['metadata:read','data:read','data:write','approvals:act','dashboards:manage']),
  ('019754a0-0000-7000-8000-000000000004', 'Data Entry', 'DATA_ENTRY',
   ARRAY['metadata:read','data:read','data:write']),
  ('019754a0-0000-7000-8000-000000000005', 'Viewer', 'VIEWER',
   ARRAY['metadata:read','data:read'])
ON CONFLICT (id) DO NOTHING;
