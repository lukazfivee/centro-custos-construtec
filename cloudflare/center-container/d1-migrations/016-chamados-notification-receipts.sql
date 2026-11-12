-- Durable delivery receipts. Email addresses and provider credentials are not stored here.
CREATE TABLE chamados_notification_receipts (
 org_id TEXT NOT NULL,
 event_key TEXT NOT NULL,
 user_id TEXT NOT NULL,
 body_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','sending','accepted','delivered','bounced','complained','failed','uncertain')),
 provider_id TEXT,
 first_attempt_at INTEGER NOT NULL,
 last_attempt_at INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until INTEGER,
 error_code TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(org_id,event_key,user_id)
);
CREATE INDEX chamados_notification_receipts_provider ON chamados_notification_receipts(provider_id);
