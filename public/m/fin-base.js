// Cadastros e financeiro no celular (Cobrancas, Recorrentes, Fornecedores, Categorias): pecas comuns.
// Permissoes reais vem de /auth/me (CC.sv.loadPerms); o servidor confere tudo de novo.
(function (CC) {
  const { esc, icon } = CC;
  const F = CC.fin = CC.fin || {};

  F.can = (p) => (CC.sv ? CC.sv.can(p) : false);
  F.perms = () => (CC.sv ? CC.sv.loadPerms() : Promise.resolve());
  // Mesma regra do desktop (D.pode('cobrancas')): conta @rcconstrutec.com.br e permissao p6.
  F.corporativo = () => /@rcconstrutec\.com\.br$/i.test(String((CC.session.user() || {}).email || ''));
  F.podeCobrancas = () => F.corporativo() && F.can('p6');
  F.podeCadastrar = () => F.can('p5');
  F.plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  F.valorBr = (n) => (Number(n) ? Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  F.mesCurto = (mes) => new Date(`${mes}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' });

  // Barra do topo com Voltar; extra = botao a direita (ex.: tres pontos).
  F.top = (titulo, sub, extra) => `<div class="top"><button class="back" type="button" id="voltar" aria-label="Voltar">${icon('caret-left', 20)}</button>
    <span class="grow"><h1>${esc(titulo)}</h1>${sub ? `<small class="muted">${esc(sub)}</small>` : ''}</span>${extra || ''}</div>`;
  F.voltar = (el, fn) => { const b = CC.$('#voltar', el); if (b) b.addEventListener('click', fn); };
  F.carregando = (titulo, sub, voltar) => { const el = CC.render(`${F.top(titulo, sub)}<div class="skeleton"></div><div class="skeleton"></div>`, true); F.voltar(el, voltar); return el; };
  // Erro do formulario em tela cheia (paragrafo .alert com id="err").
  F.erro = (page, error) => {
    const slot = CC.$('#err', page);
    if (!slot) return;
    const msg = typeof error === 'string' ? error : (error && error.status === 0 ? 'Sem internet. Esta ação precisa da conexão.' : (error && error.message) || 'Não foi possível concluir agora.');
    slot.innerHTML = msg ? `${icon('warning-circle', 16)}<span>${esc(msg)}</span>` : '';
    if (msg) slot.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  F.solta = (b, ic, rotulo) => { b.disabled = false; b.innerHTML = `${icon(ic, 18)}${esc(rotulo)}`; };
  F.campo = (rot, id, valor, extra) => `<label class="field"><span>${esc(rot)}</span><input id="${id}" value="${esc(valor == null ? '' : valor)}"${extra || ''}></label>`;
  F.troca = (id, titulo, sub, ligado) => `<label class="menu-item pref"><span>${esc(titulo)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><input type="checkbox" id="${id}"${ligado ? ' checked' : ''}></label>`;

  // Busca que filtra na hora (lista ja carregada). fn(texto) repinta so a lista.
  F.busca = (id, valor, ph) => `<label class="field busca"><span class="sr">Buscar</span>${icon('magnifying-glass', 18)}<input id="${id}" type="search" enterkeyhint="search" autocomplete="off" value="${esc(valor)}" placeholder="${esc(ph)}"></label>`;
  F.ligarBusca = (page, id, fn) => {
    const input = CC.$(`#${id}`, page);
    let t = 0;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => fn(input.value), 150); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  };

  // CSV: compartilha o arquivo quando o celular deixa; se nao, baixa.
  F.compartilharCsv = async (texto, nome) => {
    const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
    try {
      const file = new File([blob], nome, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: nome }); return; }
    } catch (error) { if (error && error.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    CC.toast(`${nome} baixado`, 'download-simple');
  };
  F.csvDaApi = async (path, nome) => {
    let r;
    try { r = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${CC.session.token()}` }, cache: 'no-store' }); } catch { throw new CC.ApiError(0, 'Sem internet.'); }
    if (!r.ok) throw new CC.ApiError(r.status, 'Não foi possível gerar o CSV agora.');
    return F.compartilharCsv(await r.text(), nome);
  };

  // Itens do Menu (secao "Cadastros e financeiro"), cada um so para quem tem a permissao.
  F.menu = async (slot) => {
    if (!slot) return;
    await F.perms();
    if (!document.body.contains(slot)) return;
    const item = (id, ic, t, s) => `<button class="menu-item" type="button" data-fin="${id}">${icon(ic, 22)}<span>${esc(t)}<small>${esc(s)}</small></span></button>`;
    const itens = [
      F.podeCobrancas() ? item('cobrancas', 'envelope-simple', 'Cobranças', 'Acompanhamento, NF e e-mail ao cliente') : '',
      F.podeCadastrar() ? item('recorrentes', 'arrow-clockwise', 'Recorrentes', 'Modelos que viram lançamentos todo mês') : '',
      item('fornecedores', 'hard-hat', 'Fornecedores', 'Cadastro e gasto do mês'),
      item('categorias', 'funnel', 'Categorias', 'Tipos de receita e despesa'),
    ].join('');
    slot.innerHTML = `<span class="label fin-sec">Cadastros e financeiro</span>${itens}`;
    CC.$$('[data-fin]', slot).forEach((b) => b.addEventListener('click', () => CC.go(b.dataset.fin)));
  };
})(window.CC = window.CC || {});
