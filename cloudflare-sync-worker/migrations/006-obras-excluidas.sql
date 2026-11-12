-- Centros de custo excluidos em qualquer instalacao. O snapshot informa essa lista para as demais instalacoes
-- nao recriarem a obra ao sincronizar.
CREATE TABLE IF NOT EXISTS sync_deleted_obras (
  org_id TEXT NOT NULL,
  public_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  source_instance_id TEXT,
  source_user_email TEXT,
  PRIMARY KEY (org_id, public_id)
);
