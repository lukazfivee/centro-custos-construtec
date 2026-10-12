# Suíte Construtec: finalizar as telas (ponto de retomada)

Escrito em 12/10/2026 para outra conta do Claude, em outro notebook, continuar sem perder o fio. O estado vivo está nos **issues do GitHub** (checklist no issue de acompanhamento); este arquivo guarda o que não cabe em issue. Mesmo texto nos dois repositórios.

- Centro: `lukazfivee/centro-custos-construtec-v3`
- Orçamentos: `lukazfivee/construtec-orcamentos`
- **Issue de acompanhamento:** `lukazfivee/construtec-orcamentos`, título "Suíte: finalizar as telas (acompanhamento e retomada)". Confira os checkboxes ali antes de agir.
- Entrega da Suíte: **30/10/2026**. Telas conferidas até **27/10**. Congelamento 28/10.
- Pessoa responsável: Lucas (comercial@rcconstrutec.com.br). Fala português do Brasil.

## Objetivo

"Finalizar as telas da Suíte, mobile e desktop": conferir cada tela do Centro e do Orçamentos contra a Referência (protótipo), acabar o que divergir e publicar. As telas já existem em todos os cantos; falta conferência, acabamento, `/classico/` e RC final. Vocabulário em `GLOSSARY.md` (use os mesmos nomes).

## Decisões já tomadas com o Lucas (não reabrir)

| # | Decisão |
|---|---|
| 1 | **Tela finalizada** = confere com a Referência nos temas claro e escuro; sem corte em 1280×720, 1280×800 e 1440×900 (desktop) e 375 (celular); Centro e Orçamentos visualmente iguais, sem rolagem aninhada; desnecessário removido **avisando**; testes verdes e publicada. Aparelho real (Galaxy A17 e iPhone) só na RC final de 27/10. |
| 2 | Nada de função nova até 30/10. Fora: backup/restauração e OCR no Celular, seleção múltipla de cobranças, "Pedir autorização" (print 44). Só entra função se for buraco bloqueante achado em teste de campo. |
| 3 | Orçamentos desktop segue `DesktopOrc.dc.html` (Rodadas 23 e 24). Celular do Orçamentos segue Rodadas 21 e 22. Se uma tela não passar até 20/10, vai com o layout atual e as cores da Suíte. |
| 4 | Referência: Centro desktop = `docs/suite-desktop/prototipo/` (`Desktop.dc.html`, Rodadas 17 a 20) e prints validados em `docs/suite-desktop/validacao/`; Centro celular = `docs/suite-mobile/prototipo/` (`Main.dc.html`). Prints de D6 e D7 não existiam; o ticket C1 os gera. |
| 5 | `/classico/` fica no ar ~30 dias e vira redirecionamento para `/` por volta de 26/11/2026 (isso NÃO é feito agora). Link "Versão clássica" em Configurações. |
| 6 | Publicação: um deploy por vez, sempre da `main`. Neste fluxo, a `main` recebe **uma vez por repositório**, via PR da branch de integração, depois do `/code-review` e **do OK explícito do Lucas**. Não mesclar nem publicar sem o OK. |
| 7 | Backend, banco e produção não entram neste trabalho (Etapa 2 do plano é à parte). |

## Mapa de tickets (grafo de tarefas)

`#` = issue no repositório indicado. "Bloqueado por" também está como bloqueio nativo no GitHub (mesmo repositório) e em texto (entre repositórios).

**Centro**

| Ticket | Issue | Bloqueado por |
|---|---|---|
| C1 Kit de conferência do Desktop novo | #130 | nenhum |
| C8 `/classico/`, "Versão clássica", app Windows | #131 | nenhum |
| C9 Celular do Centro | #132 | nenhum |
| C2 Fechamento e Histórico | #133 | C1 |
| C3 Reports e Configurações | #134 | C1 |
| C4 Usuários e papéis | #135 | C1 |
| C5 Início e Lançamentos | #136 | C1 |
| C6 Obras, Obra e Serviços | #137 | C1 |
| C7 Cadastros financeiros | #138 | C1 |
| S-C Passada de segurança do Centro | #139 | C2 a C9 |

**Orçamentos**

| Ticket | Issue | Bloqueado por |
|---|---|---|
| O1 Kit de conferência | #183 | nenhum |
| O2 Desktop: Início, Propostas, editor | #184 | O1 |
| O3 Desktop: Kits, Catálogo, Importar, EXSAT | #185 | O1 |
| O4 Desktop: Clientes, Configurações, Descartadas | #186 | O1 |
| O5 Celular: proposta e listas | #187 | O1 |
| O6 Celular: PDF, comparativo, importar, EXSAT | #188 | O1 |
| O7 Celular: restante | #189 | O1 |
| X1 Igualdade entre os dois sistemas | #190 | C2 a C7, O2 a O4 |
| S-O Passada de segurança do Orçamentos | #192 | O2 a O7 |
| X2 RC final no aparelho (exige o Lucas com A17 e iPhone) | #191 | X1, C8, C9, O5 a O7, S-C, S-O |

Total: 20 tickets. Label `ready-for-agent` nos dois repositórios. Os três issues antigos "EXECUTE O BOOTSTRAP V3 CORRIGIDO" (Centro #2 a #4) não têm relação com isto; ignore.

## Como o trabalho está sendo conduzido (skill `/implement-spec`)

Plugins esperados: `mattpocock-skills` (usa `tdd`, `code-review`, `implement-spec`, `to-tickets`, `grilling`) e `cybersecurity-skills` (só para os tickets S-C e S-O). `/to-tickets` e `/implement-spec` só podem ser iniciados pelo usuário digitando o comando.

1. **Uma branch de integração por repositório:** `feat/suite-telas-final`, criada a partir de `origin/main`. Um PR rascunho por repositório, que fecha os tickets ao mesclar.
2. **Um implementador por ticket**, cada um em worktree própria e branch `feat/telas-<id>` (ex.: `feat/telas-c1`), criada a partir da integração, com `node_modules` como **junção** para o da pasta principal (nunca rodar `npm install` nos worktrees):
   ```powershell
   git -C <repo> worktree add C:\cc-t-c1 -b feat/telas-c1 feat/suite-telas-final
   New-Item -ItemType Junction -Path C:\cc-t-c1\node_modules -Target "<pasta principal do repo>\node_modules"
   ```
   Convenção: `C:\cc-t-<id>` para o Centro, `C:\orc-t-<id>` para o Orçamentos, caminhos curtos e sem espaço.
3. **Contrato dos implementadores:** `docs/suite-telas-final/BRIEFING-IMPLEMENTADORES.md`. Cada agente recebe só: ticket, worktree, branch e faixa de portas de teste. Faixas: C1 3101-3109, C8 3111-3119, C9 3121-3129, O1 3131-3139; continue de 10 em 10 para os próximos.
4. **Merger:** quando um implementador termina, a branch dele é mesclada na integração; o orquestrador então libera os tickets que desbloqueou. Depois que **C1 e O1** entram, liberam-se C2 a C7 e O2 a O7 em paralelo.
5. **Ao terminar tudo:** `/code-review` na integração, correções num único implementador, PR rascunho vira "pronto", **pedir o OK do Lucas**, mesclar e publicar.
6. **Ao mesclar um ticket na integração, enviar a branch e marcar o issue.** Branches de ticket locais não sobrevivem a trocar de notebook; envie `feat/telas-<id>` e a integração com `git push`.

## Estado em 12/10/2026 (quando este arquivo foi escrito)

- Criados: 20 tickets, branches de integração, este documento.
- **C8 (#131) FEITO e mesclado na integração do Centro** (commit de merge em `feat/suite-telas-final`). Rota `/classico/` com a interface antiga (301 de `/classico` para `/classico/`), `/` continua indo para `/d/` (e `/m/` no celular), `/?antiga=1` e `/?entrar=1` preservados, card "Interface anterior" com aviso "até cerca de 26/11/2026" em Configurações > Sistema, e um item "Desktop novo" no menu Suíte da interface antiga para voltar. Teste novo `test/classico-route.test.js` (3 testes). `npm run check` ok; `npm test` 506/507, a única falha (`database-lock.test.js`, PID reutilizado) passa isolada. **Pendências do C8:** (a) conferir à mão no app Windows instalado que ele abre o Desktop novo (foi verificado só por leitura de código, o Electron real não foi aberto); (b) o link "Versão clássica" só aparece para administradores (p9), porque fica na aba Sistema; se o Lucas quiser para todos, é ajuste pequeno; (c) o redirecionamento definitivo `/classico/` → `/` (~26/11) não foi implementado, de propósito.
- **Em andamento no notebook anterior (agentes em worktrees locais):** C1 (`C:\cc-t-c1`), C9 (`C:\cc-t-c9`) e O1 (`C:\orc-t-o1`). Se esse notebook não terminar, o trabalho não terminado está só lá. **Quem retomar: confira primeiro se existem as branches `feat/telas-c1`, `feat/telas-c9` e `feat/telas-o1` no `origin`; se não existirem, o ticket começa do zero.**
- Nada mesclado na `main`. Nada publicado. Nenhuma migração.
- Próximo passo lógico: quando C1 e O1 entrarem na integração, liberar C2 a C7 e O2 a O7 em paralelo (faixas de porta a partir de 3141).

## O que o Lucas precisa fazer (não dá para o agente)

- Rodar o roteiro de teste de campo (`ROTEIRO-TESTE-LUCAS.md` existe só na pasta dele; em resumo: D6 com conta corporativa e convite por e-mail, push no A17, RC com cadastro real, iPhone via "Adicionar à Tela de Início", uma pergunta ao assistente, proposta aberta por conta sem p10). Em 12/10 ele disse que ainda não viu nenhum problema visual.
- Estar presente no ticket X2 (instalar no A17, conferir no iPhone).
- Dar o OK antes de mesclar na `main` e publicar.

## Armadilhas já pagas (não repetir)

- **Painel do navegador do Claude é compartilhado:** agentes em paralelo não podem usar `mcp__Claude_Browser__*`. Use Chrome headless (`C:\Program Files\Google\Chrome\Application\chrome.exe`) via DevTools Protocol com Node, sem dependência nova. O Centro e o Orçamentos não têm Playwright/Puppeteer instalado.
- **Servidores de teste e `node --test` órfãos** prendem arquivos em `%TEMP%` (ex.: `centro-custos-rec-n1`) e quebram testes de outras sessões. Encerre tudo que iniciou.
- **Nunca apontar testes ou servidores para dados reais** (AppData do app instalado, Neon, Cloudflare).
- **Desktop novo:** CSS novo usa `calc(Npx * var(--fs, 1))` em `font-size` (escala 1.3 em telas ≥ 1200 px). **Celular:** ao mexer em arquivo de `/m/`, subir o `CACHE` de `public/m/sw.js`.
- **Pastas principais dos repositórios estão em branches antigas de outras sessões** (remoto apagado). Trabalhe só em worktrees a partir de `origin/main`.
- **Deploy do Centro:** `node scripts/deploy-cloud.js` (a partir da `main`). **Deploy do Orçamentos:** `npm run deploy:cloud`, **sempre de um clone limpo em `origin/main` sem espaço no caminho** (a pasta do workspace já subiu código não commitado por engano). Containers Cloudflare só pegam imagem nova depois de hibernar (Centro ~10 min, Orçamentos ~5 min sem requisições).
- **Segredos Cloudflare gravados via PowerShell podem ter BOM**; o fetch do Node recusa. Normalizar no código.
- Testes: Centro `npm test` e `npm run check` (às vezes `suite-desktop.test.js` falha na suíte inteira e passa sozinho, 6/6; relatar). Orçamentos `npm run verify`.
- `.claude/` aparece não rastreado na pasta do Centro; não commitar.

## Retomando em outro notebook

1. `gh auth status` na conta certa (`lukazfivee` tem acesso aos dois repositórios).
2. Clonar os dois repositórios; `npm ci` em cada pasta principal (as worktrees usam junção para o `node_modules` dela).
3. Instalar os plugins `mattpocock-skills` e `cybersecurity-skills`.
4. `git fetch --all --prune`; `git checkout feat/suite-telas-final` (numa worktree, não na pasta principal); ler o issue de acompanhamento e as branches `feat/telas-*` no `origin`.
5. Abrir uma sessão do Claude Code na pasta que contém os dois repositórios e pedir: "continue o `/implement-spec` da Suíte a partir de `docs/suite-telas-final/LEIA-ME-RETOMAR.md`". O orquestrador deve: conferir o issue de acompanhamento, recriar as worktrees dos tickets desbloqueados, disparar os implementadores seguindo o briefing e **atualizar este arquivo e o issue de acompanhamento a cada integração**.
