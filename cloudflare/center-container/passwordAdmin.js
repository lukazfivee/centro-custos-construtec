// Troca de senha pelo papel dev: qualquer conta abaixo dele (inclusive admin), nunca a de outro dev.
import { json, text, validEmail, requireSession, makePasswordRecord } from './centralAuth.js';
import { effectiveSuiteRole } from './suiteRoles.js';
import { devAudit } from './devTools.js';

export async function handleUserPassword(request, env) {
  const auth = await requireSession(request, env);
  if (auth.error) return json({ ok: false, error: auth.error }, auth.status);
  if (effectiveSuiteRole(auth.user) !== 'dev') return json({ ok: false, error: 'Somente um dev pode trocar a senha de outro usuario.' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'JSON invalido.' }, 400); }
  const email = text(body?.email).toLowerCase();
  const password = String(body?.password || '');
  if (!validEmail(email)) return json({ ok: false, error: 'E-mail invalido.' }, 400);
  if (password.length < 10) return json({ ok: false, error: 'A nova senha precisa ter pelo menos 10 caracteres.' }, 400);
  const target = await env.DB.prepare('SELECT id,role,suite_role FROM cloud_users WHERE org_id=? AND email=? AND deleted_at IS NULL')
    .bind(auth.user.org_id, email).first();
  const expectedId = text(body?.id);
  if (!target || (expectedId && target.id !== expectedId)) return json({ ok: false, error: 'Usuario nao encontrado.' }, 404);
  if (target.id === auth.user.id) return json({ ok: false, error: 'Para a sua propria senha use a troca de senha do perfil.' }, 400);
  if (effectiveSuiteRole(target) === 'dev') return json({ ok: false, error: 'A senha de outro dev nao pode ser trocada por aqui.' }, 403);
  const record = await makePasswordRecord(password);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE cloud_users SET password_salt=?,password_hash=?,password_iterations=?,updated_at=? WHERE id=?')
      .bind(record.salt, record.hash, record.iterations, now, target.id),
    env.DB.prepare('DELETE FROM cloud_sessions WHERE user_id=?').bind(target.id),
  ]);
  await devAudit(env, auth.user, 'senha_trocada', { id: target.id, email }, null);
  return json({ ok: true });
}
