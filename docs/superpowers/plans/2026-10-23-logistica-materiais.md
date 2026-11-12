# Logística de Materiais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Controlar saldo de materiais, pedidos, entregas e devoluções de sobras por obra/serviço, mantendo recibo assinado pelo técnico responsável.

**Architecture:** Uma migration cria o catálogo, saldo e livro de movimentações; uma extensão do serviço transacional de Logística entrega quantidade e atualiza o saldo atomicamente. Gestor atende pedidos ou inicia entrega direta; o técnico pede e assina pelo mobile. Este plano depende da interface comum de recibos implementada pelo plano de ferramentas.

**Tech Stack:** Node.js 20+, Express, PGlite/PostgreSQL, JavaScript/CSS vanilla, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-23-logistica-ferramental-design.md`

## Global Constraints

- Respeitar `MAX_LINES <= 350` por arquivo.
- Não usar emojis no frontend.
- Toda saída exige obra/serviço atribuído ao técnico e técnico responsável; não confiar em IDs do cliente.
- Proibir saldo negativo; cada mutação de saldo e seu movimento precisam ocorrer na mesma transação.
- Preservar movimentações; correções geram ajuste auditado com motivo.
- Sem dependências novas; usar a assinatura/fila mobile e auditoria da Logística.
- Logística usa `admin`/`gestor` com `p5`; técnico pode pedir e assinar apenas suas próprias entregas.
- Não criar compras, fornecedores, integração de nota fiscal ou lançamentos financeiros.

## Review Focus

- Duas entregas concorrentes da mesma quantidade não podem levar saldo abaixo de zero; testar lock/update condicional na Task 1.
- Uma saída sem obra/serviço atribuído deve falhar, inclusive para conta com `all_cost_centers=true`; testar na Task 1.
- Repetir entrega em fila offline não pode baixar o saldo duas vezes; testar `client_id` idempotente nas Tasks 1 e 3.
- Estoque mínimo zero, acima do saldo e exatamente igual ao saldo devem gerar estado de alerta correto; testar nas Tasks 1 e 2.
- Devolução de sobra só pode ocorrer quando o item exigir retorno e não pode exceder o recebido menos devoluções anteriores; testar na Task 1.

---

## File Structure

- Create `migrations/119_logistica_materiais.sql`: catálogo, configuração de retorno/mínimo, movimentos, saldo inicial e pedidos.
- Modify `services/logistica.js`: entradas, saídas, devoluções, pedidos e alertas transacionais.
- Modify `routes/logistica.js`: endpoints de materiais, solicitações e consulta de saldo.
- Modify `public/d/telas/logistica.js` and `public/d/css/logistica.css`: abas Materiais, Solicitações e movimentos/alertas.
- Create `public/m/screen-logistica-materiais.js` and modify `public/m/index.html`, `public/m/app.js`, `public/m/queue.js`, `public/m/sw.js`: pedido de material e recibo assinado.
- Create `test/logistica-materiais.integration.test.js`, `test/logistica-materiais-mobile.test.js`.

## Dependency Interface

Implement after `2026-10-23-logistica-ferramentas.md` exposes:

- `criarRecibo(tx, { tecnicoId, centroId, criadoPor, clientId }) -> recibo`.
- `assinarRecibo(tx, { reciboId, tecnicoId, dataHora, assinatura, clientId }) -> recibo`.
- The receipt stores authenticated recipient, linked center, issuer/time, signature and unique idempotency key. Add material lines to that receipt before physical handoff; handoff immediately records the quantity out and sets status `aguardando_assinatura`.

### Task 1: Catálogo, livro de saldo e APIs

**Files:** migration, `services/logistica.js`, `routes/logistica.js`, `test/logistica-materiais.integration.test.js`.

- [ ] **Step 1: Add failing integration tests** for material registration, opening balance, receipts, direct delivery, partial delivery, duplicate `client_id`, concurrent deductions, return flag, return cap and center-assignment enforcement.
- [ ] **Step 2: Run `node --test test/logistica-materiais.integration.test.js`**; confirm missing schema/routes and invalid stock transitions fail.
- [ ] **Step 3: Add migration 119** for `logistics_materials` (`name`, `unit`, `on_hand`, `minimum_stock`, `requires_return`), append-only `logistics_material_movements`, request headers/items and receipt material lines. Enforce `on_hand >= 0`; index active requests, item history and low-stock lookup.
- [ ] **Step 4: Implement service operations**: `registrarEntrada(tx, materialId, quantidade, ator, motivo, clientId)`, `entregarMateriais(tx, reciboId, linhas, ator, clientId)`, `devolverSobra(tx, materialId, reciboId, quantidade, ator, clientId)` and `solicitarMateriais(tx, dados, ator)`. Lock material rows, validate positive quantities, item return policy and technician center access, then persist balance plus movement together.
- [ ] **Step 5: Add manager and technician routes**. Manager routes require `p5`; technician request/list/sign paths are scoped to session owner and assigned obra/serviço. Direct Gestor delivery requires recipient technician and center. Unavailable balance results in a pending or partial request, never a negative stock.
- [ ] **Step 6: Run the integration test**; expect atomic balance, authorization, return and idempotency assertions to pass.

### Task 2: Materiais, estoque mínimo e atendimento no desktop

**Files:** desktop Logística screen/style and `test/logistica-materiais.integration.test.js`.

- [ ] **Step 1: Add failing screen/API assertions** for material list, receipt form, per-item `requires_return`, minimum-stock alert and request queue state.
- [ ] **Step 2: Run focused tests** and confirm unimplemented views/alerts fail.
- [ ] **Step 3: Implement the Materiais view** with search, unit, current quantity, configured minimum, return policy and recent movement. Show an alert when `on_hand <= minimum_stock`; allow a Gestor to register receipt/initial quantity with reason.
- [ ] **Step 4: Implement the Solicitações view** with new, partial, awaiting-signature, complete and cancelled states. Let Gestor deliver from a request or start a direct issue, always selecting the recipient and obra/serviço. Permit partial delivery if stock is short and keep remaining quantity open.
- [ ] **Step 5: Add printable material receipt** with item, quantity/unit, recipient, issuer, center, date/time and signature state; verify filters for period, material, technician and center.
- [ ] **Step 6: Run `node --test test/logistica-materiais.integration.test.js`**; expect screens' data and endpoint authorization to pass.

### Task 3: Pedido e recibo do técnico no mobile

**Files:** `public/m/screen-logistica-materiais.js`, `public/m/index.html`, `public/m/app.js`, `public/m/queue.js`, `public/m/sw.js`, `test/logistica-materiais-mobile.test.js`.

- [ ] **Step 1: Add failing mobile tests** for center choices restricted to assigned work, positive quantities, request status, responsible technician signature, timestamp preservation and duplicate retry.
- [ ] **Step 2: Run `node --test test/logistica-materiais-mobile.test.js`** and confirm screen/queue behavior is absent.
- [ ] **Step 3: Implement technician request form** using assigned obra/serviço and material, unit and requested quantity; show own requests and pending receipts only.
- [ ] **Step 4: Reuse the receipt signature capture and `logistica-assinatura` queue operation** from the tools plan. Add `logistica-solicitacao` with a stable `client_id`; the API treats retries idempotently and validates the technician's center assignment when applying the request.
- [ ] **Step 5: Update the service-worker shell cache version and entries** for new mobile files.
- [ ] **Step 6: Run the mobile and integration tests**; expect direct issue and technician-request flows to result in one ledger movement and one signature.

### Task 4: Verificação integrada de materiais

**Files:** focused tests and any affected source files identified above.

- [ ] **Step 1: Run `npm run check`**; expect all syntax checks to pass.
- [ ] **Step 2: Run `npm test`**; expect the full repository suite to pass.
- [ ] **Step 3: Manually verify** initial count, entry, low-stock alert, technical request, direct Gestor issue, partial issue, signature retry, required-return item, non-return item and rejected over-return.

---

## Scope Boundary

The tool inventory and common receipt interface must be completed first. This plan adds material quantities and work allocations without altering financial expense records, adding purchases or adding a new user role.
