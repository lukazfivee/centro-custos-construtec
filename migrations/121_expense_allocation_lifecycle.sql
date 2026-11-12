-- Projeções gerenciais: nenhuma reconciliação retroativa é executada nesta migração.
ALTER TABLE expense_allocations ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE expense_allocations ADD COLUMN reversal_of_allocation_id UUID
  REFERENCES expense_allocations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX expense_allocation_reversal_unique
  ON expense_allocations(transaction_id, reversal_of_allocation_id)
  WHERE reversal_of_allocation_id IS NOT NULL;
CREATE INDEX cost_recognitions_allocation_idx ON cost_recognitions(allocation_id);

-- Mantém um reconhecimento aprovado por apropriação, preservando os demais no histórico.
CREATE FUNCTION refresh_expense_recognition(allocation_key UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE a expense_allocations; t transactions; recognition_key UUID;
BEGIN
  SELECT * INTO a FROM expense_allocations WHERE id=allocation_key;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO t FROM transactions WHERE id=a.transaction_id;
  IF NOT a.active OR a.mapping_status<>'mapped' OR t.deleted_at IS NOT NULL
    OR t.type<>'despesa' OR t.financial_status<>'liquidado' OR t.approval_status<>'aprovado' THEN
    UPDATE cost_recognitions SET status='reversed' WHERE allocation_id=a.id AND status='approved';
    RETURN;
  END IF;
  SELECT id INTO recognition_key FROM cost_recognitions WHERE allocation_id=a.id
    ORDER BY created_at,id LIMIT 1;
  IF recognition_key IS NULL THEN
    INSERT INTO cost_recognitions(cost_center_id,contract_id,allocation_id,control_item_id,
      recognition_date,amount,sign,status,notes)
    VALUES(a.cost_center_id,a.contract_id,a.id,a.control_item_id,t.transaction_date,
      a.amount,t.accounting_sign,'approved',a.notes);
  ELSE
    UPDATE cost_recognitions SET cost_center_id=a.cost_center_id,contract_id=a.contract_id,
      control_item_id=a.control_item_id,recognition_date=t.transaction_date,amount=a.amount,
      sign=t.accounting_sign,status='approved',notes=a.notes WHERE id=recognition_key;
    UPDATE cost_recognitions SET status='reversed'
      WHERE allocation_id=a.id AND id<>recognition_key AND status='approved';
  END IF;
END $$;

-- Executada ao final da transação: os rateios já estão completos e os estornos validados.
-- Todas as origens (HTTP, lote, CSV, pacote, conflitos e serviços) passam por estes triggers.
CREATE FUNCTION reconcile_expense_allocations(entry_id INTEGER) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t transactions; part RECORD; a expense_allocations; source expense_allocations;
  allocation_key UUID; contract_key UUID; mapped_count INTEGER; mapped_total NUMERIC;
  allocation_count INTEGER; allocation_total NUMERIC;
BEGIN
  PERFORM id FROM financial_write_gate WHERE id=1 FOR UPDATE;
  SELECT * INTO t FROM transactions WHERE id=entry_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF t.deleted_at IS NOT NULL OR t.type<>'despesa' OR t.financial_status<>'liquidado'
    OR t.approval_status<>'aprovado' THEN
    UPDATE expense_allocations SET active=FALSE WHERE transaction_id=entry_id;
    UPDATE cost_recognitions SET status='reversed' WHERE status='approved'
      AND allocation_id IN (SELECT id FROM expense_allocations WHERE transaction_id=entry_id);
    RETURN;
  END IF;

  IF t.reversal_of IS NOT NULL THEN
    -- O original permanece positivo. A compensação tem data e sinal próprios.
    PERFORM reconcile_expense_allocations(id) FROM transactions WHERE public_id=t.reversal_of;
    FOR source IN SELECT ea.* FROM expense_allocations ea JOIN transactions original
      ON original.id=ea.transaction_id WHERE original.public_id=t.reversal_of AND ea.active LOOP
      SELECT id INTO allocation_key FROM expense_allocations
        WHERE transaction_id=entry_id AND reversal_of_allocation_id=source.id;
      IF allocation_key IS NULL THEN
        allocation_key=gen_random_uuid();
        INSERT INTO expense_allocations(id,transaction_id,cost_center_id,contract_id,control_item_id,
          material_line_id,labor_line_id,amount,quantity,unit,mapping_status,notes,reversal_of_allocation_id)
        VALUES(allocation_key,entry_id,source.cost_center_id,source.contract_id,source.control_item_id,
          source.material_line_id,source.labor_line_id,source.amount,source.quantity,source.unit,
          source.mapping_status,source.notes,source.id);
      ELSE
        UPDATE expense_allocations SET active=TRUE,amount=source.amount,contract_id=source.contract_id,
          control_item_id=source.control_item_id,material_line_id=source.material_line_id,
          labor_line_id=source.labor_line_id,mapping_status=source.mapping_status WHERE id=allocation_key;
      END IF;
      PERFORM refresh_expense_recognition(allocation_key);
    END LOOP;
    -- Apropriações manuais antigas do estorno não podem somar junto da compensação canônica.
    UPDATE expense_allocations SET active=FALSE WHERE transaction_id=entry_id
      AND reversal_of_allocation_id IS NULL;
  ELSE
    -- Desativa parcelas de obras que saíram do rateio; não apaga o vínculo histórico.
    UPDATE expense_allocations SET active=FALSE WHERE transaction_id=entry_id AND cost_center_id NOT IN (
      SELECT cost_center_id FROM transaction_allocations WHERE transaction_id=entry_id
      UNION ALL SELECT t.cost_center_id WHERE NOT EXISTS (
        SELECT 1 FROM transaction_allocations WHERE transaction_id=entry_id));

    FOR part IN SELECT cost_center_id,amount FROM transaction_allocations WHERE transaction_id=entry_id
      UNION ALL SELECT t.cost_center_id,t.amount WHERE NOT EXISTS (
        SELECT 1 FROM transaction_allocations WHERE transaction_id=entry_id) LOOP
      -- Preserva o contrato já apropriado; caso novo, a escolha tem ordenação estável.
      SELECT pc.id INTO contract_key FROM project_contracts pc WHERE pc.cost_center_id=part.cost_center_id
        AND pc.status='active' AND pc.current_baseline_id IS NOT NULL
        ORDER BY EXISTS(SELECT 1 FROM expense_allocations ea WHERE ea.transaction_id=entry_id
          AND ea.cost_center_id=part.cost_center_id AND ea.contract_id=pc.id) DESC,
          pc.created_at,pc.id LIMIT 1;
      IF contract_key IS NULL THEN CONTINUE; END IF;

      SELECT COUNT(*),COALESCE(SUM(amount),0) INTO mapped_count,mapped_total FROM expense_allocations
        WHERE transaction_id=entry_id AND cost_center_id=part.cost_center_id
          AND mapping_status='mapped' AND contract_id=contract_key;
      SELECT COUNT(*),COALESCE(SUM(amount),0) INTO allocation_count,allocation_total FROM expense_allocations
        WHERE transaction_id=entry_id AND cost_center_id=part.cost_center_id AND active
          AND (contract_id=contract_key OR contract_id IS NULL);
      IF allocation_count>1 AND mapped_count>0 THEN
        IF allocation_total<>part.amount THEN
          RAISE EXCEPTION 'BUDGET_ALLOCATION_REMAP_REQUIRED' USING ERRCODE='P4005';
        END IF;
        -- Desmapear uma parcela não redistribui seu valor para as demais.
        CONTINUE;
      END IF;
      IF mapped_count>1 AND mapped_total<>part.amount THEN
        RAISE EXCEPTION 'BUDGET_ALLOCATION_REMAP_REQUIRED' USING ERRCODE='P4005';
      END IF;
      IF mapped_count>0 THEN
        UPDATE expense_allocations SET active=TRUE,amount=CASE WHEN mapped_count=1 THEN part.amount ELSE amount END
          WHERE transaction_id=entry_id AND cost_center_id=part.cost_center_id
            AND mapping_status='mapped' AND contract_id=contract_key;
        UPDATE expense_allocations SET active=FALSE WHERE transaction_id=entry_id
          AND cost_center_id=part.cost_center_id AND (mapping_status='unmapped' OR contract_id IS DISTINCT FROM contract_key);
      ELSE
        SELECT id INTO allocation_key FROM expense_allocations WHERE transaction_id=entry_id
          AND cost_center_id=part.cost_center_id AND mapping_status='unmapped'
          ORDER BY active DESC,created_at,id LIMIT 1;
        IF allocation_key IS NULL THEN
          allocation_key=gen_random_uuid();
          INSERT INTO expense_allocations(id,transaction_id,cost_center_id,contract_id,amount)
            VALUES(allocation_key,entry_id,part.cost_center_id,contract_key,part.amount);
        END IF;
        UPDATE expense_allocations SET active=(id=allocation_key),amount=CASE WHEN id=allocation_key
          THEN part.amount ELSE amount END,contract_id=CASE WHEN id=allocation_key THEN contract_key ELSE contract_id END
          WHERE transaction_id=entry_id AND cost_center_id=part.cost_center_id;
      END IF;
    END LOOP;
  END IF;
  FOR a IN SELECT * FROM expense_allocations WHERE transaction_id=entry_id LOOP
    PERFORM refresh_expense_recognition(a.id);
  END LOOP;
END $$;

CREATE FUNCTION reconcile_expense_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='transactions' THEN
    IF TG_OP<>'DELETE' THEN PERFORM reconcile_expense_allocations(NEW.id); END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN PERFORM reconcile_expense_allocations(OLD.transaction_id); END IF;
    IF TG_OP<>'DELETE' AND (TG_OP='INSERT' OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id) THEN
      PERFORM reconcile_expense_allocations(NEW.transaction_id);
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER expense_transaction_lifecycle AFTER INSERT OR UPDATE OR DELETE ON transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_expense_event();
CREATE CONSTRAINT TRIGGER expense_split_lifecycle AFTER INSERT OR UPDATE OR DELETE ON transaction_allocations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_expense_event();

-- Orçamento que chega depois do lançamento também habilita a apropriação.
CREATE FUNCTION reconcile_contract_expenses() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_id INTEGER;
BEGIN
  IF NEW.status='active' AND NEW.current_baseline_id IS NOT NULL THEN
    FOR entry_id IN SELECT id FROM transactions WHERE cost_center_id=NEW.cost_center_id
      UNION SELECT transaction_id FROM transaction_allocations WHERE cost_center_id=NEW.cost_center_id LOOP
      PERFORM reconcile_expense_allocations(entry_id);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER expense_contract_lifecycle AFTER INSERT OR UPDATE ON project_contracts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconcile_contract_expenses();
