CREATE TRIGGER maintenance_movement_gate BEFORE INSERT ON maintenance_movements
  FOR EACH STATEMENT EXECUTE FUNCTION lock_financial_writes();

CREATE FUNCTION guard_maintenance_movement_closed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF financial_month_closed(NEW.movement_date) THEN
    RAISE EXCEPTION 'FINANCIAL_MONTH_CLOSED' USING ERRCODE='P4001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER maintenance_movement_closed_guard BEFORE INSERT ON maintenance_movements
  FOR EACH ROW EXECUTE FUNCTION guard_maintenance_movement_closed();
