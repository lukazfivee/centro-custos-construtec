---
name: Suíte Construtec
description: Sistema visual comum do Centro de Custos e do Orçamentos: petróleo escuro, ciano que age, IBM Plex, contornos de 1 px.
colors:
  petroleo: "#031f29"
  petroleo-fundo-escuro: "#021820"
  superficie-escura: "#0b2f3b"
  linha-escura: "#164656"
  tinta: "#0b2530"
  papel-frio: "#f2f8fa"
  superficie: "#fefefe"
  linha: "#d6e4e9"
  neutro-texto: "#5d7480"
  neutro-apoio: "#8fa6b0"
  ciano: "#12a9d1"
  ciano-marca: "#0a7896"
  ciano-medio: "#0d7f9f"
  ciano-profundo: "#0b4a5c"
  ciano-suave: "#e8f8fc"
  ciano-claro-escuro: "#5fd0ee"
  ok: "#1d7a4f"
  ok-suave: "#e3f6ec"
  alerta: "#8a5200"
  alerta-barra: "#e0a33a"
  alerta-suave: "#fff5d9"
  erro: "#b8452c"
  erro-suave: "#fdecea"
  saida: "#a24a12"
  saida-suave: "#fdf0e6"
typography:
  headline:
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif'
    fontSize: "calc(25px * var(--fs, 1))"
    fontWeight: 700
    lineHeight: 1.1
  title:
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif'
    fontSize: "calc(21px * var(--fs, 1))"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif'
    fontSize: "calc(14px * var(--fs, 1))"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif'
    fontSize: "calc(13.5px * var(--fs, 1))"
    fontWeight: 600
    lineHeight: 1.2
  caption:
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif'
    fontSize: "calc(12px * var(--fs, 1))"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "5px"
  md: "10px"
  lg: "14px"
  pill: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ciano-marca}"
    textColor: "{colors.superficie}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 12px"
  chip:
    backgroundColor: "{colors.ciano-suave}"
    textColor: "{colors.ciano-marca}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: "24px"
    padding: "0 9px"
---

# Design System: Suíte Construtec

> O visual antigo do Centro (Clássico, `/classico/`) está em `docs/DESIGN-CLASSICO.md` até ele sair, cerca de 26/11/2026.

Extraído do Desktop novo do Centro (`public/d/css/tokens.css`, `base.css`, `layout.css`, `escala.css`) na main de 21/10/2026. O Orçamentos tem o próprio DESIGN.md, com os mesmos tokens de marca; a regra do produto é que os dois sejam iguais, medidos lado a lado.

## Overview

**Creative North Star: "A Mesa de Obra"**

Uma bancada de trabalho firme: o petróleo escuro segura a navegação e o tema escuro, o papel frio e a superfície branca recebem os números, e o ciano aparece só onde algo age ou está ativo. A interface é densa de propósito, porque a equipe lança gastos, confere propostas e fecha o mês, não navega. Nada decora; cada bloco informa ou age.

O sistema nasce do celular (os tokens do desktop são os mesmos do `/m/`) e vive em dois temas completos, claro e escuro, ambos obrigatórios. Cantos de 10 a 14 px e contornos de 1 px dão a firmeza sem peso; profundidade é tonal, não sombreada.

**Key Characteristics:**
- Petróleo + ciano sobre papel frio; semânticas (ok, alerta, erro, saída) sempre em par texto + fundo suave.
- IBM Plex Sans em tudo, números tabulares nos valores.
- Plano: anel de 1 px no lugar de sombra; sombra só no que flutua.
- Escala natural a 75% em janelas de 1200 px ou mais, com letras devolvidas por `--fs: 1.3`.
- Sem emojis; ícones Phosphor.

## Colors

Paleta de duas famílias frias (petróleo e ciano) com neutros azulados e quatro semânticas quentes e verdes usadas com parcimônia.

### Primary
- **Ciano de Ação** (#12a9d1): marca, gráficos de receita, indicador ativo; no tema claro vira **Ciano de Marca** (#0a7896) para botões e foco, onde precisa de contraste com texto branco.
- **Ciano Médio** (#0d7f9f) e **Ciano Profundo** (#0b4a5c): estados de pressão e apoio; **Ciano Suave** (#e8f8fc) é o fundo de seleção e dos ícones de KPI no claro; **Ciano Claro** (#5fd0ee) faz o papel de acento no escuro.

### Neutral
- **Petróleo** (#031f29): barra lateral e fundo do tema escuro; **Petróleo Profundo** (#021820) para a barra de abas do celular.
- **Superfície Escura** (#0b2f3b) e **Linha Escura** (#164656): cartões e divisões no tema escuro.
- **Papel Frio** (#f2f8fa): fundo do tema claro; **Superfície** (#fefefe): cartões e campos; **Tinta** (#0b2530): texto; **Linha** (#d6e4e9): divisões e anéis.
- **Neutro de Texto** (#5d7480) e **Neutro de Apoio** (#8fa6b0): texto secundário e placeholders.

### Semantic
- **Ok** (#1d7a4f / suave #e3f6ec), **Alerta** (#8a5200 / barra #e0a33a / suave #fff5d9), **Erro** (#b8452c / suave #fdecea), **Saída** (#a24a12 / suave #fdf0e6, despesas).
- No tema escuro cada uma clareia (ok #3ccf8e, alerta #f2b544, erro #ff9d8a, saída #f2a26a) e o fundo vira a própria cor a 14 a 16% de opacidade.

### Named Rules
**A Regra do Ciano que Age.** O ciano marca o que o usuário pode clicar ou o que está ativo agora. Quem usa ciano para enfeitar tira o sentido do botão.

**A Regra do Par Semântico.** Cor de situação nunca vai sozinha: texto na cor forte sobre o fundo suave da mesma família, e sempre com texto ou ícone dizendo o estado.

## Typography

**Display, Body e Label:** IBM Plex Sans (400, 500, 600, 700), com Segoe UI e system-ui de reserva, servida localmente (`public/m/fonts/`).

**Character:** uma família só, trabalhando em pesos. Hierarquia por peso e tamanho, não por troca de fonte; técnica e legível em tela pequena.

### Hierarchy
- **Headline** (700, 25 px × `--fs`, 1,1): título de tela.
- **Title** (600, 21 px × `--fs`, 1,2): valores de KPI e títulos de cartão, com `font-variant-numeric: tabular-nums`.
- **Body** (400, 14 px × `--fs`, 1,5): campos e texto corrido.
- **Label** (600, 13,5 px × `--fs`): botões, itens de menu.
- **Caption** (400 a 600, 11,5 a 12 px × `--fs`): chips, apoio de KPI, atalhos.

### Named Rules
**A Regra do `--fs`.** Todo `font-size` novo no desktop é `calc(Npx * var(--fs, 1))`. Tamanho fixo em px quebra a escala de 75% e deixa o texto com 9 px na tela.

## Layout

Casca fixa: barra lateral de 236 px (264 px a partir de 1200 px) recolhível a 72 px, topbar de 64 px, conteúdo que rola sozinho. Em janela de 1200 px ou mais a página inteira roda a `zoom: .75` e o app é preso à janela (`position: fixed; inset: 0`), para só o conteúdo rolar. Painéis laterais (drawer) de 500 px.

Espaçamento compacto em múltiplos de 4 (8, 12, 16, 24); KPIs em grade `auto-fit` de no mínimo 170 px, quatro colunas quando cabe. O celular troca a barra lateral por uma cápsula de abas inferior (Liquid Glass) e segue a mesma ordem de informação.

Regras de layout do produto: sem rolagem aninhada, nada cortado em 1280x720, 1280x800, 1440x900 e 1920x1080 (desktop) e 375 px (celular).

## Elevation & Depth

Plano por padrão. Profundidade vem da troca de superfície (papel frio atrás, superfície branca na frente; no escuro, petróleo atrás, superfície escura na frente) e de um anel de 1 px. Sombra só em quem flutua.

### Shadow Vocabulary
- **Anel** (`box-shadow: 0 0 0 1px var(--color-divider)`): todo cartão e contorno de campo.
- **Cartão** (anel + `0 1px 2px rgba(3, 31, 41, .04)`): sensação mínima de assentamento.
- **Flutuante** (`0 0 0 1px #d6e4e9, 0 18px 40px rgba(3, 31, 41, .16)`; no escuro `... rgba(0,0,0,.4)`): menus, janelas, a barra lateral que abre ao passar o mouse.

### Named Rules
**A Regra do Plano em Repouso.** Superfície em repouso não tem sombra além do anel (o botão primário é a exceção, com sombra tingida de ciano); sombra grande é sinal de que o elemento está por cima da página.

## Shapes

Cantos arredondados médios, consistentes: 5 px (atalhos de teclado), 8 a 10 px (botões, campos, itens de menu, ícones), 12 px (chips, faixas, avisos), 14 px (cartões), 50% (avatar, spinner). Contorno por anel de 1 px (`box-shadow`), não por `border`. Barras de progresso de 8 px com ponta redonda.

## Components

### Buttons
- **Shape:** 40 px de altura, cantos 10 px, rótulo 600 de 13,5 px.
- **Primary:** fundo Ciano de Marca (#0a7896), texto branco; sombra de cor própria (`0 6px 16px rgba(10, 120, 150, .22)`, a única de repouso); ao passar o mouse escurece para Ciano Profundo (#0b4a5c); transição de 150 ms.
- **Secondary / Ghost:** `.ibtn` de 36 px sem fundo, ícone em Neutro de Texto, fundo aparece ao passar o mouse.

### Chips
- **Style:** 24 px de altura, cantos 12 px, 11,5 px em 600; par semântico (ok, alerta, erro, ciano).
- **State:** o chip "Atual" no menu Suíte usa a variante ok.

### Cards / Containers
- **Corner Style:** 14 px. **Background:** Superfície (claro) ou Superfície Escura. **Border:** anel de 1 px. **Padding:** 16 px; KPI com ícone de 30 px em cantos 9 px e valor em 21 px.

### Inputs / Fields
- **Style:** 40 px, cantos 10 px, anel interno de 1 px em #6f8f9b (claro) ou #5a8493 (escuro), fundo da superfície.
- **Focus:** o anel passa a Ciano de Marca (claro) ou Ciano Claro (escuro).
- **Error / Disabled:** mensagem em Erro sobre fundo suave, com ícone e texto.

### Navigation
- **Barra lateral:** petróleo, itens de 40 px com cantos 10 px, texto #b9d4dd, item ativo com fundo ciano a 16% (rgba(18, 169, 209, .16)), texto branco e ícone em Ciano Claro (#5fd0ee); selo de contagem em #b8452c. Recolhida abre por cima ao passar o mouse (pausa de 140 ms), com itens em cascata. Ctrl B fixa aberta ou recolhida.
- **Menu Suíte** na topbar: lista de apps com ícone, título, apoio e seta; o app atual leva o chip "Atual" e é um link para o início dele.
- **Celular:** cápsula inferior de vidro com pílula que vira lente ao arrastar.

### Abertura animada (assinatura)
Tela de abertura com símbolo que respira, brilho radial em ciano, barra fina de progresso e pontinhos; mantida mesmo com "reduzir movimento", por decisão do Lucas.

## Do's and Don'ts

### Do:
- **Do** usar `calc(Npx * var(--fs, 1))` em todo `font-size` novo do desktop.
- **Do** entregar os dois temas juntos e conferir contra a Referência nos dois.
- **Do** acompanhar cor de situação com texto ou ícone, no par forte sobre suave.
- **Do** manter Centro e Orçamentos idênticos: mesmos tokens, mesmo espaçamento, comparados lado a lado.
- **Do** reservar sombra para menus, janelas e painéis que flutuam.

### Don't:
- **Don't** criar rolagem aninhada nem deixar conteúdo cortado nas resoluções-alvo.
- **Don't** usar emojis na interface.
- **Don't** introduzir função nova de negócio em tela de acabamento.
- **Don't** usar ciano como enfeite em área sem ação.
- **Don't** usar `border` para contorno de cartão ou campo; o padrão é o anel de 1 px por `box-shadow`.
- **Don't** colocar X-Frame-Options global no Centro: ele embute outros apps.
