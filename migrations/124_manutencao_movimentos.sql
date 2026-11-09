CREATE TABLE maintenance_movements (
  id SERIAL PRIMARY KEY,
  public_id UUID NOT NULL UNIQUE,
  cost_center_id INTEGER NOT NULL REFERENCES cost_centers(id),
  destination_id INTEGER REFERENCES cost_centers(id),
  financial_transaction_id INTEGER REFERENCES transactions(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  movement_date DATE NOT NULL,
  reversal_of UUID REFERENCES maintenance_movements(public_id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((destination_id IS NULL) <> (financial_transaction_id IS NULL)),
  CHECK (destination_id IS NULL OR destination_id <> cost_center_id)
);
CREATE UNIQUE INDEX maintenance_movement_reversal ON maintenance_movements(reversal_of) WHERE reversal_of IS NOT NULL;
CREATE UNIQUE INDEX maintenance_movement_financial ON maintenance_movements(financial_transaction_id) WHERE financial_transaction_id IS NOT NULL;
CREATE INDEX maintenance_movement_source ON maintenance_movements(cost_center_id,movement_date);
CREATE INDEX maintenance_movement_destination ON maintenance_movements(destination_id,movement_date);

CREATE FUNCTION guard_maintenance_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'MAINTENANCE_MOVEMENT_IMMUTABLE';
END $$;
CREATE TRIGGER maintenance_movement_guard BEFORE UPDATE OR DELETE ON maintenance_movements
  FOR EACH ROW EXECUTE FUNCTION guard_maintenance_movement();

CREATE FUNCTION guard_maintenance_financial_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM maintenance_movements WHERE financial_transaction_id=OLD.id) AND
     (NEW.type IS DISTINCT FROM OLD.type OR NEW.amount IS DISTINCT FROM OLD.amount OR
      NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date OR
      NEW.approval_status IS DISTINCT FROM OLD.approval_status) THEN
    RAISE EXCEPTION 'MAINTENANCE_FINANCIAL_ENTRY_LOCKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER maintenance_financial_entry_guard BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION guard_maintenance_financial_entry();
