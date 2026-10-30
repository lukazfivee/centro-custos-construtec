'use strict';
const { normalizeCenterName } = require('./names');
const { parseBrl } = require('./money');
function clean(s) {
  return String(s || '').replace(/\*/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
}
function sourceRows(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/\*/g, '').trim());
  const rows = [];
  let group = null, heading = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (/\bPAGAMENTO\b/i.test(line)) heading = clean(line);
    const total = line.match(/^R\$\s*([\d.]+\s*,\s*\d{2})$/i);
    if (total) { group = { id:i, total:parseBrl(total[1]), rows:[] }; continue; }
    const a = line.match(/^R\$\s*([\d.]+\s*,\s*\d{2})\s*[-–—]\s*(.+)$/i);
    if (a) {
      group = null;
      const next = (lines[i + 1] || '').match(/^CENTRO\s+DE\s+CUSTO\s*:\s*(.+)$/i);
      rows.push({index:i, value:a[1], description:a[2], center:next ? next[1] : '', heading});
      continue;
    }
    const b = line.match(/^(.+?)\s*[-–—]\s*(.+?)\s*[-–—]\s*R\$\s*([\d.]+\s*,\s*\d{2})$/i);
    if (b) {
      const row = {index:i, value:b[3], description:b[2], center:b[1], group, heading};
      rows.push(row);
      if (group) group.rows.push(row);
      continue;
    }
    group = null;
  }
  return rows;
}
function matchSource(rows, item) {
  if (!item || !item.valor_texto || !item.descricao || !item.centro) return null;
  const value = clean(item.valor_texto).replace(/^R\$\s*/, '');
  const description = clean(item.descricao);
  const center = normalizeCenterName(item.centro).nomeExibicao;
  const found = rows.filter(row => clean(row.value) === value && clean(row.description) === description && normalizeCenterName(row.center).nomeExibicao === center);
  return found.length === 1 ? found[0] : null;
}
function unparsedAmountLines(text) {
  const rows = sourceRows(text);
  const covered = new Set(rows.flatMap(row => row.group ? [row.index, row.group.id] : [row.index]));
  return text.split(/\r?\n/).flatMap((line, index) => /R\$\s*\d/i.test(line) && !covered.has(index) ? [index + 1] : []);
}
function verifySource(text, item) { return typeof text === 'string' && Boolean(matchSource(sourceRows(text), item)); }
module.exports = { verifySource, sourceRows, matchSource, unparsedAmountLines };
