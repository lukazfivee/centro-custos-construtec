# C6: Obras, Obra e Serviços

Issue lukazfivee/centro-custos-construtec-v3#137 · worktree `C:\cc-t-c6` · branch `feat/telas-c6` · base `5fb79d8` (integração com C2, C3 e C4).

Conferido em 14 e 15/10/2026 com o kit novo `scripts/conferencia/c6.js`, contra `docs/suite-desktop/prototipo/Desktop.dc.html` (a captura lado a lado vem do próprio kit) e os prints 30 a 35. Escala de letras maiores ligada (padrão do Desktop novo). Temas claro e escuro; resoluções 1280×720, 1280×800 e 1440×900.

## Ajustes

| Tela | Antes | Depois |
|---|---|---|
| Obra › Orçado × realizado (≤ 1379 px) | Cinco indicadores em 3 + 2, com um buraco na segunda linha. | Cinco indicadores numa linha, como na Referência. O painel lateral (Contrato, Orçado × realizado por tipo, gastos sem vínculo) continua descendo para baixo da planilha. |
| Obra › Medições, mão de obra e contrato (≤ 1379 px) | O formulário ocupava a largura toda e o Histórico ia para baixo. | Formulário (300 px) e Histórico lado a lado, como no print 32. As datas Início e Fim ficam uma embaixo da outra para o ano não cortar. Só empilha abaixo de 1100 px. |
| Carteira › Saldo da carteira | Saldo negativo aparecia sem sinal (só em vermelho): "R$ 825,1 mil". | "−R$ 825,1 mil". |

Arquivos: `public/d/css/obras.css`, `public/d/css/obras-ferramentas.css` e `public/d/telas/obras.js` (só o texto do indicador). Kit: `scripts/conferencia/c6.js` e `c6-isolamento.js`.

**Removido da interface:** nada.

## Kit

```powershell
node scripts/conferencia/c6.js --listar
node scripts/conferencia/c6.js --saida docs/suite-desktop/validacao/C6/depois
node scripts/conferencia/c6.js D3b/medicoes-contrato --tamanhos 1280x720 --temas escuro --saida docs/suite-desktop/validacao/C6/depois
```

- **28 estados × 6 combinações = 168 capturas.** São os 23 estados D3a/D3b do C1 (carteira, filtro, nova e editar obra, Orçado × realizado com rolagem e mão de obra, obra sem orçamento, lançamentos, NF, lançar NF e despesa, medições de mão de obra e de contrato, boletim, Curva S com rolagem, relatório executivo, importar orçamento, vincular gastos) e 7 novos: carteira de Serviços, carteira Todos, novo serviço, detalhe do serviço (topo e rolado), descartar obra e Obras descartadas.
- Os estados que abrem a carteira escolhem antes o tipo (Obras/Serviços/Todos), porque a escolha fica salva no navegador e vazaria de um estado para outro.
- Sonda do C4 generalizada: rolagem horizontal da página ou do painel, rolagem interna (aninhada), corte de texto por `overflow` e rodapé do painel fora da janela.
- Portas: app 3231, Chrome 3232, Referência 3233, nuvem 3234, Worker 3235. Temporários em `C6/.tmp/`.
- Recusa `--validacao` para não sobrescrever os prints D3a/D3b do C1. A saída fica dentro de `validacao/C6/`.

## Resultado

- **Antes:** 168 capturas. A sonda acusou corte na aba Lançamentos da obra em 1280 (4 combinações). "Descartar obra" não foi capturado (6) por erro do próprio kit (`D` em vez de `CC.d`), corrigido em seguida.
- **Depois:** 168 capturas, 164 sem achado. Os 4 restantes são a aba Lançamentos da obra em 1280×720 e 1280×800, veja abaixo.
- Prints versionados (cerca de 5,7 MB): `evidencias/depois/` com todos os estados em 1280×800, claro e escuro (56 arquivos), e `evidencias/antes/` com carteira, obra e medições antes da correção. As capturas completas e a Referência lado a lado ficam em `depois/` e `antes/` (com `index.html`), fora do git.

## Não corrigido (e por quê)

- **Obra › Lançamentos em 1280:** Descrição e Favorecido saem com reticências ("Medição 07 · Residencial Au…"). É a mesma tabela da tela Lançamentos (ticket C5, que está sendo feito em paralelo). Mexer aqui criaria conflito, então fica para o C5. Uma saída simples seria esconder a coluna "Obra", redundante dentro da própria obra.
- **Selo da situação no cabeçalho da obra (tema claro):** "Planejamento" e "Em execução" aparecem com fundo bem claro sobre o fundo da página. É o mesmo componente de selo da carteira; sem mudança.
- **Detalhe do serviço em 1280:** o texto de exemplo do campo "Novo item do checklist" fica cortado na coluna lateral; o campo em si funciona. Não há quadro de Serviços na Referência.
- **Carteira › Realizado "29.996% do orçado total":** está correto para os dados fictícios (só uma obra tem orçamento importado), não é defeito de tela.
- Sem Referência no protótipo: Serviços, descarte, Obras descartadas, boletim, relatório executivo, importar e as variações de estado. Esses foram conferidos pela sonda e a olho, contra o padrão das telas vizinhas.

## Testes

- `npm run check`: 274 arquivos JavaScript verificados.
- `npm test`: 509/510. A única falha, `test/budget-import.integration.test.js`, foi um `Aborted()` do PGlite (WASM) na suíte inteira. Isolado, passou 8/8. É backend, sem relação com estes arquivos.
- Chrome, servidor de teste e `node --test` encerrados; nada ouvindo em 3231 a 3235.
