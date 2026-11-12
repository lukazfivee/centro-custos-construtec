# Kit de conferência do Desktop novo (ticket C1)

Abre cada tela do Desktop novo (`/d/`) em 1440×900 e 1280×800, nos temas claro e escuro, e salva os prints ao lado da Referência (o protótipo `docs/suite-desktop/prototipo/Desktop.dc.html`, renderizado no mesmo tamanho e tema). Roda só com dados de exemplo inventados, em banco temporário novo a cada execução: não toca AppData, o app instalado, o Neon nem o Cloudflare.

## Como usar

```bash
npm run conferir -- --listar              # grupos e telas (D0 a D7, Login)
npm run conferir -- D6 D7                 # só os grupos D6 e D7
npm run conferir -- D7/fechamento         # uma tela
npm run conferir -- D6 --validacao        # grava também os prints em docs/suite-desktop/validacao/<grupo>/
```

Opções: `--tamanhos 1440x900,1280x800`, `--temas claro,escuro`, `--saida <pasta>`, `--sem-referencia`, `--porta 3101` (o Chrome usa porta+1 e o protótipo porta+2).

Saída padrão: `docs/suite-desktop/validacao/_conferencia/` (não versionada): `app/`, `ref/`, `resultado.json` e `index.html` (galeria lado a lado). `resultado.json` traz, por captura, as sondas automáticas: rolagem horizontal, rolagem aninhada e elementos fora da janela.

## Armadilhas

- Uma execução completa leva vários minutos. Rode em segundo plano; um `timeout` curto corta a execução antes de gravar o resultado.
- Duas execuções ao mesmo tempo precisam de `--porta` diferentes (outros kits, como o do Orçamentos, também usam 3101 a 3103).
- Cada tela que grava dados desfaz o que fez (`limpar`); "ver como técnico" limpa a simulação do `sessionStorage`, senão as telas seguintes perdem os botões de administrador.

Prints de D6 e D7 versionados: `docs/suite-desktop/validacao/D6/` e `D7/`. Divergências por tela: [DIVERGENCIAS.md](DIVERGENCIAS.md).
