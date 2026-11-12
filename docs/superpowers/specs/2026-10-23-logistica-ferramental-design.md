# Logística de ferramentas e materiais

## Intenção

Criar uma área própria de Logística dentro do Centro de Custos Construtec para controlar ferramentas da empresa, kits dos técnicos e materiais de serviço. A equipe de logística precisa registrar entregas, devoluções, faltas, avarias e saldos com poucos passos. Técnicos precisam consultar o próprio kit, relatar ocorrências e assinar remotamente os recibos.

## Objetivos

- Manter inventário de ferramentas como unidades identificáveis, com localização, situação, responsável atual e histórico individual.
- Definir um kit padrão esperado para todo técnico, permitindo também ferramentas extras específicas por técnico.
- Registrar entregas iniciadas pela Logística ou solicitadas pelo técnico; toda ferramenta entregue fica atribuída ao técnico e documentada em ficha assinada digitalmente.
- Manter falta registrada e kit incompleto até uma reposição. A Logística registra a apuração do ocorrido.
- Registrar devolução parcial, condição física e destino de avaliação das ferramentas avariadas.
- Controlar materiais consumíveis por item, unidade de medida e quantidade. Registrar entradas, saídas e devoluções, com saldo e histórico.
- Vincular toda saída de material a uma obra ou serviço e a um técnico responsável, inclusive quando a entrega for para uma equipe.
- Exibir aviso de estoque baixo usando mínimo definido para cada material.
- Emitir fichas e relatórios consultáveis e imprimíveis, mantendo histórico auditável.

## Fora do escopo

- Criar um perfil novo de acesso ou um sistema complexo de compras, fornecedores e aprovação financeira.
- Integrar a Logística à contabilização de despesas ou alterar os fluxos financeiros existentes.
- Exigir devolução de toda sobra de material: essa regra varia por item.
- Controlar ferramentas de clientes atendidas em Chamados como se fossem patrimônio da empresa.

## Critérios de sucesso

- A Logística consegue saber rapidamente o que está disponível, com técnico, em falta, em avaliação ou abaixo do mínimo.
- Cada ferramenta individual pode ser localizada no tempo, incluindo entregas, responsáveis, devoluções, avarias, reparos e baixa definitiva.
- Um técnico consegue confirmar entregas pelo celular e ver quando seu kit padrão está incompleto.
- Toda quantidade de material pode ser explicada pelo saldo inicial e pelas movimentações registradas, incluindo obra/serviço e responsável.
- Os fluxos frequentes de entregar, receber de volta e separar material não exigem navegar por telas financeiras.

## Estado atual e restrições do projeto

O app usa Node/Express, PGlite/PostgreSQL e JavaScript/CSS sem framework de frontend. Técnicos já têm acesso móvel limitado às obras e serviços atribuídos e existe um padrão de assinatura desenhada para aceite de serviço. A associação a obra/serviço usa as atribuições existentes. Chamados mantém cadastro de equipamentos de clientes, não estoque de ferramental da empresa.

Permissões existentes incluem `admin`, `gestor`, `financeiro`, `engenharia`, `tecnico` e `comercial`. A Logística usará o perfil `gestor`, sem novo perfil. O servidor deverá validar permissões, propriedade dos itens e vínculo do técnico à obra/serviço; ocultar a tela no menu não basta. Reutilizar os padrões de assinatura, mobile, auditoria, acessibilidade, sincronização offline e armazenamento existentes. Não adicionar dependência sem necessidade. Respeitar `MAX_LINES <= 350`, não usar emojis no frontend e preservar integridade dos registros.

## Abordagens consideradas

1. **Área própria de Logística dentro do Centro de Custos — escolhida.** Reúne ferramentas, kits, materiais, solicitações e movimentações, com visão operacional para gestores e ações restritas no celular do técnico. Mantém o trabalho diário separado das despesas e evita misturar patrimônio com os equipamentos de clientes.
2. **Incorporar materiais às despesas da obra/serviço.** Aproveitaria telas financeiras existentes, mas não controla saldo físico, responsabilidade por ferramenta, devolução ou kit incompleto. Não atende ao uso diário da equipe.
3. **Criar um sistema independente de almoxarifado e compras.** Poderia cobrir fornecedores e compras, mas amplia o escopo e duplicaria conceitos financeiros que não foram pedidos.

A primeira abordagem foi escolhida por concentrar a operação sem criar um subsistema financeiro. O Gestor controla a Logística; os técnicos usam apenas suas telas operacionais existentes e a ficha de recebimento.

## Navegação e visão geral

Adicionar “Logística” ao Centro de Custos, visível a `admin` e `gestor`. Dentro da área, apresentar: **Resumo**, **Ferramentas**, **Kits dos técnicos**, **Materiais**, **Solicitações** e **Movimentações**. O Resumo mostra contagens verdadeiras e filas acionáveis: entregas aguardando assinatura, divergências, faltas, devoluções/avarias em avaliação, solicitações a separar e materiais abaixo do mínimo. Os valores fictícios do mockup servem só para layout; não são requisitos de contagem ou dados iniciais.

As ações principais devem estar disponíveis diretamente no Resumo: registrar entrada, iniciar entrega, registrar devolução e atender solicitação. A tela administrativa deve ser responsiva, e a tela móvel de técnico deve seguir o padrão já existente.

## Ferramentas e responsabilidade

### Cadastro e inventário

Cada ferramenta rastreável é cadastrada como uma unidade individual, com identificação interna, categoria, descrição e, quando houver, número de série. O inventário registra localização e situação. Na ausência de série do fabricante, o sistema fornece uma identificação interna. A entrada de uma ferramenta nova ou do saldo inicial gera um registro de entrada e inicia o histórico daquela unidade como disponível na base.

O catálogo mantém a lista de itens exigidos pelo kit padrão. Cada técnico pode ter unidades extras atribuídas a ele sem alterar o padrão. A composição do kit é administrada por Gestor. O kit mostra requisito, posse e pendências por item.

### Implantação do inventário existente

No início de uso, a Logística faz uma conferência por técnico: cadastra individualmente cada ferramenta atual confirmada com a pessoa e registra a responsabilidade a partir da data real da conferência. O técnico recebe uma ficha de conferência inicial do kit e assina remotamente. Esse evento deve estar identificado como conferência inicial, não como entrega passada. Ferramentas encontradas na base entram como disponíveis. Se a conferência confirmar que um item esperado está faltando, ele aparece como falta no kit; a Logística registra a apuração, e a falta só é resolvida com reposição documentada. Ferramentas extras confirmadas com o técnico são registradas como extras de seu kit.

### Entrega e ficha assinada

O Gestor pode iniciar uma entrega sem solicitação ou atender um pedido do técnico. Escolhe o técnico, seleciona uma ou mais ferramentas disponíveis, registra quem entregou, data/hora e, quando aplicável, obra/serviço. A operação gera uma única ficha para os itens entregues naquela ocasião, apresentada no celular do técnico para leitura e assinatura desenhada.

No registro da entrega física, os itens deixam imediatamente o saldo disponível e ficam associados ao técnico, com estado de ficha “aguardando assinatura”. A assinatura confirma o recebimento; a falta de assinatura permanece visível como pendência. Antes de assinar, o técnico pode apontar falta, item divergente ou avaria. A ficha fica pendente para revisão da Logística; após a conferência, ela é corrigida ou a divergência é registrada antes da assinatura final. A assinatura registra identidade da conta, data/hora e conteúdo da ficha; manter trilha técnica de integridade conforme o padrão do projeto.

O documento deve ser consultável e imprimível, listando técnico, quem entregou, itens/identificadores, data/hora, obra/serviço quando aplicável, observações e assinatura.

### Kit incompleto, falta e apuração

O técnico consegue relatar que uma ferramenta sob sua responsabilidade está faltando. O item passa a “em falta”, a ficha/ocorrência passa a pendente de apuração e o kit fica incompleto. A Logística registra o que apurou (incluindo causa ou resultado desconhecido) e qualquer observação. A falta não é encerrada como simples devolução: ela só deixa o estado de falta quando uma reposição é entregue e documentada; o histórico da unidade desaparecida permanece.

### Devolução e avaria

O Gestor registra devolução total ou parcial, identifica condição observada e atualiza a localização. Ferramentas mantidas pelo técnico continuam sob responsabilidade dele. Itens danificados vão para “escritório da base”, em avaliação, indisponíveis para nova entrega. Após avaliação, a Logística registra um dos resultados:

- **Reparada e conferida:** retorna ao inventário disponível após verificação pela Logística.
- **Baixa definitiva:** registra motivo, responsável pelo registro e data; a unidade sai do estoque ativo, mas seu histórico permanece.

Cada transferência de localização, avaliação, reparo ou baixa precisa ser uma movimentação auditável, sem apagar eventos anteriores.

## Materiais e saldo

Materiais como parafusos, conectores RJ45 e itens diversos são cadastrados por item e unidade de medida, com saldo em quantidade e estoque mínimo configurável. A criação ou carga inicial registra a quantidade inicial. Entradas posteriores (como reposição) acrescentam saldo. Saídas e devoluções geram movimentações; ajuste de saldo exige motivo e responsável, sem edição destrutiva de eventos já registrados.

Cada material tem configuração simples **exige retorno de sobra: sim/não**. A regra é definida por item: itens de maior quantidade podem exigir devolução; materiais pequenos podem ser consumidos no serviço sem retorno. Devoluções de materiais controlados retornam à quantidade disponível.

### Solicitações e entrega direta

O técnico pode solicitar materiais pelo celular, sempre escolhendo uma obra ou serviço a que tenha acesso. A Logística pode também iniciar a entrega sem pedido prévio. Em ambos os casos, a saída exige selecionar a obra/serviço e um técnico responsável pelo recebimento; se o material vai para a equipe, esse técnico responde pelo recibo da entrega.

O Gestor registra as quantidades entregues. A baixa ocorre no momento da entrega física; a ficha fica “aguardando assinatura” até o responsável assinar digitalmente. O recibo inclui material, quantidade, unidade, obra/serviço, técnico responsável, quem entregou, data/hora e observações. Uma entrega pode conter vários materiais. O responsável deve poder reportar divergência antes de assinar; divergência fica pendente de revisão e correção pela Logística.

O sistema permite entrega parcial conforme o saldo disponível e mantém o restante da solicitação pendente. Saldo no mínimo ou abaixo dele aciona alerta no Resumo e na lista de Materiais. Não se presume compra automática, fornecedor ou integração de nota fiscal.

## Solicitações e visão do técnico

No móvel, incluir uma área operacional simples **Meu kit** com ferramentas padrão e extras, estado de cada item, itens em falta e recibos aguardando assinatura. Permitir relatar falta/avaria e solicitar materiais, vinculando o pedido a obra/serviço atribuído. O técnico não altera inventário, saldos, composição do kit nem decide a baixa ou retorno de ferramentas.

Solicitações de material ficam com estados simples: solicitada, parcial/separada, entregue (aguardando assinatura), concluída ou cancelada com motivo. O Gestor confere saldo e separa a quantidade; ausência de saldo não deve criar saldo negativo.

## Histórico e relatórios

Movimentações devem registrar ator, data/hora, origem/destino, item e quantidade quando aplicável, técnico, obra/serviço quando aplicável, estado anterior/novo, motivo e referência ao recibo ou ocorrência. Manter histórico mesmo após baixa definitiva. Exibir:

- ficha e histórico completo de cada ferramenta;
- kit e pendências por técnico;
- entregas e recibos por período, técnico e obra/serviço;
- faltas, apurações, avarias, reparos e baixas;
- entradas, saídas, devoluções, saldo atual e itens abaixo do mínimo;
- solicitações abertas, parciais e concluídas.

Relatórios e fichas devem permitir consulta por filtro e impressão/exportação em documento. A assinatura não pode ser tratada como prova de identidade além da conta autenticada e do registro de integridade do sistema; redação do recibo deve afirmar recebimento e responsabilidade operacional, sem criar cláusulas legais não solicitadas.

## Exceções e integridade

- Não permitir entregar uma ferramenta que não esteja disponível.
- Uma unidade de ferramenta só pode estar atribuída a um técnico por vez.
- Não permitir saldo de material negativo; registrar entrega parcial ou manter pedido pendente.
- Devolução parcial não libera itens que continuam com o técnico.
- Ficha pendente de assinatura não libera o item nem desfaz baixa física já realizada.
- Conflitos de sincronização offline não podem duplicar entrega, assinatura, baixa, devolução nem saldo; reconciliar com o padrão de operações assíncronas do app.
- Validar perfil e vínculo no servidor para cada consulta e mutação, inclusive endpoints diretos e sincronização.
- A assinatura digital será feita pelo técnico na própria sessão; não permitir que o gestor assine em nome dele.

## Decisões deixadas ao implementador

- Reutilizar os modelos de dados, eventos de auditoria, componentes de assinatura e componentes móveis existentes quando forem apropriados; confirmar estrutura e endpoints no código antes de escolher tabelas ou rotas.
- Definir identificador interno de ferramenta, campos opcionais úteis e filtros que respeitem os padrões existentes.
- Definir como a lista inicial do kit padrão é carregada; a primeira versão permite configuração pelo Gestor e cadastro individual de itens, sem exigir importador de planilhas.
- Definir política de retenção dos traços da assinatura e armazenamento seguro conforme o padrão já existente.
- Preservar compatibilidade com contas existentes, modo offline e sincronização.

## Aprovação

Este documento descreve o escopo acordado para revisão. Nenhum código de produto deve ser implementado até aprovação explícita deste desenho.
