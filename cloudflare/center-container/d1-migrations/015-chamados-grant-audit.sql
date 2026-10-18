-- Append-only authorization history. No users or grants are created.
CREATE TABLE chamados_grant_audit (
 id TEXT PRIMARY KEY,
 org_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 actor_name TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('save','revoke')),
 reason TEXT NOT NULL,
 request_id TEXT NOT NULL,
 body_hash TEXT NOT NULL,
 old_json TEXT NOT NULL CHECK(json_valid(old_json)),
 new_json TEXT NOT NULL CHECK(json_valid(new_json)),
 response_json TEXT NOT NULL CHECK(json_valid(response_json)),
 created_at TEXT NOT NULL,
 UNIQUE(org_id,actor_id,request_id),
 FOREIGN KEY(org_id,user_id) REFERENCES chamados_access_grants(org_id,user_id)
);
CREATE INDEX chamados_grant_audit_user ON chamados_grant_audit(org_id,user_id,created_at,id);
CREATE TRIGGER chamados_grant_audit_no_update BEFORE UPDATE ON chamados_grant_audit
 BEGIN SELECT RAISE(ABORT,'Authorization audit is immutable'); END;
CREATE TRIGGER chamados_grant_audit_no_delete BEFORE DELETE ON chamados_grant_audit
 BEGIN SELECT RAISE(ABORT,'Authorization audit is immutable'); END;
