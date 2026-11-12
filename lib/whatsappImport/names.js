'use strict';
function normalizeCenterName(text) {
  const nomeExibicao = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  return { chave: nomeExibicao.replace(/_[A-Z0-9]+$/, '').trim(), nomeExibicao };
}
module.exports = { normalizeCenterName };
