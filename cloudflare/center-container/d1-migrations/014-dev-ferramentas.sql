-- Ferramentas do papel dev: auditoria das ações e sessões "ver como".
-- Só aditiva e idempotente. O Worker tolera a ausência destas tabelas (a auditoria é
-- ignorada e o "ver como" responde erro), então o deploy não depende da ordem.
CREATE TABLE IF NOT EXISTS dev_audit (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  target_email TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS dev_audit_created ON dev_audit(created_at DESC);

-- Sessão aberta por um dev na pele de outra conta; vive pouco e nunca alcança outro dev.
CREATE TABLE IF NOT EXISTS dev_impersonations (
  token_hash TEXT PRIMARY KEY,
  dev_id TEXT NOT NULL,
  dev_email TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
