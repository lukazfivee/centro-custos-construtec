'use strict';
const { parseBrl } = require('./money');
const { sourceRows, matchSource, matchCandidate } = require('./source');

function checkItems(text, items) {
  if (typeof text !== 'string' || !Array.isArray(items)) throw new TypeError('Texto ou itens inválidos');
  const rows = sourceRows(text);
  const checked = items.map((item) => {
    const cents = parseBrl(item.valor_texto);
    const source = matchSource(rows, item);
    let motivo = null;
    if (cents === null || cents <= 0) motivo = 'Valor inválido';
    else if (!String(item.centro || '').trim()) motivo = 'Centro de custo ausente';
    else if (!source) motivo = 'Item não corresponde a um trecho inequívoco da mensagem';
    else if (item.fornecedor && !source.heading.includes(String(item.fornecedor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim())) motivo = 'Fornecedor não encontrado no cabeçalho do bloco';
    else if (source.group === null) motivo = 'Total do bloco ausente';
    const candidate = source || matchCandidate(rows, item);
    return { ...item, centavos:cents, ok:!motivo, motivo, source, candidate };
  });
  for (const entry of checked) {
    if (!entry.source) continue;
    if (checked.filter(other => other.source?.index === entry.source.index).length !== 1) {
      entry.ok = false; entry.motivo = 'Linha repetida na extração';
    }
    const group = entry.source.group;
    if (!group) continue;
    const sum = group.rows.reduce((n, row) => n + (parseBrl(row.value) || 0), 0);
    const extracted = checked.filter(other => other.source?.group === group);
    if (!Number.isSafeInteger(sum) || sum !== group.total || group.total <= 0 || extracted.length !== group.rows.length ||
        extracted.some(other => !other.ok || parseBrl(other.total_bloco_texto) !== group.total)) {
      for (const other of extracted) { other.ok = false; other.motivo = 'Bloco incompleto ou soma divergente'; }
    }
  }
  return checked.map(({source, candidate, ...entry}) => ({ ...entry, sourceIndex:candidate?.index ?? null }));
}
module.exports = { checkItems };

