# S-C: passada de segurança do Centro de Custos

Issue lukazfivee/centro-custos-construtec-v3#139 · worktree `C:\cc-t-sc` · branch `feat/telas-sc` · base `6ad57e2` (integração com C1 a C9).

**Onde rodou:** só em 127.0.0.1, portas 3251 a 3255, com o servidor e os dados fictícios do kit de conferência (`scripts/conferencia/servidor.js`). O banco PGlite foi temporário, com os seis papéis da Suíte (admin, gestor, financeiro, engenharia, técnico, comercial), mais uma sessão inválida e um pedido sem sessão. Nada contra produção, Neon, Cloudflare, AppData ou conta e chave reais. A sonda ficou numa pasta ignorada pelo git e foi apagada ao fim.

**Escopo:** o diff de `origin/feat/suite-telas-final` contra `origin/main`. No servidor, a única mudança é a rota nova `/classico/` em `server.js`. Nas telas: `/d/` (usuários, fornecedores, histórico, serviço com NF, configurações, fechamento), `/m/` (serviço com NFS-e, histórico, menu) e `/classico/` (`public/app.js` e `index.html`). O resto é CSS e o kit de conferência, que só sobe em 127.0.0.1.

Roteiro (skills `cybersecurity-skills`): testing-for-xss-vulnerabilities, testing-for-broken-access-control, performing-security-headers-audit, testing-cors-misconfiguration e testing-for-sensitive-data-exposure.

## Achados

| # | Severidade | Tela ou rota | Achado | Situação |
|---|---|---|---|---|
| 1 | **Alto** | `GET /api/fechamento-mensal` (lido pelos Lançamentos do `/d/` e do `/m/` em todos os papéis) | Qualquer papel recebia as pendências do fechamento com valor e detalhe (ex.: "Contas a pagar vencidas · R$ 48.250,90"), números da empresa inteira que só o administrador (p8) vê ao fechar o mês. | **Corrigido** |
| 2 | Baixo | `/classico/*` | A pasta `public/` inteira também é servida sob `/classico/`, e caminhos inexistentes ali devolvem a página antiga (200) em vez de 404. Não expõe nada além do que `/` já serve; a travessia (`/classico/../server.js`, `%2e%2e`, `.env`) devolve a página, sem código. | Não corrigido (transitório até ~26/11) |
| 3 | Baixo | Todas as rotas | O CSP só traz `frame-ancestors`, sem `script-src`. A defesa contra XSS depende do `esc()` das telas, que passou nos testes. | Não corrigido (já existia) |
| 4 | Baixo | `/api/*` em modo local | O CORS reflete qualquer origem `http://localhost:*` e `http://127.0.0.1:*`, sem `Allow-Credentials`. A sessão vai por cabeçalho `Authorization`, não por cookie. | Não corrigido (já existia; desenvolvimento) |

### 1. Pendências do fechamento para quem não fecha o mês (alto, corrigido)

- **Reproduzir:** servidor local. Como administrador, fechar 01/2026 com uma pendência `{ chave: 'pagar_vencidas', titulo: 'Contas a pagar vencidas', quantidade: 3, valor: 48250.9 }`. Com a sessão do técnico (ou do comercial, ou do gestor), fazer `GET /api/fechamento-mensal`.
- **Evidência antes:** a resposta do técnico trazia `pendencias: [{ ..., "valor": 48250.9, "detalhe": ... }]`.
- **Causa:** a lista é aberta a todos de propósito, porque Lançamentos precisa saber quais meses estão travados. Mas ela devolvia também a coluna `pendencias`, gravada no fechamento desde o D7. O resumo e o checklist do fechamento já exigiam p8.
- **Correção:** `routes/monthlyClosing.js`. Sem p8, a lista sai sem o campo `pendencias`; ano, mês, quem fechou e quando continuam. Nenhuma tela fora do Fechamento (que é p8) lê esse campo.
- **Regressão:** `test/fechamento-pendencias-sc.test.js`. Falha sem a correção ("tecnico recebeu as pendencias do fechamento") e passa com ela. O administrador continua vendo as pendências; técnico, comercial e gestor, não.

## O que passou

- **Acesso por papel (20 rotas × 7 sessões):** sem sessão ou com token inválido, tudo dá 401. Fora do administrador, todos levam 403 em `/usuarios`, `/usuarios/permissoes`, `/historico`, `/backup` e `/sistema`. Técnico e engenharia levam 403 em `/recorrentes` e `/cloud-sync/cobrancas` e só veem lançamentos das 2 obras atribuídas. Nas rotas que o diff passou a usar (`/notas-fiscais-centro/:id`, `/notas-fiscais-centro/:id/arquivo` e `/servicos/:id`, para um serviço fora das obras deles), também 403. O comercial leva 403 em cobranças e no painel. `/cadastros` (convites, com e-mails) responde "não se aplica" localmente, e o Worker central exige administrador (`cloudflare/center-container/signup.js`).
- **E-mails e telefones de outros usuários:** `/usuarios` só para o administrador. A formatação nova do telefone dos fornecedores é só de exibição; o dado e quem o vê não mudaram.
- **XSS:** carga `'"><img src=x onerror=…>` gravada em categoria, fornecedor (nome, telefone e observações), serviço (nome, cliente, responsável) e lançamento (descrição, favorecido e observações). Abri 16 telas: 11 do `/d/` (Início, Lançamentos, Obras, serviço, obra e seus lançamentos, Categorias, Fornecedores, Histórico, Usuários, Recorrentes), 4 do `/m/` e o `/classico/`. A carga apareceu como texto em 13 e não executou em nenhuma. O histórico com pendências (novo no C2) também passa por `esc()`.
- **Cabeçalhos** (`/classico`, `/classico/`, arquivos sob `/classico/`, `/d/`, `/m/`, `/api`): `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors`, `Referrer-Policy: no-referrer` e `Permissions-Policy` em todas. HTML e JS com `Cache-Control: no-cache`, API com `no-store`. `/classico` faz 301 para `/classico/`.
- **CORS:** `https://evil.example`, `null` e `http://localhost.evil.example` não são refletidos.

## Não coberto

- Worker e Cloudflare (cabeçalhos e CORS da nuvem): só por leitura de código.
- App Windows (Electron) abrindo o `/classico/`.

## Testes

- `npm test`: 517/518. A falha foi `database-lock.test.js` (PID reutilizado, já conhecida no LEIA-ME); isolado, passa.
- `npm run check`: 274 arquivos JavaScript verificados.
- Processos encerrados; nada ouvindo em 3251 a 3255.
