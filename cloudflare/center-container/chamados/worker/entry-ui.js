(function () {
  'use strict';
  const form = document.getElementById('login');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const submit = document.getElementById('submit');
  const continuation = document.getElementById('continue');
  const divider = document.getElementById('session-divider');
  const status = document.getElementById('status');
  const origin = document.querySelector('meta[name="chamados-origin"]').content;
  let busy = false;

  function validOrigin(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.origin === value && url.pathname === '/'
        && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  }
  function setBusy(value) {
    busy = value;
    submit.disabled = value;
    continuation.disabled = value;
    form.setAttribute('aria-busy', value ? 'true' : 'false');
  }
  function savedCentroToken() {
    try { return localStorage.getItem('cc_token') || ''; } catch { return ''; }
  }
  function message(response, data) {
    if (data?.challenge || data?.mfaRequired || data?.requiresMfa || data?.nextStep) {
      return 'Esta conta exige uma etapa adicional de autenticação central. Conclua essa etapa no serviço da Suíte.';
    }
    if (response.status === 429 || data?.code === 'RATE_LIMITED') return 'Muitas tentativas. Aguarde antes de tentar novamente.';
    if (response.status === 403 || data?.code === 'APP_ACCESS_DENIED' || data?.code === 'APP_NOT_ALLOWED') {
      return 'O acesso ao Chamados não está liberado para esta conta. Solicite a liberação ao responsável.';
    }
    if (data?.code === 'DIRECTORY_EMPTY') return 'A identidade central ainda não está configurada. Entre em contato com o suporte.';
    if (data?.code === 'PASSWORD_PROFILE_LEGACY') return 'Sua credencial precisa ser atualizada pelo serviço central. Use a recuperação de senha.';
    if (response.status === 401) return 'Não foi possível entrar. Confira seu e-mail e senha.';
    return 'Não foi possível confirmar a entrada agora. Tente novamente em instantes.';
  }
  async function request(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, { credentials: 'omit', redirect: 'error', ...options, signal: controller.signal });
      const data = await response.json().catch(() => null);
      return { response, data };
    } finally { clearTimeout(timer); }
  }
  function navigate(data) {
    if (data?.target !== 'chamados' || data.origin !== origin || !/^[A-Za-z0-9_-]{43}$/.test(data.code)
      || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new Error('O código de entrada expirou. Tente novamente.');
    }
    location.replace(origin + '/#handoff=' + data.code);
  }
  async function revokeUnusedSession(token) {
    if (!token) return;
    await request('/v1/auth/logout', { method: 'POST',
      headers: { authorization: 'Bearer ' + token } }).catch(() => undefined);
  }

  async function offerExistingSession() {
    const token = savedCentroToken();
    if (!token || !validOrigin(origin)) return;
    try {
      const { response, data } = await request('/api/auth/suite-chamados', {
        headers: { authorization: 'Bearer ' + token },
      });
      if (!response.ok || token !== savedCentroToken() || data?.allowed !== true
        || data.application !== 'chamados' || data.origin !== origin
        || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000)) return;
      continuation.hidden = false;
      divider.hidden = false;
    } catch { /* An unconfirmed old session never enters Chamados. */ }
  }

  continuation.addEventListener('click', async () => {
    if (busy || !validOrigin(origin)) return;
    const token = savedCentroToken();
    if (!token) { continuation.hidden = true; divider.hidden = true; return; }
    setBusy(true);
    status.textContent = '';
    try {
      const { response, data } = await request('/api/auth/suite-handoff', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ target: 'chamados' }),
      });
      if (!response.ok) throw new Error(message(response, data));
      navigate(data);
    } catch (error) {
      status.textContent = error.message || 'Não foi possível confirmar a sessão da Suíte.';
      continuation.hidden = true;
      divider.hidden = true;
    } finally { setBusy(false); }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity() || !validOrigin(origin)) return;
    setBusy(true);
    status.textContent = '';
    let sessionToken;
    let handedOff = false;
    try {
      const login = await request('/v1/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-construtec-app': 'chamados' },
        body: JSON.stringify({ email: email.value.trim(), password: password.value }),
      });
      password.value = '';
      const data = login.data;
      // An explicit challenge is never treated as a completed login, even with a token.
      if (data?.challenge || data?.mfaRequired || data?.requiresMfa || data?.nextStep
        || !login.response.ok || data?.ok !== true || !/^[A-Za-z0-9+/_-]{43}$/.test(data.sessionToken)
        || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(Date.now() / 1000)) {
        throw new Error(message(login.response, data));
      }
      sessionToken = data.sessionToken;
      const handoff = await request('/v1/auth/handoff', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + sessionToken },
        body: JSON.stringify({ target: 'chamados' }),
      });
      if (!handoff.response.ok) throw new Error(message(handoff.response, handoff.data));
      navigate(handoff.data);
      handedOff = true;
    } catch (error) {
      status.textContent = error.message || 'Não foi possível concluir a entrada.';
    } finally {
      password.value = '';
      if (!handedOff) await revokeUnusedSession(sessionToken);
      setBusy(false);
    }
  });
  void offerExistingSession();
})();
