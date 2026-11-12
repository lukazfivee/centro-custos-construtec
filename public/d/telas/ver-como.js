// Dev: "ver como" de verdade (outra conta, 30 min, registrado). Guarda a sessao do dev para voltar
// com um clique; se a sessao do outro acabar sozinha, o app devolve o dev em vez de pedir login.
(function (CC) {
  const D = CC.d;
  const CHAVE = 'cc_dev_volta';
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; } };

  const V = D.verComo = {
    // So vale com a volta guardada E a sessao atual marcada pelo servidor; resto antigo nao mostra faixa.
    ativo: () => Boolean(ler()) && Boolean((CC.session.user() || {}).verComo),
    descartar: () => localStorage.removeItem(CHAVE),

    async abrir(email) {
      const volta = { token: CC.session.token(), usuario: CC.session.user(), instancia: JSON.parse(localStorage.getItem('cc_instancia') || 'null'), devEmail: (CC.session.user() || {}).email };
      const { data } = await CC.api('/dev/ver-como', { method: 'POST', body: { email } });
      localStorage.setItem(CHAVE, JSON.stringify(volta));
      CC.session.save(data);
      localStorage.setItem('cc_usuario', JSON.stringify({ ...data.usuario, verComo: data.verComo }));
      location.hash = '#/inicio';
      location.reload();
    },

    // Devolve a sessao do dev (sem chamar a rede). Falso quando nao ha o que restaurar.
    restaurar() {
      const volta = ler();
      localStorage.removeItem(CHAVE);
      if (!volta || !volta.token) return false;
      CC.session.save(volta);
      return true;
    },

    async voltar() {
      try { await CC.api('/dev/ver-como/fim', { method: 'POST', body: {} }); } catch { /* a sessao do outro cai sozinha em 30 min */ }
      V.restaurar();
      location.hash = '#/config/dev';
      location.reload();
    },

    faixa() {
      if (!V.ativo()) return '';
      const u = CC.session.user() || {};
      return `<div class="como-faixa" role="status">${D.ic('eye')}<span>Você está na conta de <b>${CC.esc(u.nome || u.email || '')}</b> (ver como, até 30 minutos, tudo fica registrado). Tudo o que você fizer vale como essa pessoa.</span><button type="button" class="btn btn-s" data-voltar-dev>Voltar para mim</button></div>`;
    },
  };
})(window.CC);
