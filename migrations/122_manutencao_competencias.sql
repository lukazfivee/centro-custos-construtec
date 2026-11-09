CREATE TABLE maintenance_periods (
  id SERIAL PRIMARY KEY,
  cost_center_id INTEGER NOT NULL REFERENCES cost_centers(id),
  period DATE NOT NULL CHECK (EXTRACT(DAY FROM period) = 1),
  monthly_amount NUMERIC(14,2) NOT NULL CHECK (monthly_amount >= 0),
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cost_center_id, period)
);

CREATE FUNCTION guard_maintenance_center_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind AND EXISTS
    (SELECT 1 FROM maintenance_periods WHERE cost_center_id=OLD.id) THEN
    RAISE EXCEPTION 'MAINTENANCE_HISTORY_LOCKED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER maintenance_center_kind_guard BEFORE UPDATE OF kind ON cost_centers
  FOR EACH ROW EXECUTE FUNCTION guard_maintenance_center_kind();
