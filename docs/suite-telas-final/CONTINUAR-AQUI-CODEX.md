# Retomada pelo Codex: finalizar as telas da Suíte (atualizado em 13/10/2026)

Para o **Codex**, neste PC **e** no outro PC (com outra conta). Tudo o que importa está no **GitHub**; a pasta de trabalho do Lucas (`PROJETOS LUCAS`) não é repositório, então o outro PC só vê o que foi enviado. Este arquivo é a cópia, dentro do repositório, do bloco "COMECE AQUI" do `CONTINUAR-AQUI.md` dele. O Lucas liberou o Codex para **implementar diretamente** nesta tarefa: o protocolo Maestri/CODEX-LEAD do `AGENTS.md` da raiz **não se aplica** aqui (não delegue por `maestri ask`). Entrega da Suíte: **30/10/2026**; telas conferidas até **27/10**; congelamento 28/10.

**Fonte da verdade, nesta ordem:**
1. Issue de acompanhamento: `lukazfivee/construtec-orcamentos#194` (checklist dos 20 tickets).
2. `docs/suite-telas-final/LEIA-ME-RETOMAR.md` na branch `feat/suite-telas-final` de cada repositório (decisões do Lucas, mapa de tickets, armadilhas) e `docs/suite-telas-final/BRIEFING-IMPLEMENTADORES.md` (regras de quem implementa um ticket). Leia os dois **antes de mexer em qualquer coisa**. Vocabulário em `docs/suite-telas-final/GLOSSARY.md`.
3. Cada ticket: `gh issue view <N> -R <repo>`.

**Repositórios:** Centro `lukazfivee/centro-custos-construtec-v3`, Orçamentos `lukazfivee/construtec-orcamentos`. Integração: branch `feat/suite-telas-final` em cada um, com PR rascunho (Centro #140, Orçamentos #193). Um implementador por ticket, branch `feat/telas-<id>` criada a partir da integração; o trabalho de cada ticket entra na integração com `git merge --no-ff` e a integração é enviada (`git push`).

### Estado real em 13/10/2026, conferido no GitHub (não confie em memória, rode `git fetch --all --prune` e confira)

| Ticket | Issue | Estado |
|---|---|---|
| C8 `/classico/`, "Versão clássica" | Centro #131 | **Feito**, na integração do Centro. Pendente à mão: abrir o app Windows instalado e confirmar que entra no Desktop novo; o link só aparece para administradores (aba Sistema) |
| C9 Celular do Centro | Centro #132 | **Feito**, na integração do Centro (46 telas em 375 px, 514/514 testes) |
| C1 Kit de conferência do Desktop novo | Centro #130 | **Incompleto.** Só há um WIP dos scripts em `origin/feat/telas-c1` (`88bef1b`, não está na integração). Faltam: rodar o kit, gerar os prints de D6 e D7, a lista de divergências por tela e o README de uso. Os prints que o agente gerou (18 MB) ficaram só no PC antigo, sem commit; regere |
| O1 Kit de conferência do Orçamentos | Orçamentos #183 | **Feito e mesclado na integração do Orçamentos por outro ator** (commits de "RC Construtec", 12/10 à noite). Uso: `npm run conferencia`; lista de divergências e Referência em `docs/suite-telas-final/conferencia/` |
| O7 Celular do Orçamentos: restante | Orçamentos #189 | **Feito e mesclado** pelo mesmo ator (13/10 12:32) |
| O2, O3, O4 (desktop), O5, O6 (celular) | Orçamentos #184 a #188 | **Liberados** (o O1 já está na integração). Nenhum começou |
| C2 a C7 (desktop do Centro) | Centro #133 a #138 | Bloqueados pelo C1. Não começaram |
| S-C, S-O (passadas de segurança) | Centro #139, Orçamentos #192 | Bloqueados pelas telas |
| X1 igualdade dos dois sistemas | Orçamentos #190 | Bloqueado por C2 a C7 e O2 a O4 |
| X2 RC final no aparelho | Orçamentos #191 | Bloqueado por tudo; **exige o Lucas** com o A17 e o iPhone |

**Aviso importante: pode haver duas máquinas trabalhando ao mesmo tempo.** O O1 e o O7 apareceram prontos sem aviso, com autor "RC Construtec" (`pcm@rcconstrutec.com.br`), que parece ser o outro PC do Lucas. Para não duplicar trabalho:
- Antes de começar um ticket, `git fetch --all --prune` e veja se já existe `feat/telas-<id>` no `origin` e comentários no ticket.
- **Reserve o ticket com um comentário no issue** ("pegando este ticket, PC X, data/hora") antes de implementar; e ao terminar, comente o resultado e atualize o checklist do #194.
- Nunca use `git push --force`. Se o push for rejeitado, é porque alguém avançou: faça `git fetch` e integre.
- Divisão sugerida entre os dois PCs: um PC pega o **Centro** (C1, depois C2 a C7), o outro o **Orçamentos** (O2 a O6). Combine pelo comentário no #194.

### Prompt para colar no Codex

> Leia `CONTINUAR-AQUI.md` (bloco "COMECE AQUI") e, no repositório, `docs/suite-telas-final/LEIA-ME-RETOMAR.md` e `BRIEFING-IMPLEMENTADORES.md`. Rode `git fetch --all --prune` nos dois repositórios, confira o issue lukazfivee/construtec-orcamentos#194 e o estado das branches `feat/telas-*`. Escolha o próximo ticket desbloqueado do meu lado (Centro: C1; Orçamentos: O2 a O6), reserve-o com um comentário no issue, crie a worktree a partir de `feat/suite-telas-final`, implemente você mesmo seguindo o briefing (teste vermelho primeiro onde for lógica; conferência por print contra a Referência onde for visual), rode os testes, mescle na integração, envie as branches e atualize o #194. Não mescle na `main`, não publique e não faça migração sem o meu OK explícito.

### Neste PC (worktrees locais existem)

- `C:\cc-telas` e `C:\orc-telas`: worktrees da integração. **`C:\orc-telas` está atrasada**: faça `git pull` (ela não tem O1 nem O7). `C:\cc-telas` está 1 commit atrás da `main` do Centro (o #142, PIN do Android, RC30): antes do PR final, `git merge origin/main` na integração.
- `C:\cc-t-c1`: worktree do C1 com os scripts (`scripts/conferencia/`) e 156 prints não versionados em `docs/suite-desktop/validacao/_conferencia/` (18 MB). **Não commite esses prints em massa**; versione só o que for referência de D6 e D7.
- `C:\orc-t-o1`: **obsoleta, descarte.** Contém um WIP antigo do O1 que divergiu do O1 de verdade (o push foi rejeitado). Pode remover: `git -C <repo> worktree remove --force C:\orc-t-o1` e apagar a branch local `feat/telas-o1`.
- `C:\cc-t-c8` e `C:\cc-t-c9`: terminadas e já na integração; podem ser removidas.
- `node_modules` de cada worktree é uma **junção** para o da pasta principal do repositório (`centro-custos-construtec-v3\node_modules`, `construtec-orcamentos\node_modules`); não rode `npm install` nelas.
- As pastas principais dos repositórios (`centro-custos-construtec-v3` e `construtec-orcamentos`) estão em branches antigas de outras sessões. Trabalhe só em worktrees a partir de `origin/main` ou da integração.

### No outro PC (só o GitHub)

1. `gh auth status` (conta com acesso a `lukazfivee/...`). Clonar os dois repositórios; `npm ci` em cada um.
2. `git fetch --all --prune`; `git worktree add C:\cc-telas feat/suite-telas-final` (Centro) e `C:\orc-telas` (Orçamentos); criar a junção de `node_modules` para o da pasta principal (comando no LEIA-ME).
3. Seguir o prompt acima.

### Regras que não mudam (resumo; o detalhe está no LEIA-ME)

- **Sem função nova de negócio.** Fora: backup e OCR no Celular, seleção múltipla de cobranças, "Pedir autorização". Acabamento, paridade e correção apenas.
- **Tela finalizada** = confere com a Referência (protótipo) nos temas claro e escuro; sem corte em 1280×720, 1280×800 e 1440×900 (desktop) e 375 (celular); Centro e Orçamentos iguais; **sem rolagem aninhada**; o desnecessário removido **avisando o Lucas**; testes verdes. Aparelho real só na RC final (X2).
- Desktop novo: CSS novo usa `calc(Npx * var(--fs, 1))` em `font-size`. Celular do Centro: ao mexer em `public/m/`, subir o `CACHE` de `public/m/sw.js` (hoje v23 na integração).
- Testes: Centro `npm test` e `npm run check`; Orçamentos `npm run verify`. Sem Playwright instalado: use o kit de conferência (Chrome headless por DevTools Protocol). Nunca aponte teste ou servidor para dados reais; encerre os processos que iniciar (um `node --test` órfão já travou testes de outras sessões).
- **Nada vai para a `main`, nada é publicado e nenhuma migração roda sem o OK explícito do Lucas.** Ao terminar tudo: `/code-review` (ou revisão equivalente) da integração, PR rascunho vira pronto, pedir o OK, mesclar e publicar (Centro: `node scripts/deploy-cloud.js`; Orçamentos: `npm run deploy:cloud` de um clone limpo em `origin/main`, sem espaço no caminho).
- O Claude Code tem skills (`/implement-spec`, `tdd`, `code-review`) que o Codex não tem: faça o equivalente à mão (teste primeiro, revisão da integração no fim).

