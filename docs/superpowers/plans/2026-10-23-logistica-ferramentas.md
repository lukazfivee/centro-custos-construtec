# Logística de Ferramentas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Controlar ferramentas por unidade, kits padrão e extras, responsabilidade assinada, faltas, devoluções e avarias.

**Architecture:** Uma nova migration PostgreSQL/PGlite e um serviço transacional alimentam rotas Express protegidas. A tela desktop serve a `admin` e `gestor` via `p5`; o técnico acessa somente seu kit e ações de recebimento no mobile. O cabeçalho reutilizável de recibo, assinado pelo técnico e idempotente, também será usado pelo plano de materiais.

**Tech Stack:** Node.js 20+, Express, PGlite/PostgreSQL, JavaScript/CSS vanilla, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-23-logistica-ferramental-design.md`

## Global Constraints

- Respeitar `MAX_LINES <= 350` por arquivo.
- Não usar emojis no frontend.
- Validar perfil, dono e atribuição no servidor em toda rota, inclusive ações móveis e repetição offline.
- Preservar histórico e corrigir movimentações por novo evento auditado, nunca por apagamento.
- Sem dependências novas; reutilizar assinatura desenhada, IndexedDB/fila offline, identidade e auditoria existentes.
- O técnico usa apenas as funções operacionais definidas; a Logística usa `admin`/`gestor` e `p5` existente.
- Nenhuma implementação deve alterar lançamentos financeiros ou escopo de Chamados.

## Review Focus

- Duas entregas simultâneas da mesma ferramenta não podem atribuí-la a dois técnicos; testar bloqueio transacional em Task 1.
- Repetir uma entrega/assinatura após sincronização não pode duplicar item, assinatura ou evento; testar `client_id` idempotente nas Tasks 1 e 3.
- Técnico com `all_cost_centers=true` antigo não pode ler kit alheio nem alterar ferramenta; testar na Task 1.
- Assinatura inválida ou maior que o limite deve ser recusada sem mudar o estado da entrega; testar na Task 3.
- Falta, devolução parcial, reparo e baixa definitiva precisam manter estados e histórico coerentes; testar nas Tasks 3 e 4.

---

## File Structure

- Create `migrations/118_logistica_ferramentas.sql`: tipos de ferramenta, unidades, composição do kit padrão, recibo compartilhado, itens de ferramenta e eventos imutáveis.
- Create `services/logistica.js`: transações para cadastro, entrega, assinatura, devolução, falta, avaliação e histórico.
- Create `routes/logistica.js`: endpoints Express com autenticação e validação de papel/dono.
- Modify `server.js`: montar as rotas em `/api/logistica`.
- Modify `services/technicianAccess.js`: permitir somente endpoints operacionais explícitos para técnico.
- Create `public/d/telas/logistica.js` and `public/d/css/logistica.css`: Resumo, Ferramentas, Kits e Movimentações.
- Modify `public/d/index.html` and `public/d/shell.js`: carregar tela/estilo e incluir navegação `Logística` visível via `p5`.
- Create `public/m/screen-meu-kit.js` and `public/m/screen-logistica-fila.js`: Meu kit, assinatura, relato de falta e processamento offline.
- Modify `public/m/index.html`, `public/m/app.js`, `public/m/queue.js`, `public/m/sw.js`, `public/m/screen-home-tecnico.js`: carregar os módulos, limitar a tela a técnico, expor entrada móvel e enfileirar assinatura idempotente.
- Create `test/logistica-ferramentas.integration.test.js`, `test/logistica-ferramentas-mobile.test.js`.

## Interfaces

- `services/logistica.js` exports `criarFerramenta(tx, dados, ator)`, `entregarFerramentas(tx, dados, ator)`, `assinarEntrega(tx, dados, ator)`, `devolverFerramentas(tx, dados, ator)`, `relatarFalta(tx, dados, ator)` and `avaliarFerramenta(tx, dados, ator)`. Each returns the saved record plus resulting states; mutations write their movement/event and audit row in the same transaction.
- `POST /api/logistica/entregas` consumes `{ tecnicoId, ferramentaIds, centroId?, client_id }`; only a manager can initiate it. It reserves tools immediately and returns a pending receipt.
- `PUT /api/logistica/entregas/:id/assinatura` consumes `{ dataHora, assinatura: { conteudoBase64 } }`; the authenticated technician must be that receipt's recipient. The server derives name and user id from the session.
- `GET /api/logistica/meu-kit` returns only the authenticated technician's standard and extra tools, missing items, and receipts awaiting signature.
- `POST /api/logistica/faltas` consumes `{ ferramentaId, relato }`; a technician can report only an item assigned to them.
- `services/logistica.js` exports shared `criarRecibo(tx, { tecnicoId, centroId, criadoPor, clientId })` and `assinarRecibo(tx, { reciboId, tecnicoId, dataHora, assinatura, clientId })` for Task 1. Materials add lines to the same receipt in the second plan.

### Task 1: Persistência, transações e acesso de ferramentas

**Files:** migration, `services/logistica.js`, `routes/logistica.js`, `server.js`, `services/technicianAccess.js`, `test/logistica-ferramentas.integration.test.js`.

- [ ] **Step 1: Add failing API tests** for manager-only inventory changes, technician self-only kit access, assigned tool validation, duplicate asset code, duplicate `client_id`, and concurrent attempts to assign one tool.
- [ ] **Step 2: Run `node --test test/logistica-ferramentas.integration.test.js`**; confirm failures cover missing routes/tables and access.
- [ ] **Step 3: Add migration 118 and service transactions** for individual tool units, standard kit requirements, common receipts, tool receipt lines, and append-only events. Lock selected tool rows before checking availability and assigning; use existing `recordAudit` inside the same transaction.
- [ ] **Step 4: Add routes and server registration**. Require `p5` for management and session-scoped ownership for technician reads/writes. Extend `technicianAccess.js` only for the self-kit, own-receipt signature and own missing-report routes.
- [ ] **Step 5: Re-run `node --test test/logistica-ferramentas.integration.test.js`**; expect all authorization, locking and idempotency assertions to pass.

### Task 2: Inventário, kits e conferência inicial no desktop

**Files:** desktop screen/style files, `public/d/index.html`, `public/d/shell.js`, `test/logistica-ferramentas.integration.test.js`.

- [ ] **Step 1: Add failing screen tests** for `Logística` menu visibility, summary counts, inventory search/status, standard kit editing and initial conference dated today.
- [ ] **Step 2: Run the focused desktop structure tests** and confirm the missing screen/menu assertions fail.
- [ ] **Step 3: Implement the desktop screen** with Resumo, Ferramentas, Kits dos técnicos and Movimentações, using the current desktop layout and empty/loading/error patterns. Allow registration of initial tool stock and assignment of currently-held tools through an “Conferência inicial” receipt, never a past delivery.
- [ ] **Step 4: Add kit and conference APIs** so the Gestor configures required types/quantities, records extra tools, and generates one current-date receipt per technician for confirmed current custody. Tools confirmed at base start available.
- [ ] **Step 5: Verify a generated conference receipt lists technician, tools, identifiers, date/time and signature state and can use browser print; run the focused desktop and API tests.**

### Task 3: Meu kit, divergências e assinatura offline

**Files:** mobile screens, `public/m/index.html`, `public/m/app.js`, `public/m/queue.js`, `public/m/sw.js`, `public/m/screen-home-tecnico.js`, `test/logistica-ferramentas-mobile.test.js`, integration tests.

- [ ] **Step 1: Add failing mobile tests** for own-kit rendering, standard/extras/missing states, drawn signature validation, reporting a missing assigned tool, and preserving the signing timestamp offline.
- [ ] **Step 2: Run `node --test test/logistica-ferramentas-mobile.test.js test/logistica-ferramentas.integration.test.js`**; confirm missing mobile and queue behavior.
- [ ] **Step 3: Add the Meu kit screen** and link it from the technician home. Reuse the drawn-canvas pattern in `public/m/screen-servico-exec.js`; show only the technician's current data and signature-pending receipts.
- [ ] **Step 4: Add idempotent queue operation `logistica-assinatura`** with stable `client_id`; retain signed time and PNG bytes until server acknowledgement. Add the new shell files to `sw.js` and bump the cache version.
- [ ] **Step 5: Add discrepancy reporting before signature** and keep the receipt pending until a Gestor reviews and corrects it. Reject empty/oversized/invalid signature payloads without changing reservation; test repeated queue delivery and server acknowledgement.
- [ ] **Step 6: Run the focused mobile/integration tests**; expect retries to produce one signature and one state transition.

### Task 4: Falta, devolução, avaria e histórico por unidade

**Files:** `services/logistica.js`, `routes/logistica.js`, desktop screen/style, mobile screen, `test/logistica-ferramentas.integration.test.js`.

- [ ] **Step 1: Add failing state-transition tests** for missing reports and apuração, replacement closing a missing-kit slot, partial return, damaged return to base evaluation, repaired re-entry, and permanent retirement retaining history.
- [ ] **Step 2: Run `node --test test/logistica-ferramentas.integration.test.js`** and confirm each unimplemented transition fails.
- [ ] **Step 3: Implement transitions as append-only events**. Keep a missing incident open until a replacement is signed to the technician; route damaged tools to `escritorio da base` and prohibit assignment until repair verification or reasoned retirement.
- [ ] **Step 4: Add item and technician history views** and filters for date, state and technician; display receipts and events in order and provide print output.
- [ ] **Step 5: Run `node --test test/logistica-ferramentas.integration.test.js test/logistica-ferramentas-mobile.test.js`**; expect all lifecycle, audit and ownership assertions to pass.

### Task 5: Verificação da primeira entrega

**Files:** tests and any affected source files identified above.

- [ ] **Step 1: Run `npm run check`**; expect all JavaScript syntax checks to pass.
- [ ] **Step 2: Run `npm test`**; expect the full repository suite to pass.
- [ ] **Step 3: Manually verify** as Gestor and as two different technicians: one initial conference, one signed assignment, a queued retry, a missing report, partial return and damaged-tool evaluation. Confirm one technician cannot open another's kit.

---

## Scope Boundary

This plan provides the tool inventory and kit workflow only. The materials catalog, quantity ledger, minimum-stock alerts and material requests are planned separately in `docs/superpowers/plans/2026-10-23-logistica-materiais.md` and reuse the receipt interface above.
