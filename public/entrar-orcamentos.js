// Entrada do Orcamentos pela sessao do Centro, no navegador. O Orcamentos sem sessao manda para ca uma vez por aba;
// com a conta corporativa logada aqui, volta com um codigo de uso unico (#handoff=, vale 60 s e so para o Orcamentos);
// sem sessao, conta local, sem rede ou demora, volta com #centro=0 e la vale o login de sempre. O destino e fixo.
(function () {
  const ORCAMENTOS = 'https://construtec-orcamentos-cloud.construtec-reports.workers.dev/';
  const proposta = new URLSearchParams(location.hash.slice(1)).get('proposta');
  const junto = proposta && /^[A-Za-z0-9-]{1,64}$/.test(proposta) ? `&proposta=${proposta}` : '';
  const voltar = (trecho) => location.replace(`${ORCAMENTOS}#${trecho}${junto}`);

  let token = '';
  try { token = localStorage.getItem('cc_token') || ''; } catch { /* sem armazenamento: sem sessao */ }
  if (!token) return voltar('centro=0');

  const espera = new AbortController();
  setTimeout(() => espera.abort(), 10000);
  fetch('/api/auth/suite-handoff', {
    method: 'POST',
    cache: 'no-store',
    signal: espera.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ target: 'orcamentos' }),
  })
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => voltar(/^[A-Za-z0-9_-]{43}$/.test(String(dados.code || '')) ? `handoff=${dados.code}` : 'centro=0'))
    .catch(() => voltar('centro=0'));
  return undefined;
})();
