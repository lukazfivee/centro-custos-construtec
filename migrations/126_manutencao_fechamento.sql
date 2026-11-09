CREATE TRIGGER maintenance_period_gate BEFORE INSERT ON maintenance_periods
  FOR EACH STATEMENT EXECUTE FUNCTION lock_financial_writes();

CREATE FUNCTION guard_maintenance_period_closed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF financial_month_closed(NEW.period) THEN
    RAISE EXCEPTION 'FINANCIAL_MONTH_CLOSED' USING ERRCODE='P4001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER maintenance_period_closed_guard BEFORE INSERT ON maintenance_periods
  FOR EACH ROW EXECUTE FUNCTION guard_maintenance_period_closed();
