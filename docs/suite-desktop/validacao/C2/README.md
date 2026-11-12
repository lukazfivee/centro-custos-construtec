# C2 — Fechamento e Histórico

Ticket Centro #133, branch `feat/telas-c2`, a partir de `feat/suite-telas-final`. Conferência em 14/10/2026, com dados fictícios e banco temporário. Sem alteração de servidor, schema ou dados reais.

## Correções

- O checklist usava `.ck`, também usada pelos botões de Serviços. O `display:flex` colocava os itens lado a lado e cortava o conteúdo. A lista agora usa `.fech-checklist`; o estilo de Serviços fica preservado.
- A nota do checklist também herdava o fundo da nota do Início. Agora usa `.fech-nota`, como o texto simples da Referência.
- Ano completo no seletor; checklist ao lado da tabela também em 1280 px, com a página rolando verticalmente.
- Botão de reabrir em âmbar `#8a5200`, como na Referência, nos dois temas; hover e foco preservados.
- Histórico: ações `create/update/delete/confirmed` traduzidas na apresentação, sem mudar a auditoria. Pendências mostram títulos, valores e explicações em vez de JSON; datas e responsável pelo fechamento têm rótulos em português. A comparação de objetos usa os dados completos, preservando mudanças que não alteram apenas o título.

Removidos: nenhum controle, texto funcional ou recurso. Nenhuma função nova de negócio.

## Conferência e reprodução

```powershell
node scripts/conferencia/c2.js --saida docs/suite-desktop/validacao/C2/depois
# Para repetir uma parte:
node scripts/conferencia/c2.js --somente fechamento,historico-detalhe --tamanhos 1280x720 --porta 3146
```

Sete estados × três resoluções (1280×720, 1280×800 e 1440×900) × dois temas = 42 capturas do escopo. Estados: fechamento, confirmação com pendências, mês fechado, reabertura, Histórico, filtro de fechamentos e detalhe. Reabertura e detalhe foram recapturados após os últimos ajustes.

O script verifica largura das tabelas e do painel, ano legível e lista vertical dentro da janela. Também fecha um mês fictício com pendências, recusa motivo vazio, reabre e confere o motivo no Histórico; testa datas, CSV e estado sem resultados. O exemplo extra de antes/depois é uma fixture de apresentação (Descrição e Valor), não uma edição de lançamento real.

Os JSONs de resultados e a seleção de prints em `evidencias/` ficam versionados. Galerias completas ficam locais em `antes/` e `depois/`, que podem ser regeneradas, sem versionar todos os prints e cópias da Referência em massa. A captura inicial incluiu seis estados homônimos de D2 por causa do seletor do kit; eles foram excluídos do relatório C2. O comando dedicado usa nomes qualificados `D7/<estado>`.

| Estado (1440×900) | Antes (claro) | Depois (claro) | Depois (escuro) |
|---|---|---|---|
| Fechamento | [Print](evidencias/antes/1440x900-claro-fechamento.jpg) | [Print](evidencias/depois/1440x900-claro-fechamento.jpg) | [Print](evidencias/depois/1440x900-escuro-fechamento.jpg) |
| Fechar com pendências | [Print](evidencias/antes/1440x900-claro-fechar-com-pendencias.jpg) | [Print](evidencias/depois/1440x900-claro-fechar-com-pendencias.jpg) | [Print](evidencias/depois/1440x900-escuro-fechar-com-pendencias.jpg) |
| Mês fechado | [Print](evidencias/antes/1440x900-claro-mes-fechado.jpg) | [Print](evidencias/depois/1440x900-claro-mes-fechado.jpg) | [Print](evidencias/depois/1440x900-escuro-mes-fechado.jpg) |
| Reabrir | [Print](evidencias/antes/1440x900-claro-reabrir-com-motivo.jpg) | [Print](evidencias/depois/1440x900-claro-reabrir-com-motivo.jpg) | [Print](evidencias/depois/1440x900-escuro-reabrir-com-motivo.jpg) |
| Histórico | [Print](evidencias/antes/1440x900-claro-historico.jpg) | [Print](evidencias/depois/1440x900-claro-historico.jpg) | [Print](evidencias/depois/1440x900-escuro-historico.jpg) |
| Filtro Fechamento | [Print](evidencias/antes/1440x900-claro-historico-fechamentos.jpg) | [Print](evidencias/depois/1440x900-claro-historico-fechamentos.jpg) | [Print](evidencias/depois/1440x900-escuro-historico-fechamentos.jpg) |
| Detalhe | [Print](evidencias/antes/1440x900-claro-historico-detalhe.jpg) | [Print](evidencias/depois/1440x900-claro-historico-detalhe.jpg) | [Print](evidencias/depois/1440x900-escuro-historico-detalhe.jpg) |

Também estão versionados Fechamento em 1280×720/800, detalhe em 1280×720, validação do motivo, datas personalizadas, estado vazio e o exemplo de antes/depois.

## Limites da comparação

A Referência mantém largura mínima de 1440 px e corta a própria imagem nas janelas menores. A comparação de composição e cores usou principalmente 1440×900; o app foi conferido nas três resoluções. A escala de 75% e as letras ampliadas da Suíte foram preservadas.

Dados, datas, avatares e competências diferem entre o kit e a Referência. A casca do Desktop novo ainda não tem o sino desenhado no protótipo: isso fica para a conferência geral X1, sem introduzir função nova no C2. Igualdade global entre Centro e Orçamentos e conferência no app Windows instalado não foram declaradas como realizadas neste ticket.

O detector apontou somente os raios preexistentes de 9 e 12 px, preservados para seguir o Desktop novo. O resultado está em `detector.json`.

## Validação final

- `npm run check`: 274 arquivos verificados; sintaxe do script C2 conferida após o ajuste da opção de saída.
- Regressões C2: 3/3, com reprodução vermelha antes de cada correção lógica.
- `npm test -- --test-concurrency=1`: 516/517. Única falha: `recurring-n1-regression.test.js`, latência de 16.867 ms diante do limite de 5.000 ms; contagem de consultas passou. O backend desse teste não tem diferença em relação à base `6eb503e`.
- `node --test --test-force-exit --test-timeout=180000 test/recurring-n1-regression.test.js`: 1/1 na execução isolada. Foi usada a exceção prevista no briefing para teste que falha na suíte e passa isolado; não se declara a suíte inteira verde.
- O teste que falhou não fecha seu servidor quando uma asserção interrompe o fluxo. O filho da nossa execução foi identificado e encerrado para os demais testes continuarem. A repetição isolada usou saída forçada para impedir essa sobra em caso de falha.
- Matriz final: 42/42 sem erro de console, vazamento lateral ou rolagem aninhada detectada; verificações adicionais de layout/fluxo também passaram. Processos da conferência encerrados.

Revisão do diff: escopo restrito à apresentação de Fechamento/Histórico, teste de regressão e script/documentação de conferência. Dados de auditoria, permissões, API, cálculos e estilos de Serviços não são alterados.

Publicação pela `main` e homologação real continuam pendentes do fluxo final da Suíte e do OK explícito do Lucas. O issue não deve fechar antes desse portão.
