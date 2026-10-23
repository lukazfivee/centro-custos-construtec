CREATE TABLE logistica_materiais (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL CHECK(length(trim(nome)) BETWEEN 1 AND 120),
  unidade TEXT NOT NULL CHECK(length(trim(unidade)) BETWEEN 1 AND 24),
  saldo NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(saldo >= 0),
  estoque_minimo NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(estoque_minimo >= 0),
  exige_retorno BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por INTEGER REFERENCES users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX logistica_materiais_nome_unico ON logistica_materiais(LOWER(nome));

CREATE TABLE logistica_movimentos_materiais (
  id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES logistica_materiais(id),
  recibo_id INTEGER REFERENCES logistica_recibos(id),
  tipo TEXT NOT NULL CHECK(tipo IN ('entrada','entrega','devolucao','ajuste')),
  quantidade NUMERIC(14,3) NOT NULL CHECK(quantidade > 0),
  motivo TEXT NOT NULL,
  client_id TEXT UNIQUE,
  ator_id INTEGER REFERENCES users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX logistica_movimentos_material_idx ON logistica_movimentos_materiais(material_id,criado_em DESC);

CREATE TABLE logistica_recibo_materiais (
  recibo_id INTEGER NOT NULL REFERENCES logistica_recibos(id),
  material_id INTEGER NOT NULL REFERENCES logistica_materiais(id),
  quantidade NUMERIC(14,3) NOT NULL CHECK(quantidade > 0),
  PRIMARY KEY(recibo_id,material_id)
);

CREATE TABLE logistica_solicitacoes_materiais (
  id SERIAL PRIMARY KEY,
  tecnico_id INTEGER NOT NULL REFERENCES users(id),
  centro_id INTEGER NOT NULL REFERENCES cost_centers(id),
  material_id INTEGER NOT NULL REFERENCES logistica_materiais(id),
  solicitada NUMERIC(14,3) NOT NULL CHECK(solicitada > 0),
  entregue NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK(entregue >= 0 AND entregue <= solicitada),
  status TEXT NOT NULL DEFAULT 'solicitada' CHECK(status IN ('solicitada','parcial','aguardando_assinatura','concluida','cancelada')),
  recibo_id INTEGER REFERENCES logistica_recibos(id),
  observacao TEXT NOT NULL DEFAULT '',
  client_id TEXT NOT NULL UNIQUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX logistica_solicitacoes_abertas_idx ON logistica_solicitacoes_materiais(status,criado_em) WHERE status IN ('solicitada','parcial');
