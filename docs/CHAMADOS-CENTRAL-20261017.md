# Integração central do Chamados — 17/10/2026

## Entrega e preservação da aplicação atual

Esta implementação acrescenta login, entrada pelo menu da Suíte, concessões administrativas e um relay privado de notificações. O trabalho foi isolado em `feat/chamados-cloudflare-20261017`, a partir de `c0bef4a`; não altera a pasta original `C:\cc-suite`.

O código financeiro publicado em 15/10 não corresponde integralmente a nenhum checkout local. Portanto, a publicação deve usar o wrapper de `chamados/deployment`, mantendo o módulo de produção preservado e a imagem atual do Container. O diretório de implantação e seu manifesto de proveniência são mantidos pela coordenação da publicação. Não publicar diretamente o `index.js` desta base antiga sobre o serviço financeiro.

O router aditivo está em `cloudflare/center-container/chamados/worker/integration-router.js`:

- `handleChamadosIntegration(request, env, ctx)` retorna Response somente para as rotas novas; retorna undefined nas demais.
- Login é interceptado somente em POST /v1/auth/login com X-Construtec-App: chamados.
- Handoff e consumo só são interceptados quando target=chamados. Corpos de requisições existentes permanecem disponíveis para o Worker original.
- O módulo não exporta Container nem altera rotinas financeiras ou o agendamento existente.

## Rotas e entrada

| Rota | Função |
|---|---|
| /chamados/entrar | Login normal da conta central e entrada no Chamados |
| /chamados/acessos | Administração de contas, capacidades, clientes e validade |
| /v1/auth/chamados/access | Confere concessão atual antes de oferecer entrada |
| /v1/auth/handoff | Emite código curto, de uso único, para target=chamados |
| /v1/auth/handoff/consume | Consome código no serviço autorizado |
| /v1/users/chamados-access | GET de concessão/histórico/clientes e POST administrativo |
| /v1/internal/chamados/notifications/send | Relay privado a partir de job persistido |
| /v1/internal/chamados/notifications/status | Consulta recibo e evento do provedor |

O login devolve `sessionToken` opaco e `expiresAt` em segundos Unix. O adaptador público do Chamados faz a conversão para ISO; os contratos não aceitam um JWT local como identidade central.

A navegação adicional está em `navigation.js`. O wrapper deve chamar `handleChamadosNavigation` para servir /chamados/suite.js, preparar a requisição original com `prepareChamadosNavigationRequest` e passar a resposta por `injectChamadosNavigation`. Somente o HTML GET de /d, /d/, /d/index.html, /m, /m/ e /m/index.html recebe o script. Nesse HTML, as condicionais antigas são removidas e a resposta recebe Cache-Control: no-store. Assets financeiros continuam intactos.

O script acrescenta links aos menus existentes do desktop e celular. Não lê/copía tokens ou armazenamento do navegador. O link de administração é uma indicação visual de papel; a API valida novamente a autoridade em cada leitura/gravação.

## Concessões administrativas

O administrador precisa de sessão central válida, conta ativa, org correta, role=admin e suite_role admin ou nulo. Sessões ancestrais expiradas, removidas, cíclicas ou de outra identidade impedem a operação. A chave de serviço do Orçamentos não substitui a sessão administrativa.

Uma concessão grava capacidades explícitas e escopo. Os cinco nomes canônicos são chamados.ler, chamados.criar, chamados.editar, chamados.executar e chamados.gerir. Ler é obrigatório. Portal aceita somente ler/criar, exige clientes definidos e só vê chamados próprios. Cada cliente selecionado é conferido em CHAMADOS_DB.cc_entities, com organization_id atual, type=clientes e active=1.

O POST exige Idempotency-Key UUID, expectedRevision e motivo de 5 a 500 caracteres. A mesma chave e o mesmo corpo retornam a resposta anterior; conteúdo diferente gera conflito. A transação revalida administrador, sessão e estado do usuário, compara a revisão, preserva apps anteriores, atualiza a concessão e insere auditoria. Falha de auditoria desfaz toda a transação. O histórico possui triggers contra UPDATE/DELETE.

A conta proprietária real identificada pela coordenação é Lucas dantas, PCM, id `38135b1e-e20f-478e-aac9-4e40bd4cbdfe`. Seu role central é admin e suite_role é nulo. O adaptador aplica o mapeamento legado já existente para admin sem alterar essa coluna. A ativação inicial é feita pela implantação auditada; o endpoint não tem bypass de bootstrap nem cria sessão artificial.

A edição legada POST /v1/users/access também mantém o app Chamados já concedido. O wrapper chama `withPreservedChamadosApp(request, env, (r, e) => original.fetch(r, e, ctx))`, exportado de legacy-access-preservation.js. A autenticação, a validação de papel e as mudanças dos outros apps continuam no handler de produção. A proteção altera apenas a atribuição de apps dentro do UPDATE original, usando CASE no mesmo comando atômico; a assinatura dessa SQL foi confirmada exatamente uma vez no bundle publicado.

A preservação exige conta ativa, app Chamados ainda presente, mesma organização e a mesma revisão da concessão ativa e não expirada no instante da escrita. Revogação, revisão nova, desativação ou remoção concorrente do app impedem a preservação. Duas edições simultâneas não abrem uma janela sem o app. A rotina não cria concessões e falha antes de gravar se um handler futuro mudar a assinatura da SQL. A revogação explícita permanece no painel /chamados/acessos. A reconciliação futura do Container também tem as correções de catálogo em suiteRoles.js e services/userAccess.js.

## Banco e configuração

Aplicar apenas estas migrações no D1 CENTRAL, depois do backup:

1. 014-chamados-access.sql — concessões, handoffs e guardas de transação.
2. 015-chamados-grant-audit.sql — histórico administrativo imutável.
3. 016-chamados-notification-receipts.sql — recibos, leases e idempotência do relay.

Elas não criam nem ativam contas. Não aplicar migrações operacionais do Chamados no banco central.

Configuração da integração:

| Nome | Valor / origem |
|---|---|
| CHAMADOS_ENABLED | true após configuração dos recursos |
| CHAMADOS_PUBLIC_ORIGIN | https://construtec-chamados.construtec-reports.workers.dev |
| CHAMADOS_ORGANIZATION_ID | rcconstrutec.com.br |
| CHAMADOS_SERVICE_KEY | Segredo novo compartilhado somente pelos Workers |
| CHAMADOS_DB | D1 construtec-chamados-producao, 3935067a-ab35-4736-970d-600b7d876d55 |
| CHAMADOS_NOTIFICATIONS_ENABLED | true para aceitar envio da outbox |
| EMAIL_PROVIDER_API_KEY e EMAIL_FROM | Configuração existente de Resend na central; não copiar valores |

O binding central CHAMADOS_DB aponta somente para o banco operacional. O armazenamento de arquivos privado separado não precisa de binding na central.

## Notificações

O relay usa o header X-Chamados-Service-Key e compara organização, destinatário, evento, recurso, protocolo, visibilidade, assunto e texto com o job imutável em cc_notification_jobs. Não aceita endereço livre, HTML ou URL arbitrária. Confere evento real e relação chamado/atividade/relatório; exclui registros importados. Resolve destinatário ativo pelo userId central e revalida app, concessão, validade, capacidade, cliente e atribuição.

Um técnico precisa continuar atribuído. Quando o cadastro usa id operacional, cc_entities.user_id deve ter vínculo explícito e ativo. Portal exige chamado próprio e público; comentários exigem metadado público persistido, não basta o campo enviado. Relatórios e atividades são internos.

O recibo durável usa evento+destinatário, hash do payload e lease. Repetições conservam Idempotency-Key do Resend. Aceito só é gravado após providerId; entregue só após evento explícito do provedor. Um timeout não implica que o e-mail falhou nem autoriza outro identificador. Após 23 horas, tentativa inconclusiva fica incerta para evitar duplicação depois da janela de idempotência do Resend.

Consultar status não reenvia mensagem. Se a chave existente não permite leitura de recibos, a resposta continua accepted e informa provider_unavailable; não inventa confirmação de entrega. Não houve envio real de e-mail nas verificações.

Referências primárias: [Idempotência Resend](https://resend.com/docs/dashboard/emails/idempotency-keys) e [Consulta de e-mail](https://resend.com/docs/api-reference/emails/retrieve-email).

## Verificação e manutenção

- 38 testes centrais focados aprovados: administração (11), relay (14), fixture/wrapper/navegação (3) e preservação atômica durante a edição legada (10).
- Integração outbox operacional → central → Resend simulado: 4 casos aprovados no trabalho operacional.
- QA no Chrome em 1440 e 390 pixels: login normal, salvar acesso, restringir portal, revogar, sair; sem overflow ou erro de console. Links dos dois menus adicionados e links anteriores preservados.
- Regressão completa: 490/490 aprovados, sem falhas (503 segundos), mais os 10 testes do shim executados depois da descoberta da suíte: 500 testes aprovados ao todo. npm run check passou com 238 arquivos JavaScript. Evidências e resumo em docs/verificacao/chamados-central-20261017.
- Reconstruir assets após editar HTML/CSS/JS: `node scripts/build-chamados-central-assets.cjs`.
- Testes focados: `node --test test/chamados-admin.test.js test/chamados-notifications.test.js test/chamados-wrapper.test.js test/chamados-legacy-access.test.js`.
- QA local: `node scripts/chamados-admin-qa.cjs`. Usa SQLite em memória e perfil temporário próprio de Chrome. CHAMADOS_CDP_HELPER pode apontar para o helper CDP existente.

A fixture de implantação é preparada por test/chamados-deployment-fixture.cjs. Não executa SQL ao importar. Gera senha aleatória apenas em memória e fornece login normal por senha; role sempre supervisor, apps somente Chamados e validade de uma hora. Não fornece senha no retorno ou JSON. O caller executa as instruções e realiza cleanup em finally. A limpeza remove sessões/dispositivos/avisos e exclui a conta logicamente, preservando eventual auditoria. Não é um endpoint de produção.
