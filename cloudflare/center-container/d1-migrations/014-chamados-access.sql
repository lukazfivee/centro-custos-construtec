-- Apply to the CENTRAL identity D1 only; never apply this to the Chamados D1.
-- No account or grant is created/enabled by this migration.
CREATE TABLE chamados_access_grants (
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  application TEXT NOT NULL DEFAULT 'chamados' CHECK(application = 'chamados'),
  identity_type TEXT NOT NULL CHECK(identity_type IN ('corporativa', 'portal')),
  capabilities_json TEXT NOT NULL CHECK(json_valid(capabilities_json) AND json_type(capabilities_json) = 'array'),
  scope_json TEXT NOT NULL CHECK(json_valid(scope_json) AND json_type(scope_json) = 'object'),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  expires_at INTEGER,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(org_id, user_id),
  FOREIGN KEY(user_id) REFERENCES cloud_users(id)
);
CREATE TABLE chamados_handoffs (
  code_hash TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'chamados' CHECK(target = 'chamados'),
  origin TEXT NOT NULL,
  grant_revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  FOREIGN KEY(session_hash) REFERENCES cloud_sessions(token_hash) ON DELETE CASCADE,
  FOREIGN KEY(org_id, user_id) REFERENCES chamados_access_grants(org_id, user_id)
);
CREATE INDEX chamados_handoffs_expiration ON chamados_handoffs(expires_at);
CREATE INDEX chamados_handoffs_session ON chamados_handoffs(session_hash);
CREATE TABLE chamados_write_guards (
  token TEXT PRIMARY KEY,
  succeeded INTEGER NOT NULL CHECK(succeeded = 1)
);
