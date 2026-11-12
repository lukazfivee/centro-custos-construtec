# AC-08 — ciclo das apropriações e apuração

O Realizado considera despesas aprovadas e liquidadas, com a competência do
lançamento como data de reconhecimento. O estorno entra com sinal negativo na
sua própria competência; o original permanece positivo no período anterior.
Medições continuam compondo horas e avanço físico. Não se passou a reconhecer
seu custo novamente, evitando somar medição e pagamento da mesma despesa.

## Manutenção das projeções

A migração 121 instala triggers de restrição diferidos em `transactions` e
`transaction_allocations`. A reconciliação lê o estado final da transação, após
a gravação de todas as parcelas, e participa do mesmo commit/rollback. Isso
cobre rotas individuais, lote, CSV, pacotes, conflitos, fila móvel, despesas de
serviços e exclusões em massa sem depender de cada chamador lembrar de um hook.
Um orçamento recebido posteriormente também habilita as despesas já existentes.

O lock usa a mesma ordem do guard financeiro: primeiro `financial_write_gate`,
depois o lançamento. Operações manuais de apropriação seguem essa ordem e usam
transação. O helper de criação automática da rota foi removido para não haver
dois gravadores com comportamentos diferentes.

As apropriações que deixam de valer ficam inativas; seus reconhecimentos
deixam de estar aprovados. Os vínculos são preservados. Uma única parcela
mapeada acompanha alteração permitida de valor/data. Se houver várias parcelas
mapeadas e a soma não fechar com o novo valor, a operação inteira é rejeitada
com conflito: é necessário revisar o mapeamento, sem redistribuição arbitrária.
Os guards financeiros e os fechamentos existentes continuam sendo aplicados.

O estorno recebe parcelas vinculadas às do original. Mapear/desmapear o original
atualiza a classificação da compensação. A classificação direta do estorno é
recusada para não separar os dois lados. Reenvios não geram nova apropriação
mapeada nem mais de um reconhecimento aprovado da mesma parcela.

Se há mais de um contrato ativo, o comparativo exige seleção explícita. Na
criação automática, mantém-se um contrato já apropriado quando disponível;
caso novo, usa-se a ordenação estável de criação/id (a rota de lançamento ainda
não fornece escolha de contrato). Alocação explícita valida obra, contrato,
item, linha e valor da parcela.

## Comparativo e relatórios

Mapped e unmapped filtram exclusão, aprovação e estado financeiro. O sinal vem
de `accounting_sign`, não de um suposto tipo `estorno`. O corte usa a competência
nos dois grupos; horas usam `period_end`. Baseline deve pertencer à obra e ao
contrato escolhido. Custos de itens fora da baseline aparecem com orçamento
zero no detalhamento e continuam no total, na exportação CSV e na Curva ABC.
Curva S inclui despesas não mapeadas e filtra reconhecimentos cuja despesa de
origem deixou de valer. O portfólio distribui despesas segundo os rateios,
considerando somente lançamentos aprovados.
Os cálculos do comparativo usam as operações decimais HALF_UP da aplicação.

O corte é uma visão do estado atual por competência, não uma reconstrução
histórica de todas as edições/exclusões ocorridas após aquela data. Não foi
introduzido um livro de eventos para alterar essa semântica.

## Bases preexistentes

A migração instala estrutura e regras; não executa backfill de lançamentos
preexistentes nem altera baselines seladas. Os filtros já retiram despesas
excluídas/não elegíveis de relatórios, mesmo que suas projeções antigas ainda
existam. Valores/obras de apropriações antigas incorretas e projeções ausentes
precisam de reconciliação explícita em cópia de teste, com comparação por obra
e período, antes de qualquer saneamento autorizado de uma base real.

O ponto de reconciliação é `reconcile_expense_allocations(transaction_id)`.
Apesar de invocável por SELECT, essa função **grava projeções gerenciais**;
não é uma consulta de diagnóstico. Não deve ser executada numa base real sem
planejamento e autorização próprios. O backfill antigo não substitui essa
reconciliação: só preenchia apropriações ausentes e ignorava estados divergentes.

Uma revisão/reenvio aceito do lançamento ou nova ativação de orçamento passa
pelas regras novas. Alterações de pacote rejeitadas não mudam apropriações.

## Regressões

- `test/ac08-lifecycle.integration.test.js`: HTTP real, alteração de valor/data/
  obra, exclusão, estorno por período, CSV do comparativo, mapped/unmapped,
  liquidação em massa, pendência, tipo, rateios em centavos e orçamento tardio.
- `test/ac08-sync.integration.test.js`: pacote recebido/repetido, alteração,
  exclusão, conflito recebido, rateio, par original/estorno e CSV legado.
- `test/ac08-integrity.integration.test.js`: concorrência, idempotência,
  rollback sob falha, validação de escopo, custo fora da baseline e defesa
  contra exclusão legada ainda não reconciliada.

Todos os testes usam banco descartável e identidade fictícia. A aplicação da
migração foi testada em PGlite; PostgreSQL precisa da execução correspondente
no ambiente de homologação. Não há backfill, deploy ou acesso a dados reais
como parte desta alteração.
