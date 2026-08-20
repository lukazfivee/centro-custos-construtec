CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  bank_name VARCHAR(120),
  account_type VARCHAR(30) NOT NULL DEFAULT 'corrente' CHECK (account_type IN ('corrente','poupanca','caixa','cartao','outro')),
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_name_unique ON bank_accounts (LOWER(name));

CREATE TABLE IF NOT EXISTS bank_movements (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  external_id VARCHAR(180),
  movement_date DATE NOT NULL,
  description VARCHAR(300) NOT NULL,
  counterparty VARCHAR(180),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('entrada','saida')),
  source VARCHAR(30) NOT NULL DEFAULT 'csv',
  source_hash VARCHAR(64) NOT NULL,
  reconciled_transaction_id INTEGER REFERENCES transactions(id),
  reconciled_at TIMESTAMPTZ,
  reconciled_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_movements_source_hash_unique ON bank_movements (account_id, source_hash);
CREATE INDEX IF NOT EXISTS bank_movements_pending_idx ON bank_movements (account_id, movement_date DESC) WHERE reconciled_transaction_id IS NULL;
CREATE INDEX IF NOT EXISTS bank_movements_reconciled_idx ON bank_movements (reconciled_transaction_id) WHERE reconciled_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS transaction_allocations (
  id SERIAL PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  cost_center_id INTEGER NOT NULL REFERENCES cost_centers(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  percentage NUMERIC(7,4) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, cost_center_id)
);
CREATE INDEX IF NOT EXISTS transaction_allocations_center_idx ON transaction_allocations (cost_center_id, transaction_id);

CREATE TABLE IF NOT EXISTS budget_revisions (
  id SERIAL PRIMARY KEY,
  cost_center_id INTEGER NOT NULL REFERENCES cost_centers(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  previous_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  new_amount NUMERIC(14,2) NOT NULL CHECK (new_amount >= 0),
  change_type VARCHAR(20) NOT NULL DEFAULT 'revisao' CHECK (change_type IN ('inicial','revisao','aditivo','reducao','transferencia')),
  reason TEXT NOT NULL,
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cost_center_id, revision_number)
);
CREATE INDEX IF NOT EXISTS budget_revisions_center_idx ON budget_revisions (cost_center_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS supplier_ratings (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  price_score INTEGER NOT NULL CHECK (price_score BETWEEN 1 AND 5),
  deadline_score INTEGER NOT NULL CHECK (deadline_score BETWEEN 1 AND 5),
  quality_score INTEGER NOT NULL CHECK (quality_score BETWEEN 1 AND 5),
  documentation_score INTEGER NOT NULL CHECK (documentation_score BETWEEN 1 AND 5),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS supplier_ratings_supplier_idx ON supplier_ratings (supplier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_views (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  view_type VARCHAR(40) NOT NULL DEFAULT 'lancamentos',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, view_type, name)
);

INSERT INTO app_settings (key,value) VALUES
  ('auto_backup_enabled','false'),
  ('auto_backup_hour','19'),
  ('auto_backup_retention','30'),
  ('attention_overdue_days','0')
ON CONFLICT (key) DO NOTHING;
