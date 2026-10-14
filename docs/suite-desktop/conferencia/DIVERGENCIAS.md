# Divergências por tela (Desktop novo do Centro, D6 e D7)

Gerado em 13/10/2026 com o kit do C1 (`npm run conferir`), 4 capturas por tela. Consumido pelos tickets C2 a C7.

**Cobertura:** as sondas automáticas rodaram em todas as 28 + 64 capturas de D6 e D7. A comparação visual contra a Referência foi feita só na tela Fechamento; as demais telas ainda precisam do olhar de quem pegar o ticket (galeria em `_conferencia/index.html`).

| Tela | Referência | O que difere | Ticket |
|---|---|---|---|
| D7 Fechamento (1440×900, claro e escuro; também "fechar com pendências") | `hist`/`fechamento` do protótipo | Sonda: elementos fora da janela (`li.ck-item`). No print, os itens de "Antes de fechar" ficam lado a lado e vazam para a direita, cortados; na Referência formam uma lista vertical com botão "Ver" | C2 (#133) |
| D7 Fechamento | idem | Seletor de ano mostra "202" cortado | C2 (#133) |
| D7 Fechamento | idem | Cabeçalho sem o chip "Sincronizado" e sem o sino de notificações da Referência; o chip mostra "Dados neste computador" (efeito do ambiente de teste, confirmar no app) | C2 (#133) |
| Demais telas D6 e D7 | vários | Sem divergência automática (nenhuma rolagem horizontal ou aninhada). Visual ainda não comparado | C2 a C4 |

Nota: os dados de exemplo do kit diferem dos da Referência (valores, meses fechados), então números diferentes não contam como divergência.

## C2 — conferência de 14/10/2026

Os cortes do checklist e do ano descritos acima foram corrigidos em feat/telas-c2. Fechamento e Histórico conferidos em 1280x720, 1280x800 e 1440x900, claro e escuro, com sondas limpas. Cor de Reabrir e rótulos/detalhes do Histórico também alinhados. Evidências e limites em ../validacao/C2/README.md. O sino da Referência continua fora deste escopo; igualdade global fica para X1. Main e publicação dependem do fluxo final.
