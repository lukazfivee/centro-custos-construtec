CREATE TABLE logistica_ferramentas (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 120),
  codigo TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'disponivel' CHECK (situacao IN ('disponivel','com_tecnico','em_falta','em_avaliacao','baixada')),
  localizacao TEXT NOT NULL DEFAULT 'base',
  tecnico_id INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((situacao IN ('com_tecnico','em_falta')) = (tecnico_id IS NOT NULL))
);
CREATE UNIQUE INDEX logistica_ferramentas_codigo_unico ON logistica_ferramentas(LOWER(codigo));
CREATE INDEX logistica_ferramentas_tecnico_idx ON logistica_ferramentas(tecnico_id) WHERE tecnico_id IS NOT NULL;

CREATE TABLE logistica_kit_padrao (
  id SERIAL PRIMARY KEY,
  nome_ferramenta TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX logistica_kit_padrao_nome_unico ON logistica_kit_padrao(LOWER(nome_ferramenta));

CREATE TABLE logistica_recibos (
  id SERIAL PRIMARY KEY,
  tecnico_id INTEGER NOT NULL REFERENCES users(id),
  centro_id INTEGER REFERENCES cost_centers(id),
  tipo TEXT NOT NULL DEFAULT 'entrega_ferramenta',
  status TEXT NOT NULL DEFAULT 'aguardando_assinatura' CHECK (status IN ('aguardando_assinatura','assinado','divergencia')),
  client_id TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  criado_por INTEGER NOT NULL REFERENCES users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assinado_em TIMESTAMPTZ,
  assinatura_base64 TEXT,
  assinado_por INTEGER REFERENCES users(id),
  assinatura_client_id TEXT UNIQUE,
  divergencia TEXT,
  revisada_por INTEGER REFERENCES users(id),
  revisada_em TIMESTAMPTZ,
  CHECK ((status = 'assinado') = (assinado_em IS NOT NULL AND assinatura_base64 IS NOT NULL AND assinado_por IS NOT NULL))
);
CREATE INDEX logistica_recibos_tecnico_idx ON logistica_recibos(tecnico_id, criado_em DESC);

CREATE TABLE logistica_recibo_ferramentas (
  recibo_id INTEGER NOT NULL REFERENCES logistica_recibos(id),
  ferramenta_id INTEGER NOT NULL REFERENCES logistica_ferramentas(id),
  PRIMARY KEY (recibo_id, ferramenta_id)
);

CREATE TABLE logistica_eventos (
  id SERIAL PRIMARY KEY,
  ferramenta_id INTEGER REFERENCES logistica_ferramentas(id),
  recibo_id INTEGER REFERENCES logistica_recibos(id),
  tecnico_id INTEGER REFERENCES users(id),
  tipo TEXT NOT NULL,
  detalhe JSONB NOT NULL DEFAULT '{}'::jsonb,
  ator_id INTEGER REFERENCES users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX logistica_eventos_ferramenta_idx ON logistica_eventos(ferramenta_id, criado_em DESC);

CREATE TABLE logistica_faltas (
  id SERIAL PRIMARY KEY,
  ferramenta_id INTEGER NOT NULL REFERENCES logistica_ferramentas(id),
  tecnico_id INTEGER NOT NULL REFERENCES users(id),
  relato TEXT NOT NULL,
  apuracao TEXT,
  estado TEXT NOT NULL DEFAULT 'aberta' CHECK (estado IN ('aberta','reposta','apurada')),
  criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrada_em TIMESTAMPTZ
);
CREATE UNIQUE INDEX logistica_faltas_aberta_unica ON logistica_faltas(ferramenta_id) WHERE estado='aberta';
