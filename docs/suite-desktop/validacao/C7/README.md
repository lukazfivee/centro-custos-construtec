# C7 — Cadastros financeiros

Issue #138 · branch `feat/telas-c7` · 15/10/2026 · feito pelo Claude Code (os créditos do Codex acabaram no C5).

Escopo: grupo D5 da Referência (prints 50 a 59): Categorias, Fornecedores e Recorrentes, com formulários e diálogos.

## Ajustes

- Categorias e Fornecedores: busca e filtros encostados à esquerda (antes o filtro de tipo ia para a ponta direita).
- Categorias: marcador de cor quadrado, como na Referência; total do mês em negrito.
- Fornecedores: telefone exibido com máscara `(11) 3333-4444` quando tem 10 ou 11 dígitos (só exibição, o dado gravado não muda); gasto do mês em negrito.
- Recorrentes: "Próximas gerações" volta para a coluna ao lado da tabela entre 1200 e 1440 px (antes descia para baixo abaixo de 1360 px); nessa faixa o valor de cada item fica abaixo do nome. Valor em negrito e cabeçalho "Ações".

Removido da interface: nada.

## Divergências deixadas

- Formulário de recorrente tem "Tipo" e "Primeiro mês" e usa seletor de frequência em vez de botões: funções existentes, fora do escopo de acabamento.
- Cores das categorias de exemplo vêm do banco fictício (a maioria sem cor).

## Resultado

- Kit C7 (`scripts/conferencia/c7.js`, com sonda nova de texto cortado em `<select>`): **60 capturas** (10 estados × 1280x720, 1280x800, 1440x900 × claro/escuro), sem rolagem horizontal, rolagem aninhada ou corte. Os 6 "erros" de `fornecedor-duplicado` são o 409 esperado do próprio estado (o kit acusa qualquer erro de console). Antes/depois em 1280x800 em `evidencias/`.
- `npm test`: **517/517**; `npm run check`: 274 arquivos.

Portas: app 3241, Chrome 3242, Referência 3243, extras 3245.
