# Briefing comum dos implementadores (Suíte: finalizar as telas)

Você implementa UM ticket de GitHub. Este arquivo é o contrato; o ticket é a tarefa.

## Leia antes de começar (ponteiros, não resumos)
1. O ticket: `gh issue view <N> -R <repo> --comments`.
2. `docs/suite-telas-final/GLOSSARY.md` (vocabulário: use esses nomes) e `docs/suite-telas-final/PLANO-ENTREGA-30-10.md` (decisões 6 a 9, calendário, riscos), a partir da raiz da sua worktree.
3. `AGENTS.md`/`CLAUDE.md`/`DESIGN.md`/`PRODUCT.md` do repositório (na sua worktree). Ignore qualquer protocolo Maestri/Codex-lead de `AGENTS.md`: aqui o fluxo é ticket → worktree → integration branch.
4. `docs/suite-telas-final/LEIA-ME-RETOMAR.md` (estado, armadilhas e o que já foi decidido).

## Onde trabalhar
- SOMENTE na worktree que o ticket indica. Não toque a pasta principal dos repositórios, nem outras worktrees (`C:\cc-*`, `C:\orc-*`), nem outras branches.
- A worktree já nasce da integration branch `feat/suite-telas-final`, com `node_modules` como junção para o da pasta principal (não rode `npm install` nem `npm ci`; se precisar de dependência nova, pare e avise).
- Caminhos curtos e sem espaço (C:\...) são de propósito.

## Regras duras
- **Sem push, sem merge na `main`, sem deploy, sem migração em produção, sem conta real, sem chave real.** Quem integra é o merger. Quem publica é o orquestrador, depois do OK do Lucas.
- Teste só com dados locais de teste. Nunca aponte servidor ou testes para os dados reais do Lucas (AppData, banco local do app instalado, Neon, Cloudflare). Use diretório de dados temporário próprio.
- Servidores de teste: use apenas a faixa de portas do seu ticket (informada no prompt). Ao terminar, **encerre todo processo que você iniciou** (servidores, `node --test`, Chrome headless). Um `node --test` órfão já prendeu `%TEMP%\centro-custos-rec-n1` e quebrou testes de outras sessões.
- **Não use as ferramentas `mcp__Claude_Browser__*` nem `preview_*`**: o painel do navegador é um só e é compartilhado entre agentes em paralelo. Para ver telas, use Chrome headless (`C:\Program Files\Google\Chrome\Application\chrome.exe`, ou o kit de conferência quando existir) por linha de comando ou DevTools Protocol, com Node (sem dependência nova). Para ler prints, use a ferramenta Read em imagens.
- Nenhuma função nova de negócio. Fora do escopo: backup/restauração e OCR no Celular, seleção múltipla/exclusão em lote de cobranças, "Pedir autorização". Acabamento visual, paridade e correção apenas. Refatoração só se for o mínimo para o ticket.
- Interface: remover o que for desnecessário é permitido, mas **avise** (liste no relatório final e na descrição de PR). Os dois sistemas têm de ficar visualmente iguais e sem rolagem aninhada.
- Desktop novo: todo CSS novo usa `calc(Npx * var(--fs, 1))` em `font-size` (escala de letras maiores). Sempre que mexer em CSS/JS servido ao navegador, suba o `CACHE` do service worker do Celular se o arquivo for do `/m/` (Centro: `public/m/sw.js`).
- Referência de cada tela (protótipo): Centro desktop em `docs/suite-desktop/prototipo/` (`Desktop.dc.html`, Rodadas 17 a 20) e prints validados em `docs/suite-desktop/validacao/`; Centro celular em `docs/suite-mobile/prototipo/` (`Main.dc.html`); Orçamentos desktop em `docs/suite-desktop/prototipo-orcamentos/` (`DesktopOrc.dc.html`, Rodadas 23 e 24); Orçamentos celular em `docs/suite-mobile/prototipo/` (Rodadas 21 e 22). Onde houver divergência entre ticket e protótipo, vale o protótipo; onde o protótipo não cobre, mantenha o comportamento atual.

## Como construir
- Chame a Skill `tdd` ao começar. Onde a mudança for lógica (rota, regra, redirecionamento, função pura) escreva o teste vermelho antes. Onde for puramente visual, o "teste" é a conferência por print contra a Referência, nos dois temas e resoluções do ticket, mais os testes existentes continuando verdes; registre o que viu.
- Comandos: Centro `npm test` e `npm run check` (se `npm test` inteiro falhar só por teste que passa isolado, rode-o isolado e relate). Orçamentos `npm run verify`.
- Commits pequenos em pt-BR, estilo do histórico (`git log --oneline` mostra o tom). Termine mensagens de commit com a linha: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Antes de reportar, faça `git merge feat/suite-telas-final` na sua branch (a integration branch pode ter avançado), resolva conflitos preservando o trabalho dos dois lados e rode os testes de novo.

## Relatório final (curto, sem despejar arquivos)
1. Ticket, branch, último commit.
2. Critérios de aceitação: cada um marcado como cumprido ou NÃO cumprido, com a evidência (comando e resultado, ou caminho dos prints).
3. O que foi removido da interface (avisar).
4. Divergências que você achou e NÃO corrigiu (e por quê), e qualquer coisa que dependa do Lucas ou de aparelho real.
5. Processos que sobraram (deve ser nenhum).
Não marque como cumprido o que você não verificou.
