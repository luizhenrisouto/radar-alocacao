-- Radar de Alocação: esquema. Toda tabela de dados tem empresa_id (isolamento por RLS em 0002).

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  limite_concentracao numeric not null default 0.30,
  dias_uteis_mes int not null default 22,
  criada_em timestamptz not null default now()
);

create table membros (
  user_id uuid primary key,
  empresa_id uuid not null references empresas on delete cascade,
  papel text not null default 'gestor'
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  nome text not null,
  setor text,
  unique (empresa_id, nome)
);

create table consultores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  nome text not null,
  email text not null check (email = lower(email)),
  cargo text not null default '',
  senioridade text not null check (senioridade in ('junior', 'pleno', 'senior', 'especialista')),
  skills text[] not null default '{}',
  regime text not null default 'CLT' check (regime in ('CLT', 'PJ')),
  custo_mensal numeric not null default 0,
  cidade text,
  aceita_remoto boolean not null default true,
  admitido_em date not null default current_date,
  unique (empresa_id, email)
);

create table alocacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  consultor_id uuid not null references consultores on delete cascade,
  cliente_id uuid not null references clientes on delete cascade,
  inicio date not null,
  fim date,
  valor_hora numeric not null default 0,
  status text not null default 'ativa' check (status in ('ativa', 'encerrada', 'prevista'))
);

create table vagas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  cliente_id uuid not null references clientes on delete cascade,
  titulo text not null,
  senioridade text not null check (senioridade in ('junior', 'pleno', 'senior', 'especialista')),
  skills_obrigatorias text[] not null default '{}',
  skills_desejaveis text[] not null default '{}',
  inicio_previsto date not null,
  valor_hora numeric,
  status text not null default 'aberta' check (status in ('aberta', 'fechada'))
);

-- Cache das explicações de matching (geradas pela IA ou pela regra).
create table matches (
  vaga_id uuid not null references vagas on delete cascade,
  consultor_id uuid not null references consultores on delete cascade,
  empresa_id uuid not null references empresas on delete cascade,
  nota int not null,
  explicacao text not null,
  origem text not null check (origem in ('ia', 'regra')),
  gerado_em timestamptz not null default now(),
  primary key (vaga_id, consultor_id)
);

create index on membros (empresa_id);
create index on clientes (empresa_id);
create index on consultores (empresa_id);
create index on alocacoes (empresa_id);
create index on alocacoes (consultor_id);
create index on vagas (empresa_id);
create index on matches (empresa_id);
