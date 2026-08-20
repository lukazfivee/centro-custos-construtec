# Pacote final P5–P8

## P5 — produtividade

- ações em massa para categoria, centro de custo, forma de pagamento e liquidação;
- visões de filtros salvas por usuário;
- sugestões locais de categoria/centro com base no histórico de fornecedor e descrição;
- suporte de API para rateio de um lançamento entre até 20 centros;
- modelos recorrentes/parcelados existentes preservados e compatíveis com o lote final.

## P6 — contas e conciliação

- cadastro de contas bancárias/caixas;
- importação idempotente de extrato CSV;
- perfil de origem para Cora CSV;
- fila de movimentos não conciliados;
- sugestão de lançamento por valor, data, tipo e favorecido;
- conciliação que liquida o lançamento pendente;
- proteção contra dupla importação pelo hash do movimento.

## P7 — gestão e inteligência local

- Central de Atenção;
- vencidos, vencimentos em 7 e 30 dias;
- despesas sem comprovante;
- candidatos a duplicidade;
- fluxo de caixa projetado em 7/15/30/60/90 dias;
- Curva ABC das despesas dos últimos 12 meses;
- comprometimento por obra;
- histórico versionado de revisões de orçamento;
- avaliações de fornecedor por preço, prazo, qualidade e documentação.

## P8 — operação e segurança

- backup automático local diário;
- hora configurável;
- retenção de 3 a 365 cópias;
- checksum SHA-256 ao lado de cada backup;
- auditoria de backup automático;
- encerramento do agendador junto com o servidor.

## Interface de teste

A versão `teste-chatgpt.html` carrega P1, P2, P3, P4 e o pacote final. Um botão flutuante **Central inteligente** abre quatro áreas: Inteligência, Produtividade, Bancos / PIX e Backup.

## Limites atuais

- o importador bancário é baseado em CSV e não usa API bancária externa;
- os rateios ficam registrados e auditáveis, mas relatórios legados ainda usam o centro principal do lançamento;
- a inteligência é estatística/local, sem envio de dados a serviço de IA externo;
- permissões por obra e workflow de aprovação multinível ficaram preparados conceitualmente, mas não foram ativados para evitar mudança brusca no modelo atual de usuários.
