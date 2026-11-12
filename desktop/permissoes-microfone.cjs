// Microfone do ditado (assistente de IA) nas telas da Suíte do Windows.
// Só o áudio é liberado (câmera e tela, nunca) e só para a página do próprio app: o Centro (servidor local),
// o Orçamentos (arquivos do pacote) e o Chamados (origem configurada). Qualquer outra página fica sem microfone.
const path = require('path');
const { pathToFileURL } = require('url');

// Endereços do próprio app: `origens` comparadas pela origem exata (http/https); `pastas` são pastas locais
// cujos arquivos (file://) contam como do app.
function paginaPropria(url, { origens = [], pastas = [] } = {}) {
  let alvo;
  try { alvo = new URL(String(url || '')); } catch { return false; }
  if (alvo.protocol === 'http:' || alvo.protocol === 'https:') return origens.filter(Boolean).includes(alvo.origin);
  if (alvo.protocol !== 'file:') return false;
  const arquivo = decodeURIComponent(alvo.pathname).toLowerCase();
  return pastas.filter(Boolean).some((pasta) => {
    const base = decodeURIComponent(pathToFileURL(path.resolve(pasta) + path.sep).pathname).toLowerCase();
    return arquivo.startsWith(base);
  });
}

// `opcoes`: { origens: () => [...], pastas: () => [...], demais: boolean } — `demais` decide as outras permissões
// (true mantém o padrão do Electron, que libera; false nega tudo o que não for o microfone).
function politicaMicrofone({ origens = () => [], pastas = () => [], demais = false } = {}) {
  const propria = (url) => paginaPropria(url, { origens: origens(), pastas: pastas() });
  const pedido = (_contents, permissao, responder, detalhes) => {
    detalhes = detalhes || {};
    if (permissao !== 'media') return responder(demais === true);
    const tipos = Array.isArray(detalhes.mediaTypes) ? detalhes.mediaTypes : [];
    return responder(tipos.length > 0 && tipos.every((t) => t === 'audio') && propria(detalhes.requestingUrl));
  };
  const checagem = (_contents, permissao, origem, detalhes) => {
    detalhes = detalhes || {};
    const url = detalhes.requestingUrl || detalhes.securityOrigin || origem;
    if (permissao === 'audioCapture') return propria(url);
    if (permissao === 'media') return detalhes.mediaType === 'audio' && propria(url);
    return demais === true;
  };
  return { pedido, checagem };
}

function instalarMicrofone(sessao, opcoes) {
  const { pedido, checagem } = politicaMicrofone(opcoes);
  sessao.setPermissionRequestHandler(pedido);
  sessao.setPermissionCheckHandler(checagem);
}

module.exports = { paginaPropria, politicaMicrofone, instalarMicrofone };
