-- Histórico de importações; não altera lançamentos existentes.
CREATE TABLE IF NOT EXISTS whatsapp_imports (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  text_hash TEXT NOT NULL,
  source_text TEXT NOT NULL,
  pending_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_imports_user_created_idx ON whatsapp_imports(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_import_items (
  id SERIAL PRIMARY KEY,
  import_id INTEGER NOT NULL REFERENCES whatsapp_imports(id),
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  created_cost_center_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
  line_key TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  UNIQUE (import_id, line_key),
  UNIQUE (source_hash, line_key)
);
CREATE INDEX IF NOT EXISTS whatsapp_import_items_transaction_idx ON whatsapp_import_items(transaction_id);
