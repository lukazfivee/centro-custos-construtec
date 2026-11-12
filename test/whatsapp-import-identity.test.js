const { test } = require('node:test');
const assert = require('node:assert/strict');
const { messageHash, lineClientId } = require('../lib/whatsappImport/identity');
test('gera identificadores estáveis e distintos por posição', () => {
  const hash = messageHash('mensagem');
  const id = lineClientId(hash, 1, 2);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(id, lineClientId(hash, 1, 2));
  assert.notEqual(id, lineClientId(hash, 1, 3));
  assert.notEqual(id, lineClientId(messageHash('outra'), 1, 2));
});
