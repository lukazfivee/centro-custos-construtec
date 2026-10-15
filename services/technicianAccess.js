const { suiteRoleOf } = require('./permissions');

// Novas APIs ficam fechadas ao técnico até serem revisadas como operacionais.
const READ = [
  /^\/api\/centros-custo(?:\/\d+\/detalhes)?$/i,
  /^\/api\/servicos(?:\/\d+(?:\/(?:pendencias|relatorio|fotos(?:\/\d+\/arquivo)?|aceite\/assinatura))?)?$/i,
  /^\/api\/auth\/(?:me|foto-perfil)$/i,
  /^\/api\/perfil$/i,
  /^\/api\/bug-reports(?:\/(?:delivery\/status|\d+(?:\/anexo)?))?$/i,
];
const WRITE = {
  POST: [/^\/api\/servicos\/\d+\/(?:concluir|checklist|fotos)$/i, /^\/api\/auth\/(?:foto-perfil|alterar-senha)$/i, /^\/api\/perfil\/foto$/i, /^\/api\/bug-reports(?:\/\d+\/retry)?$/i],
  PUT: [/^\/api\/servicos\/\d+\/(?:situacao|observacoes|checklist|aceite)$/i, /^\/api\/perfil$/i],
  PATCH: [/^\/api\/servicos\/\d+\/checklist\/[0-9a-f-]+$/i],
  DELETE: [/^\/api\/servicos\/\d+\/(?:fotos\/\d+|aceite)$/i, /^\/api\/auth\/foto-perfil$/i, /^\/api\/perfil\/foto$/i],
};

function technicianRequestAllowed(req) {
  if (suiteRoleOf(req.usuario) !== 'tecnico') return true;
  let path;
  try { path = decodeURIComponent((req.originalUrl || '').split('?')[0]).replace(/\/+$/, ''); }
  catch { return false; }
  const rules = ['GET', 'HEAD'].includes(req.method) ? READ : WRITE[req.method] || [];
  return rules.some((rule) => rule.test(path));
}

module.exports = { technicianRequestAllowed };
