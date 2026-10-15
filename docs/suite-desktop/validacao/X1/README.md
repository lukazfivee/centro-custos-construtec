# X1: igualdade entre Centro e Orçamentos (Desktop novo)

Ticket lukazfivee/construtec-orcamentos#190 · Centro: worktree `C:\cc-t-x1`, branch `feat/telas-x1` (base `7b87c70`) · Orçamentos: worktree `C:\orc-t-x1`, branch `feat/telas-x1` (base `bdf6c31`). Conferido em 15/10/2026.

## Como foi comparado

`comparar.mjs` (cópia nesta pasta) sobe os dois sistemas em 127.0.0.1 com os dados fictícios dos kits de conferência: Centro na porta 3261, Orçamentos em 3265 a 3267, Chrome headless em 3268. Para cada tela, tamanho e tema, ele captura os dois sistemas e monta a imagem lado a lado (`lado-a-lado/`). Também mede os mesmos elementos nos dois (`medidas.json`): menu lateral (marca, grupos, itens, item ativo, selo, pessoa), topbar (busca, Suíte, botões, indicador de sincronização), título e sobretítulo da página. As medidas incluem tamanho, posição, letra (tamanho efetivo com o zoom de 75%, peso, família), cores, raio e espaçamento.

Telas comparadas: Início (Painel financeiro × Início), listas (Lançamentos × Propostas) e cadastros (Fornecedores × Clientes), em 1280×720, 1280×800 e 1440×900, temas claro e escuro: 18 pares. Configurações foi comparada em 1280×800.

## Resultado das medidas

Menu, topbar, título e sobretítulo têm **as mesmas medidas, letras, cores e raios** nos dois sistemas, nas 18 combinações. As únicas diferenças restantes são de conteúdo:

- nome do sistema na marca ("CENTRO DE CUSTOS" × "ORÇAMENTOS");
- nome da pessoa de teste;
- estado da sincronização ("Dados neste computador", cinza, × "Dados na nuvem", verde: o kit do Centro roda sem nuvem).

## Ajustes (todos no Centro)

| O que destoava | Correção |
|---|---|
| Botão do assistente: 39 px na tela, a 18 px da borda (o Orçamentos compensa o zoom de 75% e fica com 52 px, a 24 px). | `public/d/css/ia.css`: mesma compensação do Orçamentos em janela ≥ 1200 px (69 px a 32 px da borda no código, ou seja, 52 px a 24 px na tela). |
| Obra › Lançamentos em 1280: descrição com reticências (pendência do C6), enquanto a tela Lançamentos (C5) já quebra a linha. | `public/d/css/lancamentos.css`: a aba da obra quebra a linha como a tela Lançamentos. `public/d/telas/lancamentos.js`: dentro da obra sai a coluna **Obra**, que repetia a mesma obra em toda linha. |
| Selo de situação no cabeçalho da obra, tema claro: fundo quase igual ao da página (pendência do C6). | `public/d/css/base.css`: contorno leve, na cor do próprio selo, nos selos do cabeçalho (`.acoes > .chip`). |
| Detalhe do serviço: o texto de exemplo "Novo item do checklist" aparecia cortado (pendência do C6). | `public/d/telas/servico-blocos.js`: o texto de exemplo virou "Novo item"; o nome acessível continua "Novo item do checklist". |

**Removido da interface (aviso):** a coluna "Obra" da tabela de lançamentos **dentro da própria obra**. Na tela Lançamentos ela continua.

O kit c6 conferiu Obra › Lançamentos, Orçado × realizado e detalhe do serviço em 1280×720, 1280×800 e 1440×900, claro e escuro, sem corte e sem rolagem aninhada.

## Diferenças deixadas (decisão do Lucas)

- **Topbar do Orçamentos tem sino de avisos, ajuda e e-mail;** a do Centro não tem. Igualar exigiria função nova no Centro ou tirar funções do Orçamentos, e as duas coisas estão fora desta entrega. Se o Lucas preferir, o próximo passo seria levar o sino ao Centro, que já tem a rota `/api/notificacoes`.
- **Configurações:** o Orçamentos tem a escolha de tema (Automático, Claro, Escuro) num cartão; o Centro troca o tema só pelo botão da topbar. A estrutura das abas é igual.
- **Orçamentos:** nenhum ajuste necessário, por isso não há PR nesse repositório.

## Testes

- Centro: `npm test` 518/518 e `npm run check` com 274 arquivos verificados.
- Orçamentos (branch sem mudanças): `npm run verify` com typecheck ok, lint 0 erros (34 avisos já existentes) e 337/338 testes passando (1 pulado).
- Processos encerrados; nada ouvindo em 3261 a 3268.
