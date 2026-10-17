# Programação diária — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Programar equipes por destino/data com progresso individual, linha do tempo compartilhada e acesso persistente até retirada pelo escritório.
**Architecture:** Atividades diárias independentes da situação de cost_centers/service_jobs. Participantes e eventos próprios; o cadastro da atividade acrescenta user_cost_centers. API de campo filtra por participante ativo e vínculo atual. Clientes compartilham o contrato, sem dados financeiros.
**Tech Stack:** Node/Express, PostgreSQL/PGlite, JavaScript/CSS existentes, IndexedDB/fila atual.
**Spec:** docs/superpowers/specs/2026-10-15-programacao-diaria-design.md

## Restrições globais
- Obras e serviços independentes; nada de ponto, GPS, mensagens externas, push ou novo sistema de fotos.
- Sem dependências novas, MAX_LINES<=350 nos arquivos criados, sem emojis, interfaces acessíveis.
- Datas civis em America/Sao_Paulo; atualizar somente hoje ou antes.
- Somente p5 administra; cada técnico altera seu próprio andamento. Acesso ao destino permanece até retirada explícita.

## Foco da revisão
- Remover participante ou vínculo bloqueia a próxima leitura/escrita sem perder histórico do escritório.
- Atualização de colega não conflita com revisão do outro técnico; repetição offline não duplica eventos.
- Troca de sessão não envia nem revela fila/cache de outra conta.
- Concluir atividade não altera situação do centro/serviço; reagendamento não apaga o dia anterior.
- Opções e respostas ao técnico não incluem diretório global nem dados financeiros.

## Contrato entre as frentes

Rotas sob /api/programacao (CC.api usa /programacao):
- GET ?dia=AAAA-MM-DD -> {dia,atividades:[Activity]}. P5 vê todas; técnico vê somente próprias com vínculo ativo. Eventos podem ser omitidos na lista.
- GET /opcoes?dia=... -> {tecnicos:[{id,nome,programado}],centros:[{id,codigo,nome,tipo,cliente}]}; somente p5.
- GET /:id -> Activity com eventos completos.
- POST / -> Activity (201); body {dia,centroId,orientacao,tecnicos:[id],ordem,origemId?}.
- PUT /:id -> Activity; body {revision,dia,orientacao,tecnicos:[id],ordem}. Centro não é alterado; com progresso existente, mudança de data exige copiar para outro dia.
- POST /:id/cancelar -> Activity; body {revision,motivo}. Cancela sem apagar eventos/vínculos.
- POST /:id/atualizacoes -> Activity; body {estado,observacao,revision,clientId}. Revision é a do participante; usuário vem da sessão. UUID clientId idempotente por usuário, vinculado à atividade/payload para não aceitar reutilização divergente.

Activity = {id,dia,ordem,orientacao,revision,cancelada,motivoCancelamento,origemId,centro:{id,codigo,nome,tipo,cliente},participantes:[{id,nome,estado,revision,ativo}],eventos?:[{id,usuarioId,nome,estado,observacao,criadoEm,tipo}]}. Estados: pendente, em_andamento, pausado, concluido. Tipos de evento: andamento, instrucao, equipe, cancelamento. Eventos administrativos podem ter estado null.

Adicionar participante cria vínculo ao centro. Editar instruções não recria vínculo explicitamente revogado de participante já existente. Remover participante marca ativo=false; histórico fica. Reintrodução preserva eventos e revisão. Cancelada é somente leitura para participantes ainda autorizados. Nenhuma exclusão destrutiva.

### 1. Servidor e dados
Files: migrations/117_programacao_diaria.sql, routes/programacao.js, services/programacao/*, services/technicianAccess.js, test/programacao*.test.js. Root monta a rota em server.js.
- [x] Escrever regressões HTTP do contrato, executar e confirmar falha por rota inexistente.
- [x] Criar migração aditiva, validação, consultas e mutações com auditoria e concorrência; filtrar metadados seguros e identidade canônica.
- [x] Testar equipe de dois, destinos múltiplos, status separados, idempotência divergente, revogação, inativos/não técnicos, cópia, cancelamento, datas e preservação da situação do serviço.
- [x] Executar testes específicos e relatar resultados.

### 2. Meu dia e fila mobile
Files: public/m/screen-meu-dia.js, screen-programacao-atividade.js, programacao-fila.js, programacao.css, app.js, queue.js; testes mobile/VM. Root monta scripts/CSS.
- [x] Escrever regressões comportamentais de cartões/progresso individual, sessão e fila; confirmar vermelho.
- [x] Criar CC.screens['meu-dia'] e ['atividade-dia']; manter CC.screens['meus-trabalhos'] com home técnico antigo e direcionar CC.homeTecnico para Meu dia após carregar o script. Usar filtros de data, linhas de estado por pessoa, histórico e atualização própria.
- [x] Integrar fila existente com op='programacao', atividadeId (sem fingir servicoId), CC.programacaoFila.sendOp(item). Preservar bloqueio de despesas e ordem por atividade; indicar pendentes/erros e permitir revisão de conflito sem perder texto.
- [x] Ajustar guardas de navegação, atualização pós-sync e fallback offline. Não misturar fotos/aceite existentes com operações da programação.
- [x] Validar por testes focados, sem alterar E2Es de root.

### 3. Programação do escritório
Files: public/m/programacao-escritorio.js e helper/form se necessário, screen-programacao.js, CSS próprio, public/d/telas/programacao.js, d-core.js, shell.js, public/m/screen-misc.js; testes de gestão. Root monta scripts/CSS.
- [x] Escrever teste comportamental vermelho da seleção e criação/edição/cópia/cancelamento.
- [x] Criar componente de gestão reutilizado entre mobile e desktop, com data, destino independente, equipe, orientação, ordem e seleção explícita de técnicos sem programação. Salvar disponibiliza imediatamente.
- [x] Exibir estados e eventos individuais do time; copiar pendência para outra data e cancelar com motivo. Preservar formulários quando API falha/409 e validar permissões p5.
- [x] Incluir entrada no menu mobile e navegação desktop somente para p5; validar testes específicos.

### 4. Integração, IA, revisão e publicação (root)
- [x] Montar rotas/assets, atualizar service worker, adaptar IA para consultar programação por data com autorização e projeção operacional.
- [x] Criar E2E com planejamento por gestor, login de dois técnicos, atualização individual visível ao colega, pausa/retomada e execução existente preservada; adaptar E2E anterior ao novo início.
- [x] Executar npm test, sintaxe, testes de navegador, revisão independente e corrigir achados.
- [ ] Integrar por PR com CI Node20/24 e Android, publicar Docker/Cloudflare autorizados e verificar arquivos remotos/APIs protegidas.

## Validação pré-integração

- npm test em Node24:616 testes passaram, sem falhas.
- Sintaxe:295 arquivos JavaScript verificados.
- Edge375px: programação e regressão técnica passaram; telas claras/escuras inspecionadas.
- Revisão independente: payload numérico, revogação de cache, concorrência de UUID e sessão da Suíte corrigidos e cobertos por regressões.
- Contas corporativas do Windows abrem a agenda central no navegador, sem substituir a sessão local do Centro.
- Publicação/CI são a etapa seguinte desta entrega; aparelho físico e instalador Windows não foram exercitados localmente.
