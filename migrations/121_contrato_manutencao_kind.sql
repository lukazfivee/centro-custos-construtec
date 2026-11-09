ALTER TABLE cost_centers DROP CONSTRAINT IF EXISTS cost_centers_kind_check;
ALTER TABLE cost_centers ADD CONSTRAINT cost_centers_kind_check
  CHECK (kind IN ('obra', 'servico', 'contrato_manutencao'));
