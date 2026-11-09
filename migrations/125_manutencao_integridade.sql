CREATE FUNCTION guard_maintenance_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id OR
     NEW.period IS DISTINCT FROM OLD.period OR NEW.monthly_amount IS DISTINCT FROM OLD.monthly_amount THEN
    RAISE EXCEPTION 'MAINTENANCE_PERIOD_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER maintenance_period_guard BEFORE UPDATE OR DELETE ON maintenance_periods
  FOR EACH ROW EXECUTE FUNCTION guard_maintenance_period();
