// Grupo Vidro: prints dos overlays (cortina com desfoque, paineis translucidos) nos dois temas.
module.exports = (t) => {
  t('Vidro', 'painel-lateral', { rota: 'lancamentos', async preparar(c) { await c.tocar('[data-novo]'); await c.painel(); } });
  t('Vidro', 'dialogo-sair-sem-salvar', { rota: 'lancamentos', async preparar(c) {
    await c.tocar('[data-novo]'); await c.painel();
    await c.digitar('.drawer [name="descricao"]', 'Rascunho');
    await c.tecla('Escape'); await c.dialogo();
  } });
  t('Vidro', 'busca-ctrl-k', { rota: 'inicio', async preparar(c) {
    await c.tocar('.busca input'); await c.digitar('.busca input', 'cimento'); await c.dormir(1500);
  } });
  t('Vidro', 'menu-suite', { rota: 'inicio', async preparar(c) { await c.tocar('.suite > button'); await c.dormir(500); } });
  t('Vidro', 'toast', { rota: 'inicio', async preparar(c) { await c.dormir(1500); await c.avaliar("CC.toast('Lançamento salvo com sucesso', 'check-circle')"); await c.dormir(500); } });
};
