# Programação diária com acompanhamento individual

## Objetivo e decisões do usuário

Substituir a distribuição diária por mensagens por uma programação no app. O escritório prepara a lista na noite anterior ou pela manhã, escolhe a data, o destino, os técnicos e a orientação do dia. Uma equipe pode ter vários técnicos e uma pessoa pode ir a vários destinos no mesmo dia. Obras e serviços são independentes; serviço é a alternativa mais simples à obra, sem relação de pai e filho.

Cada técnico registra seu próprio andamento. Colegas da mesma atividade podem acompanhar as atualizações uns dos outros; o escritório acompanha todas as equipes. Iniciar, pausar, retomar ou concluir uma atividade diária nunca altera automaticamente a situação da obra ou do serviço inteiro.

## Fluxo proposto

O escritório terá Programação por data, no desktop e no celular. Admin/gestor (p5, como na designação atual) criam uma atividade escolhendo uma obra OU um serviço, vários técnicos e uma orientação. Uma ordem simples organiza os destinos; não será exigido horário. A lista deve deixar claros o tipo do destino e a equipe selecionada. O atalho “Técnicos ainda sem programação” seleciona nomes explícitos para conferência, sem guardar uma categoria dinâmica de “demais”.

O técnico terá Meu dia, inicialmente em hoje, podendo consultar outras datas. Cada atividade mostra destino, orientação, colegas, seu andamento e acesso à execução existente do destino. “Minhas obras e serviços” continua acessível, separado da programação do dia. A data inicial do serviço não será usada como agenda diária.

Andamentos individuais: A fazer, Em execução, Pausado e Concluído. O técnico altera apenas o próprio registro. Ao pausar, pode anotar onde parou/o que falta; ao retomar, a anotação e os eventos anteriores permanecem. Uma correção do próprio andamento pode reabrir sua atividade, sem reabrir a obra/serviço. A equipe mostra contagem de participantes concluídos, sem converter o estado individual em uma conclusão coletiva automática.

A atividade terá uma linha do tempo com nome, dia/hora, andamento e observação de cada atualização. Todos os integrantes ativos da atividade veem essa linha do tempo. Técnicos que estejam na mesma obra, mas não naquela atividade, não recebem acesso às atualizações dessa equipe. O escritório vê o conjunto. Não haverá alteração de andamento em nome de outro técnico.

Pendências podem ser copiadas pelo escritório para outra data, com link para a atividade de origem. O novo dia começa com andamentos individuais A fazer. O dia anterior e suas atualizações não são movidos, apagados ou sobrescritos.

## Regras confirmadas e decisões de implementação

- Confirmado pelo usuário: o acesso concedido pela programação permanece até o escritório retirar o técnico. Programar um técnico também cria o vínculo explícito já usado em user_cost_centers; não será necessário designá-lo duas vezes. Remover da programação não desfaz esse vínculo. Retirar o vínculo no detalhe do destino bloqueia novas leituras/escritas também nas atividades desse destino, seguindo a regra já existente de acesso somente ao que está atribuído. O escritório preserva o histórico para consulta.
- Salvar disponibiliza a atividade aos técnicos escolhidos, como o envio da lista atual. Não haverá uma etapa extra de rascunho/publicação nesta entrega. Um dia pode receber novas atividades depois.
- Horários, ponto eletrônico, GPS, mensagens externas e push ficam fora desta entrega. As atualizações usam a infraestrutura existente de cache/fila offline, com indicação de pendência de envio.
- Observações de andamento são texto. Checklist, fotos e aceite dos serviços continuam em sua execução existente; não será criado um novo sistema de fotos/checklist de obra nesta entrega.
- Datas são datas civis de Brasília, sem deslocamento por UTC. Programações futuras podem ser consultadas após salvar; atualização de andamento exige data de hoje ou anterior.

## Permissões, histórico e concorrência

APIs novas devem entrar explicitamente na allowlist operacional do técnico. Leitura exige participante ativo e vínculo atual ao destino; escrita de andamento usa o usuário da sessão, nunca um id fornecido pelo cliente. Admin/gestor usam p5 para a programação global. Respostas do técnico contêm somente identificação e execução, sem dados financeiros nem diretório global de técnicos.

Os registros de andamento são individuais, com eventos anexados ao histórico e autoria/data do servidor. Operações offline têm identificador idempotente para não duplicar eventos. Alterações concorrentes do próprio andamento ou da programação usam revisão esperada; conflitos preservam o texto local para revisão. O andamento de um colega não deve causar conflito indevido no registro de outro.

Depois de haver atualizações, cancelamento/substituição de equipe preservam o histórico e removem somente a participação ativa. Alteração de instrução fica registrada e não apaga o texto anterior do histórico. Não haverá exclusão destrutiva de atividade executada. O escritório pode cancelar uma atividade salva, mantendo a autoria e o motivo. A mudança só aparece aos aparelhos offline quando eles reconectarem; dados já vistos não podem ser revogados remotamente de um aparelho desconectado.

## Integração e limites

O app Windows usa uma base local. Para contas corporativas, a entrada da programação abre a agenda na nuvem no navegador externo com o handoff nativo de uso único, mantendo os mesmos usuários, destinos e registros vistos pelos celulares. O Centro permanece na origem local para preservar a entrada do módulo Orçamentos. As APIs de programação recusam operações locais dessas contas, evitando uma agenda isolada ou mistura de identificadores. Contas exclusivamente locais podem usar sua programação local. Falha da autenticação central preserva a mensagem de erro, sem criar uma programação paralela.

Reutilizar Node/Express, PostgreSQL/PGlite, JavaScript/CSS, sessão, autorização, auditoria e fila existentes; sem dependências novas. Uma migração aditiva separa atividade diária, participantes e eventos, sem alterar valores ou contratos. Cadastro de técnicos e atribuição direta existentes permanecem funcionando. Cliente e API devem falhar de forma segura em sessão trocada, acesso revogado e destino fora do escopo.

Manter MAX_LINES<=350 nos arquivos criados, português claro, acessibilidade e SVG sem emojis. Testar múltiplos destinos/equipes, progresso separado, visibilidade compartilhada somente entre participantes, disponibilização ao salvar, reagendamento sem perda, fuso, concorrência, repetição offline, revogação, ausência de dados financeiros e regressões das atribuições existentes. Validar o fluxo mobile e desktop com testes de navegador, suíte completa e revisão antes da publicação autorizada na Cloudflare.
