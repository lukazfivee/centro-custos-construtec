# Regras do Agente — Centro de Custos CONSTRUTEC

Aplicação web e local-first de Gestão Financeira de Obras da Construtec Engenharia (Node.js, Express, PGlite / PostgreSQL, Vanilla JS & CSS).

## Regras Universais

- **Sem emojis no frontend**:
  - Nenhuma interface visual (botões, menus, cabeçalhos, títulos, modais, cards, badges, abas, tabelas, notificações ou alertas) deve conter emojis Unicode.
  - Utilize exclusivamente ícones vetoriais SVG oficiais, classes de estilo semânticas e tipografia corporativa em português sóbrio.
- **Integridade Contábil & Imutabilidade**:
  - Baselines aprovadas e contratos selados são estritamente imutáveis (triggers de proteção no banco).
  - Lançamentos financeiros liquidados e fechamentos mensais não aceitam mutação destrutiva sem estorno auditado.
  - Todos os cálculos monetários devem respeitar precisão em centavos com arredondamento HALF_UP.
- **Clean Code & Quality Gates**:
  - Respeitar rigorosamente o limite de linhas por arquivo (`MAX_LINES <= 350`).
  - Validar todos os 89 testes com `npm test` antes de considerar qualquer alteração concluída.

## Agentes, ferramentas e continuidade
- Em tarefa tecnica, consulte [protocolo de contexto sob demanda](docs/ai/START-HERE.md) e apenas a documentacao do escopo.
- Codex e qualquer conta do Claude registram o estado da tarefa em Issue/PR, usando [handoff compacto](docs/ai/HANDOFF-TEMPLATE.md); nao publicam sem autorizacao.
