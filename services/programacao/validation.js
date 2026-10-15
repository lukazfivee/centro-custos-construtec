const { httpError, positiveId } = require('../../lib/http');
const { validDate } = require('../../lib/dates');

function day(value) {
  if (typeof value !== 'string' || !validDate(value)) throw httpError(400, 'Informe uma data válida (AAAA-MM-DD).');
  return value;
}
function text(value, max, required = false) {
  if (typeof value !== 'string' && value != null) throw httpError(400, 'Informe um texto válido.');
  const out = (value || '').trim();
  if (out.length > max || required && !out) throw httpError(400, `Informe um texto${required ? ' obrigatório' : ''} com até ${max} caracteres.`);
  return out;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw httpError(400, 'Informe a revisão atual.');
  return value;
}
function fields(body) {
  const ids = body.tecnicos;
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw httpError(400, 'Escolha pelo menos um técnico válido.');
  }
  const ordem = body.ordem ?? 0;
  if (!Number.isSafeInteger(ordem) || ordem < 0 || ordem > 1000000) throw httpError(400, 'Ordem inválida.');
  return { dia: day(body.dia), orientacao: text(body.orientacao, 5000, true), tecnicos: [...new Set(ids)].sort((a, b) => a - b), ordem };
}
function progress(body) {
  if (!['pendente', 'em_andamento', 'pausado', 'concluido'].includes(body.estado)) throw httpError(400, 'Andamento inválido.');
  if (typeof body.clientId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clientId)) {
    throw httpError(400, 'Identificador da atualização inválido.');
  }
  return { estado: body.estado, observacao: text(body.observacao, 5000), revision: revision(body.revision), clientId: body.clientId.toLowerCase() };
}
module.exports = { day, text, revision, fields, progress, positiveId };
