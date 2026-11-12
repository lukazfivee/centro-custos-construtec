# C5 — Início e Lançamentos

Issue #136 · branch `feat/telas-c5` · 14/10/2026.

Código do Início e de Lançamentos e kit `scripts/conferencia/c5.js` pelo Codex (gpt-6-astra). Os créditos do Codex acabaram antes do relatório; capturas, correção do seletor de mês, suíte, relatório, commit e PR pelo Claude Code.

## Ajustes

- Início: o espaço do aviso de primeiro uso some quando não há aviso; os seis indicadores ficam numa linha até 1200 px (antes caíam para 3 colunas abaixo de 1380 px); nomes e descrições longos quebram em vez de cortar; formulário do lançamento rápido em duas colunas.
- Lançamentos: a tabela não tem rolagem própria (só a da página), larguras de coluna fixas, cabeçalhos e descrições quebram; filtros e rodapé quebram linha; formulário, resumo do estorno e dados do lançamento não encolhem dentro do painel.
- Lançamentos: o seletor de mês cortava "Outubro de 2026" com a escala de fonte 1,3; a largura agora acompanha `--fs` (achado na conferência visual, o detector não mede texto de `<select>`).

Removido da interface: nada.

## Resultado

- Kit C5: **252 capturas** (42 estados de D1 e D2 × 1280x720, 1280x800, 1440x900 × claro/escuro), **0 com erro, rolagem horizontal, rolagem aninhada ou corte** ([resultado.json](evidencias/resultado.json)). 84 capturas versionadas em `evidencias/depois/` (1280x800).
- `npm test`: 515/517 na suíte inteira; as duas falhas (`database-lock.test.js`, PID reutilizado, e `smart-sync-async-job.test.js`) são intermitentes já conhecidas e passam isoladas (2/2).
- `npm run check`: 274 arquivos.

## Reproduzir

```powershell
node scripts/conferencia/c5.js            # todas as telas
node scripts/conferencia/c5.js lista --tamanhos 1280x800
```

Portas: app 3221, Chrome 3222, Referência 3223, extras 3224-3225. Temporários em `.tmp/` desta pasta.
