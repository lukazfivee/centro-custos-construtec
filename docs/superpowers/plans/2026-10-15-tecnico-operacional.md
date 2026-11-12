# Técnico operacional — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Limitar o técnico à execução de obras e serviços atribuídos diretamente em seus detalhes.
**Architecture:** Reutilizar user_cost_centers para escopo obrigatório de técnico. Separar autorização de campo de p2; bloquear superfície financeira e filtrar respostas operacionais no servidor. Clientes apresentam somente ações autorizadas.
**Tech Stack:** Node.js, Express, PostgreSQL/PGlite, JavaScript e CSS existentes.
**Spec:** docs/superpowers/specs/2026-10-15-tecnico-operacional-design.md

## Restrições globais
- Obras e serviços independentes, sem vínculo pai/filho.
- MAX_LINES<=350; sem emojis; nenhuma dependência nova.
- Agenda diária e novos estados de pausa ficam para etapa futura.
- Preservar autorização de publicação já concedida.

## Foco da revisão
- Técnico legado all_cost_centers=true continua restrito a atribuições explícitas.
- Revogação deve funcionar na próxima requisição sem relogar.
- IA não deve obter dados financeiros por ferramentas antigas nem navegação direta.
- Execução deve funcionar sem permissão de despesas.
- Admin/gestor e outros perfis preservam capacidades existentes.

### 1. Servidor: escopo e proteção financeira
- [x] Escrever regressões HTTP para técnico sem atribuição, acesso global legado, bloqueio financeiro e execução sem p2; confirmar falha.
- [x] Ajustar services/permissions.js, services/obraScope.js, rotas financeiras, services/servicos/core.js e rotas de campo. Exportar exigirExecucao de permissions.js (técnico ou p2), deixando p2 financeiro indisponível ao técnico mesmo com matriz remota antiga.
- [x] Sanitizar lista/detalhe de centros e serviços para técnico; proteger consultas/exportações e mutações financeiras.
- [x] Executar testes relevantes e atualizar expectativas incompatíveis com a regra antiga.

### 2. Atribuições dentro do item
- [x] Testar GET/PUT /api/centros-custo/:id/tecnicos para p5 e escopo técnico resultante.
- [x] Criar routes/costCenterTechnicians.js, montar antes das demais rotas de centros, validar contas ativas canônicas de técnico e auditar substituição transacional com comparação da seleção anterior para evitar sobrescrita concorrente.
- [x] Adicionar componente mobile e desktop compartilhando contrato {tecnicos:[{id,nome}],atribuidos:[id]} e PUT {tecnicos:[id],anteriores:[id]}.
- [x] Validar atribuição, remoção e conflitos por HTTP e interface.

### 3. Interface operacional mobile
- [x] Testar papel no menu e ausência de ações/valores financeiros.
- [x] Ajustar permissões CC.sv, menu, início, obras e detalhe de serviço, navegação e telas diretas. Adicionar CC.sv.campo() para técnico ou p2. Preservar funcionalidades de campo offline.
- [x] Executar testes de frontend e navegação.

### 4. Assistente
- [x] Testar sugestões e ferramentas por perfil, inclusive execução direta bloqueada antes da API.
- [x] Ajustar public/m/ia-config.js, ia-tools.js, ia-chat.js e public/d/ia-desktop.js com autorização canônica e sugestões operacionais.
- [x] Rodar regressões mobile/desktop de IA.

### 5. Integração e publicação
- [x] Revisar alterações conectadas, executar suite completa e fluxo técnico no navegador.
- [ ] Atualizar service worker e publicar usando Docker/Cloudflare autorizados.
- [ ] Conferir versão remota e comportamento sem autenticação. Reportar limites reais de validação.
