// Tabelas com movimento ligado a um centro de custo. Centro com vinculo nao pode ser excluido.
const LINKED_TABLES = [
  ['transactions', 'lançamentos'],
  ['transaction_allocations', 'rateios de lançamentos'],
  ['recurring_templates', 'recorrências'],
  ['project_contracts', 'contratos ou orçamentos'],
  ['expense_allocations', 'apropriações de despesas'],
  ['cost_recognitions', 'reconhecimentos de custos'],
  ['labor_measurements', 'medições de mão de obra'],
  ['contract_measurements', 'medições contratuais'],
  ['cost_center_invoices', 'notas fiscais vinculadas'],
  ['cost_center_invoices_ledger', 'notas fiscais'],
  ['cost_center_proposals', 'propostas'],
];

module.exports = { LINKED_TABLES };
