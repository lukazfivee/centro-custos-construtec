# Chamados e O.S. dentro da Suíte

O Chamados e O.S. é a terceira tela da Suíte, com entrada única pela conta do Centro de Custos. Este arquivo
descreve o que o Chamados (site em `https://construtec-chamados.construtec-reports.workers.dev`) precisa
cumprir para funcionar dentro de cada casca.

## Entrada (todas as cascas)

1. A casca confere a concessão (`GET /api/auth/suite-chamados` no Centro, que consulta a central). Sem
   concessão confirmada, o item "Chamados e O.S." não aparece.
2. A casca pede o código de uso único (`target: chamados`, 43 caracteres base64url) e abre a origem do
   Chamados com `#handoff=<código>`. O Chamados troca o código pela sessão e **remove o `#handoff` do endereço**
   (`history.replaceState`) antes de qualquer outra coisa. O código não deve ir para log nem para a página.
3. Não há login separado: se o código falhar, o Chamados mostra o erro e a opção de voltar à Suíte, sem
   formulário de e-mail e senha quando estiver dentro do app.

## Windows (app Suíte)

- `desktop/chamados-view.cjs`: WebContentsView da mesma janela, sessão `persist:suite-chamados`, sandbox,
  sem nodeIntegration, permissões do navegador negadas, navegação só na origem configurada (o resto abre no
  navegador do sistema). A barra de título mostra "Chamados e O.S.". Atalho Ctrl+3.
- Origem: `CHAMADOS_PUBLIC_ORIGIN` (padrão de produção) e `CHAMADOS_ENABLED` (padrão `true`); um `.env` do
  app com `CHAMADOS_ENABLED=false` desliga.
- Ponte para o menu do Chamados voltar à Suíte, exposta só na origem do Chamados:

  ```js
  window.electronAPI.suiteAvailable            // true dentro do app
  await window.electronAPI.suiteSwitch('centro' | 'orcamentos' | 'chamados')  // { switched }
  ```

  No app, o menu Suíte do Chamados deve chamar `suiteSwitch` (como o do Centro e o do Orçamentos) em vez de
  abrir links em nova aba.
- Trocar de conta no Centro limpa a sessão do Chamados e entra com código novo; sair do Centro faz o mesmo na
  próxima abertura do Chamados.

## Celular

- **Navegador** (`public/m/suite.js`): o item abre o Chamados na mesma aba, com o código. Voltar é pelo
  menu do próprio Chamados, com link para `<origem do Centro>/m/` (a sessão do Centro continua guardada).
- **APK**: `suite://app/chamados` troca para uma WebView própria (`SuiteViews`), aberta com o código do
  `AuthController.handoffCode("chamados")`; sem código (sem concessão ou sem internet) o app avisa e não abre.
  Links de outra origem saem para o navegador do aparelho. O Chamados volta com os links
  `suite://app/centro-custos` e `suite://app/orcamentos`; qualquer outro `suite://` vindo do Chamados é
  ignorado. O user agent traz `SuiteConstrutec/<versão>`, que o Chamados usa para saber que está no app.
- Base do APK: `-PchamadosWebBase=https://...` no Gradle (padrão de produção).

## Limites conhecidos

- Técnico (papel `tecnico`) não abre o seletor da Suíte no celular (regra anterior do `/m/`); portanto não
  chega ao Chamados por ali. Liberar isso é decisão de produto.
- Câmera e outras permissões do navegador ficam negadas na view do Windows; o envio de arquivos por
  `<input type="file">` funciona.
