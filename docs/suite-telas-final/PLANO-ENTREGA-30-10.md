# Plano de entrega da Suíte Construtec (30/10/2026)

Traçado em 30/09/2026 a partir do rascunho do Lucas no caderno:

Sistemas → Etapas → Orçamentos e Centro de Custos em paralelo → Finalizar o funcionamento lógico → Revisar o backend (analisar e corrigir bugs) → Finalizar o frontend → Entrega do sistema em 30/10/2026.

Escopo assumido: Orçamentos e Centro de Custos, nas três frentes (computador, site do celular `/m/` e app Suíte). Hub e ChamadoPro ficam fora.

## Calendário

| Etapa | Período | Dias úteis | Portão |
|---|---|---|---|
| 1. Funcionamento lógico (Orçamentos e Centro em paralelo) | 01/10 a 09/10 | 7 | 09/10 |
| 2. Revisar o backend e corrigir bugs | 13/10 a 20/10 | 6 | 20/10 |
| 3. Finalizar o frontend | 21/10 a 27/10 | 5 | 27/10 |
| 4. Entrega | 28/10 a 30/10 | 3 | 30/10 |

- 12/10 (segunda) é feriado.
- Cada etapa termina num portão: só se passa para a próxima com o critério cumprido. O que não couber vai para depois da entrega, sem empurrar a data.
- Todo passo de produção (migração, deploy, release) para e pede o OK do Lucas.
- O caminho crítico são os testes de campo do Lucas na etapa 1: os bugs da etapa 2 saem deles.

## Antes de começar (01/10)

- Fechar a T-007 em `TASKS.md` e `STATUS.md`. A D6 já foi publicada, mas a tarefa segue IN_PROGRESS e reserva `public/d/index.html` e `routes/users.js`, que a D7 vai usar. Pelo protocolo, outro agente ficaria travado.
- Os dois checkouts principais estão em branch de feature de outra sessão em andamento: `feat/excluir-obra-sem-movimento` no Centro (commit `5572158`, sem push) e `feat/desfazer-aprovacao` no Orçamentos (mudanças sem commit, migração 015). Não mexer. Voltar para `main` antes de qualquer deploy, porque o Orçamentos publica pela pasta principal.

## Etapa 1: funcionamento lógico (01/10 a 09/10)

Objetivo: nenhuma regra de negócio pendente nos dois sistemas. Depois de 09/10 não entra função nova.

### Centro de Custos

- Descartar e recuperar obra sem movimento, inclusive a vinda de orçamento aprovado: terminar, revisar e publicar junto com o "desfazer aprovação" do Orçamentos.
- D7, parte do servidor (lacunas em `centro-custos-construtec-v3/docs/suite-desktop/02-LACUNAS-SERVIDOR.md`; em 30/09 o checklist do fechamento e os filtros novos do histórico ainda não existiam no código; conferir os demais antes de começar):
  - Fechamento: checklist "antes de fechar" (vencidas, pagas sem anexo, cobranças sem NF ou sem envio, lançamentos em aberto, recorrentes não gerados), fechar com pendências e reabrir com motivo de 10 caracteres ou mais (hoje aceita 5).
  - Histórico: filtro por pessoa e período, antes e depois dos campos, origem (computador, celular ou fila offline) e exportar CSV.
  - Reports: diagnóstico e anexo no envio.
  - Configurações: nome e telefone no perfil, trocar a senha encerra as outras sessões, cópia do estado atual antes de restaurar um backup, versão vinda do `package.json`.
- "Pedir autorização" do financeiro (print 44): passou da D4 para a D6 e não aparece no código em 30/09. Registrar o pedido na auditoria e avisar os gestores pela central de notificações.

### Orçamentos

- Desfazer aprovação e propostas descartadas (migração 015), em andamento em outra sessão.
- PRs antigos #75 (layout do EXSAT) e #12 (texto do OCR): mesclar ou fechar.
- As 4 contas locais antigas que ainda não entraram de novo: manter como consulta ou desativar.

### Testes de campo do Lucas (até 09/10)

- D6 com a conta corporativa: convite por e-mail e matriz de permissões editável.
- Push no Galaxy A17: abrir o app, permitir notificações, sino, "Enviar notificação de teste".
- RC19: cadastro real, link do convite abrindo o app, tour e tela de carregamento.
- iPhone: Adicionar à Tela de Início e entrar pelo ícone.
- Assistente: uma pergunta sobre propostas com a conta corporativa.
- Orçamentos no celular: proposta aberta por uma conta sem p10 (sem custo, BDI e margem) e o sino com conta real.

Cada falha vira um item na lista de bugs da etapa 2.

**Portão (09/10):** tudo acima mesclado e publicado; Centro com `npm test` e `npm run check` verdes; Orçamentos com `npm run verify` verde; testes de campo feitos.

## Etapa 2: revisar o backend e corrigir bugs (13/10 a 20/10)

### Revisão

- Revisão independente (Codex ou outro agente) dos dois servidores: login e handoff entre os apps, sessões, matriz de permissões p1 a p12 dos dois lados, obras por usuário (403 por URL) e a integração Orçamentos → Centro.
- Produção igual ao código: conferir o esquema real de cada banco contra as migrações (mapa dos bancos em `centro-custos-construtec-v3/docs/DADOS-PRODUCAO.md`). A tabela `users` trocada fora do código no Neon, em 27/09, mostra que isso diverge.
- Backup: restaurar de verdade uma cópia de cada banco num banco de teste e conferir os números.
- Dependências: Dependabot #68, #58 e #22 no Centro, #99 e #83 no Orçamentos. A CI do Centro barra alerta alto do `npm audit`.
- Testes instáveis: `database-lock.test.js` e `jobs-queue.test.js` (PGlite com pouca memória). Estabilizar para não esconder falha real.

### Bugs

- Uma lista só, juntando os Reports de produção, as falhas dos testes de campo e os achados da revisão.
- Classificar em bloqueante, alto, médio e baixo. Bloqueante e alto são corrigidos nesta etapa; médio entra se sobrar tempo; baixo fica para depois da entrega.
- Já conhecido: o assistente de IA está lento.

**Portão (20/10):** nenhum bug bloqueante ou alto aberto, revisão sem achado crítico pendente, esquema de produção conferido e restauração de backup testada.

## Etapa 3: finalizar o frontend (21/10 a 27/10)

### Centro de Custos

- D7, telas: Fechamento (prints 70 a 75), Histórico (76 a 79), Reports (80 a 83) e Configurações (90 a 95).
- Prints da D6 que faltaram (1440 × 900 e 1280 × 800, claro e escuro).
- Troca do padrão: `/` abre o desktop novo e o antigo vai para `/classico/`. Conferir o app Windows (abre `/`) e a nuvem servindo `/d/`.

### Orçamentos

- Computador: seguir o design `DesktopOrc.dc.html` (Rodadas 23 e 24, já implementadas). O que divergir dele vira ticket de acabamento, não de redesenho (decisão 2, revisada em 12/10).
- Celular: PDF, comparativo, importar catálogo e EXSAT já existem no `/m/` (Rodadas 21 e 22, publicadas). Falta conferir contra o protótipo (decisão 3, revisada em 12/10).
- Rede de segurança: se alguma tela não passar na conferência até 20/10, o Orçamentos vai com o layout atual e as cores da Suíte, e as 4 telas do celular na versão completa.

### App Suíte

- RC final (RC20) com tudo, instalada no A17 e conferida no iPhone.

**Portão (27/10):** todas as telas conferidas contra os prints nos dois temas e resoluções, `/` no desktop novo e a RC final testada no aparelho.

## Etapa 4: entrega (28/10 a 30/10)

- 28/10: congelamento (só entra correção bloqueante) e roteiro completo com o Lucas, passando por todas as telas com um usuário de cada um dos seis papéis.
- 29/10: versão final `v3.1.0` (APK e Windows do Centro, instalador do Orçamentos), último deploy, backup do dia conferido, documentação e `CONTINUAR-AQUI.md` atualizados.
- 30/10: entrega do sistema. Contas da equipe criadas ou convidadas com papel, apps e obras certos.

## Decisões do Lucas (respondidas em 30/09)

| # | Decisão | Resposta |
|---|---|---|
| 1 | Escopo da entrega | Só Orçamentos e Centro |
| 2 | Desktop do Orçamentos | Usar o design da Suíte. **Atualizado em 12/10:** o protótipo chegou (`docs/suite-desktop/prototipo-orcamentos/DesktopOrc.dc.html`, Rodadas 23 e 24, `origin/main` do Orçamentos) e foi implementado. Vale o `DesktopOrc.dc.html` |
| 3 | Celular do Orçamentos: PDF, comparativo, importar catálogo e EXSAT | Entram no `/m/` novo. **Atualizado em 12/10:** Rodadas 21 e 22 (`docs/suite-mobile/prototipo/`) implementadas e publicadas; falta a conferência |
| 4 | Instalador do Windows sem assinatura | Só para a equipe |
| 5 | `/classico/` | Decidido pelo Claude: fica no ar 30 dias depois da troca (até ~26/11), com link "Versão clássica" em Configurações; depois vira redirecionamento para `/`. Confirmado em 12/10. Estado em 12/10: `/` já redireciona para `/d/`; a rota `/classico/` e o link ainda não existem |
| 6 | "Pedir autorização" do financeiro (print 44) | 12/10: fora da entrega, por ser função nova. Fica para depois de 30/10; a tela fica sem o botão |
| 7 | Critério de "tela finalizada" | 12/10: confere com a referência (protótipo) nos dois temas; sem corte em 1280×720 e 1440×900 (desktop) e 375 (celular); Centro e Orçamentos iguais, sem rolagem aninhada; desnecessário removido avisando; testes verdes e publicada. Aparelho real só na RC final de 27/10 |
| 8 | Função nova até 30/10 | 12/10: não entra. Backup, OCR e seleção múltipla de cobranças ficam só no computador. Só entra buraco bloqueante achado em teste de campo |
| 9 | Publicação | 12/10: cada ticket mescla na `main` e publica, nos dois sistemas, um deploy por vez e sempre da `main` |

## Riscos

- Testes de campo atrasarem: marcar um dia fixo com o Lucas na primeira semana.
- Várias sessões nos checkouts principais ao mesmo tempo: uma sessão publica por vez e registra no andamento abaixo.
- Esquema de produção divergente do código (já aconteceu no Neon).
- CI do Centro barrando por alerta novo do `npm audit`.
- Container só troca de versão depois de hibernar (Centro 10 min, Orçamentos 5 min sem requisições).

## Andamento

| Data | Etapa | O que aconteceu |
|---|---|---|
| 30/09 | Antes de começar | Plano traçado |
| 30/09 | Antes de começar | Decisões respondidas; prompts de design do Orçamentos criados |
| 02 a 03/10 | Etapa 1 | Rodadas 21 e 22 (celular) e 23 e 24 (desktop) do Orçamentos implementadas e publicadas |
| 06 a 12/10 | Etapa 1 | D7 (servidor e telas) no Centro, `/` redirecionando para `/d/`, paridade do celular (Fase 2), letras maiores no desktop e barra de abas no ar. Detalhes em `CONTINUAR-AQUI.md` |
| 12/10 | Etapa 3 | Auditoria de telas e rodada de decisões (decisões 6 a 9). Falta: conferência contra o protótipo, prints de D6 e D7, `/classico/` e RC final. Etapas 1 e 2 não foram reavaliadas neste registro |
