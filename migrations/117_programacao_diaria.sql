-- Agenda operacional independente do andamento da obra ou do serviço.
CREATE TABLE daily_activities (
  id SERIAL PRIMARY KEY,
  day DATE NOT NULL,
  cost_center_id INTEGER NOT NULL REFERENCES cost_centers(id),
  instructions TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  canceled BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason TEXT,
  origin_id INTEGER REFERENCES daily_activities(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX daily_activities_day_idx ON daily_activities(day, sort_order, id);
CREATE INDEX daily_activities_center_idx ON daily_activities(cost_center_id);

CREATE TABLE daily_participants (
  activity_id INTEGER NOT NULL REFERENCES daily_activities(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  state TEXT NOT NULL DEFAULT 'pendente' CHECK (state IN ('pendente','em_andamento','pausado','concluido')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY(activity_id, user_id)
);
CREATE INDEX daily_participants_user_idx ON daily_participants(user_id, activity_id) WHERE active;

CREATE TABLE daily_events (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES daily_activities(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('andamento','instrucao','equipe','cancelamento')),
  state TEXT CHECK (state IN ('pendente','em_andamento','pausado','concluido')),
  observation TEXT NOT NULL DEFAULT '',
  client_id UUID,
  request_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, client_id)
);
CREATE INDEX daily_events_activity_idx ON daily_events(activity_id, id);
