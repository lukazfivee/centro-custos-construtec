# C4 — Usuários e papéis

Issue #135 · worktree `C:\cc-t-c4` · branch `feat/telas-c4` · base `e0077f4`.

Implementação e kit entregues; **homologação visual e suíte pendentes do orquestrador**. Não foram iniciados Chrome, servidor de teste ou `node --test` nesta execução, conforme a restrição informada. Sem instalação de dependências, commit, push, PR, comentário no GitHub ou alteração de backend/banco.

## Ajustes implementados

- Lista: ação Convidar/Novo usuário no cabeçalho, ao lado de “Ver o sistema como”, inclusive nas outras abas; busca e filtros próximos, conforme a Referência. Preservada a escolha real entre convite corporativo e criação local por senha.
- Indicadores: detalhes explicativos e cores dos ícones conforme a Referência, com números vindos dos dados existentes.
- Contagem real na aba Usuários e no rodapé da lista, atualizada pelos filtros e pela busca.
- Papéis: cores distintas para os seis papéis, incluindo variantes escuras; apps empilhados com ícones; ícone de status. Tabela com distribuição de largura e quebra de textos para reduzir risco de corte.
- Abas: removida a margem inferior que duplicava o espaçamento da página; aba ativa usa a cor de destaque.
- Matriz: removidas larguras mínimas rígidas e rolagem horizontal própria; colunas proporcionais com quebra de texto, separador no cabeçalho e controles de 34 × 34 px. Os 12 itens e as regras de permissão permanecem os do servidor.
- Convite/edição: Nome e Papel na mesma linha, E-mail abaixo; borda no resumo de permissões e quebra de nomes longos de obras. Mantidos campos, seleção de apps/obras, validações, restrições e endpoints.
- Confirmações: título e ícone do painel acompanham “Usuário criado” e “Convite enviado”.
- “Ver como”: faixa abaixo da barra superior, na ordem visual e de teclado da Referência, com quebra quando faltar largura. Mantidos aviso de simulação, identidade real e botão de retorno.

**Removidos:** nenhum controle, campo, permissão ou recurso. Foram retirados apenas espaçamento redundante e restrições de layout; o botão de criação foi deslocado.

## Evidência usada

Inspeção de imagens existentes do C1, nos temas claro e escuro, e do HTML `docs/suite-desktop/prototipo/Desktop.dc.html`. As capturas D6 abaixo são **anteriores ao C4**, não comprovam o resultado dos ajustes.

| Estado | C1 | Referência |
|---|---|---|
| Lista | [1280×800 claro](../D6/1280x800-claro-usuarios-lista.jpg) | [60](../../prints/60-usuarios.jpg) |
| Matriz | [claro](../D6/1280x800-claro-papeis-permissoes.jpg), [escuro](../D6/1280x800-escuro-papeis-permissoes.jpg) | [65](../../prints/65-papeis-permissoes.jpg) |
| Novo usuário | [1280×800 escuro](../D6/1280x800-escuro-usuario-novo.jpg) | [61](../../prints/61-convidar-usuario.jpg) |
| Edição | [1280×800 claro](../D6/1280x800-claro-usuario-editar-acesso.jpg) | [64](../../prints/64-editar-acesso.jpg) |
| Simulação | [1280×800 escuro](../D6/1280x800-escuro-ver-como-tecnico.jpg) | [67](../../prints/67-ver-como-tecnico.jpg) |

## Rodar o kit

Na worktree, sem instalar dependências:

```powershell
node scripts/conferencia/c4.js --saida docs/suite-desktop/validacao/C4/depois
```

Padrões: **1280×720, 1280×800 e 1440×900**, temas **claro e escuro**. Catálogo: **49 estados × 6 combinações = 294 capturas planejadas**, ainda não executadas.

```powershell
# Só listar: não inicia Chrome nem banco.
node scripts/conferencia/c4.js --listar
# Repetir um estado sem rodar todo o catálogo.
node scripts/conferencia/c4.js D6/convite-tecnico --tamanhos 1280x720 --temas escuro
```

Saídas: `depois/resultado.json`, `depois/index.html`, `depois/app/D6/` e `depois/ref/D6/`. O kit rejeita `--validacao` para preservar os prints D6 do C1; a saída precisa ficar dentro de `validacao/C4/`.

Portas fixas: app **3161**, Chrome **3162**, Referência **3163**, nuvem fictícia **3164**, Worker fictício **3165**. O isolamento redireciona TEMP/TMP/TMPDIR para `C4/.tmp/`; os dados e perfis temporários do C1 nascem ali. `.tmp/` e `depois/` estão no `.gitignore` local. O kit verifica a abertura do Chrome antes de criar o banco fictício e reutiliza o encerramento dos serviços do C1.

## Cobertura preparada

- Seis sessões reais do servidor fictício: administrador abre Usuários; gestor, financeiro, engenharia, técnico e comercial recebem “Sem acesso”, conforme a matriz padrão sem p9. Verifica ausência dos controles administrativos nessas sessões.
- Edição de cada um dos seis papéis; criação local por senha e formulário de convite de cada papel. Confere seis opções, os 12 itens do resumo e bloqueio de Nome/E-mail na edição.
- Matriz local só para consulta: 60 controles desabilitados e 12 células de administrador travadas. Matriz corporativa simulada: alternância de permissão e confirmação de restauração. Captura adicional do fim da matriz.
- Lista normal, filtros Todos/Ativos/Convites/Desativados com dados mistos fictícios, busca vazia e e-mails externos (estado existente do C1).
- Confirmação de usuário criado no banco descartável do C1, confirmação de convite e reenvio simulados, validação de campos vazios, obras “Todas” e fim do formulário de edição.
- “Ver como” para os seis papéis e retorno ao administrador. Confere papel visual, identidade real preservada, faixa e sua posição abaixo do topo.
- Sonda adicional ao C1 para overflow horizontal, conteúdo ocultado por corte, rolagem interna e rodapé do painel fora da janela. Não substitui inspeção humana dos prints; rolagem vertical da página ou do corpo do painel é permitida para alcançar o conteúdo longo.

**Mocks corporativos são somente visuais e de interação do frontend:** interceptam `CC.api` dentro da página do kit para cadastros/convites/matriz e desaparecem ao recarregar. Não enviam e-mail, não alteram a autorização do servidor e não comprovam integração com a conta corporativa. Os demais dados continuam no servidor fictício do C1. Nenhuma migração ou código de backend foi alterado.

Nove estados não têm equivalente direto no protótipo (cinco acessos negados e quatro simulações). O C1 registrará **54 avisos esperados de Referência ausente** ao capturá-los nas seis combinações. Nos outros estados, a Referência indica a composição correspondente; papel, método, filtro, rolagem e dados podem diferir. O print 67 usa Fornecedores e a simulação atual do app abre Início.

## Validação desta entrega

- `npm run check`: **274 arquivos JavaScript verificados**, após os ajustes finais do frontend.
- `node --check scripts/conferencia/c4.js` e `node --check scripts/conferencia/c4-isolamento.js`: passaram.
- `node scripts/conferencia/c4.js --listar`: passou, **49 estados**.
- `git diff --check`: passou.
- Detector Impeccable: somente 12 avisos de cores/raios fora do DESIGN.md. Cores de Gestor/Engenharia e raio de 9 px reproduzem explicitamente `Desktop.dc.html`; raios de 12 px já existiam. Preservados por autoridade da Referência, sem alterar o design global.
- Arquivos de implementação abaixo de 350 linhas.
- **Capturas novas, ausência de cortes nas seis combinações e suíte completa: não verificadas nesta execução.** O usuário reservou essas etapas ao orquestrador por bloqueio de spawn. Não houve tentativa de contornar a restrição.

Para o orquestrador, depois de conferir `resultado.json` e os prints:

```powershell
npm run check
npm test -- --test-concurrency=1 --test-force-exit --test-timeout=180000
```

## Divergências mantidas e próximos passos

- Escala global de 75%/fontes ampliadas, ausência do sino e avatares monocromáticos permanecem. Não foi alterada a identidade global do Desktop novo.
- A matriz padrão do servidor difere em permissões do exemplo do protótipo; mantida como autoridade funcional. Sem conta corporativa, a matriz é só leitura e a criação usa senha provisória informada, não gerada.
- Convite não atribui obras antes de a conta existir; nome/e-mail são bloqueados na edição. O protótipo ilustra possibilidades diferentes, mas mudar esses contratos exigiria trabalho fora deste ticket.
- Lista mantém quantidade de obras em vez de buscar seus códigos individuais; a aba E-mails externos mantém o layout atual e não ganhou contador. Ação de editar explícita e botão “Reenviar” foram preservados; não foi adicionado “Convidar outra pessoa” na confirmação.
- “Ver como” continua sendo simulação visual com sessão real de administrador, não valida isolamento dos dados do servidor. A página inicial exibida e a integração corporativa real não foram homologadas.
- Rodar as 294 capturas, revisar os dois temas e os três tamanhos, confirmar ausência de cortes/rolagens aninhadas e executar a suíte. Só então registrar o resultado visual, integrar e publicar pelo fluxo do orquestrador. Igualdade com Orçamentos fica para X1; aparelhos reais ficam para X2.

Contexto de design: o detector sinaliza PRODUCT.md como web apesar da pasta Android. Mantido porque este ticket trata de `/d/`; eventual revisão desse documento pode ser feita à parte.

Nenhum Chrome, servidor de teste ou processo de suíte foi iniciado. Os comandos de check terminaram; não há processo desta entrega deixado em execução.

## Resultado após os ajustes (orquestrador, 14/10)

Código pelo Codex; capturas, suíte, commit e PR pelo Claude Code, porque o sandbox do Codex bloqueia `spawn`.

- Kit C4: **294 capturas** (49 estados × 3 tamanhos × 2 temas). Sem rolagem horizontal, rolagem aninhada ou corte em nenhuma. 54 avisos são só "Sem Referência no protótipo para este estado" (acessos e "ver como" por papel). Uma falha intermitente de preparo (`ver-como-comercial` 1440x900 claro) passou ao repetir (6/6). Ver [resultado.json](evidencias/resultado.json).
- 98 capturas versionadas em `evidencias/depois/` (1280x800, claro e escuro).
- `npm test`: **517/517**; `npm run check`: 274 arquivos.
- `public/d/shell.js`: só moveu a faixa "ver como" para baixo do cabeçalho.

