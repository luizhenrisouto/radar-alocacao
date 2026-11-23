-- Ponto em dia: colaboradores do ponto, marcações por dia, pendências, envios e configuração.
-- Os membros só leem. Quem grava são as RPCs de importação e configuração (security definer)
-- e a função "ponto" (service_role), que envia os lembretes.

create table ponto_colaboradores (
  empresa_id uuid not null default minha_empresa() references empresas on delete cascade,
  matricula text not null,
  nome text not null,
  email text not null,
  email_gestor text,
  ativo boolean not null default true,
  primary key (empresa_id, matricula)
);

create table ponto_dias (
  empresa_id uuid not null,
  matricula text not null,
  data date not null,
  marcacoes text[] not null default '{}',
  situacao text,
  primary key (empresa_id, matricula, data),
  foreign key (empresa_id, matricula) references ponto_colaboradores on delete cascade
);

create table ponto_pendencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  matricula text not null,
  data date not null,
  tipo text not null check (tipo in ('sem_marcacao', 'incompleta')),
  aberta_em date not null,
  resolvida_em date,
  -- true quando o RH marcou como acertada pela tela (e não pela importação).
  resolvida_manualmente boolean not null default false,
  cobrancas int not null default 0,
  ultima_cobranca date,
  escalada boolean not null default false,
  foreign key (empresa_id, matricula) references ponto_colaboradores on delete cascade
);
-- Só uma pendência aberta por pessoa e dia; as resolvidas ficam no histórico.
create unique index ponto_pendencia_aberta on ponto_pendencias (empresa_id, matricula, data) where resolvida_em is null;

create table ponto_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  matricula text,
  destino text not null,
  canal text not null check (canal in ('email', 'teams')),
  nivel text not null check (nivel in ('pessoa', 'gestor')),
  assunto text not null,
  enviado_em timestamptz not null default now(),
  ok boolean not null,
  erro text
);
create index ponto_envios_recentes on ponto_envios (empresa_id, enviado_em desc);

-- Trava de rodada: o agendamento e o "Cobrar agora" não lembram ninguém duas vezes ao mesmo tempo.
-- Só a função (service_role) usa. Uma trava com mais de 10 minutos é de uma rodada que morreu no meio e é liberada.
create table ponto_rodadas (
  empresa_id uuid primary key references empresas on delete cascade,
  iniciada_em timestamptz not null default now()
);

-- Uma linha por empresa. A URL do fluxo do Teams não é lida pelos membros (config_ponto devolve só "configurada").
create table ponto_config (
  empresa_id uuid primary key references empresas on delete cascade,
  email_ativo boolean not null default true,
  teams_ativo boolean not null default false,
  teams_url text,
  remetente_nome text not null default 'RH',
  intervalo_dias int not null default 1 check (intervalo_dias between 1 and 30),
  escalar_apos int not null default 2 check (escalar_apos between 1 and 30)
);

alter table ponto_colaboradores enable row level security;
alter table ponto_dias enable row level security;
alter table ponto_pendencias enable row level security;
alter table ponto_envios enable row level security;
alter table ponto_config enable row level security;
alter table ponto_rodadas enable row level security;
create policy da_empresa on ponto_colaboradores for select to authenticated using (empresa_id = minha_empresa());
create policy da_empresa on ponto_dias for select to authenticated using (empresa_id = minha_empresa());
create policy da_empresa on ponto_pendencias for select to authenticated using (empresa_id = minha_empresa());
create policy da_empresa on ponto_envios for select to authenticated using (empresa_id = minha_empresa());
revoke all on ponto_colaboradores, ponto_dias, ponto_pendencias, ponto_envios, ponto_config from anon;
revoke insert, update, delete on ponto_colaboradores, ponto_dias, ponto_pendencias, ponto_envios from authenticated;
revoke all on ponto_config, ponto_rodadas from authenticated;
revoke all on ponto_rodadas from anon;

-- Mesma regra de tipoDoDia (supabase/functions/_shared/ponto.ts); um teste de banco confere as duas.
create function ponto_tipo(p_marcacoes text[], p_situacao text, p_data date, p_ativo boolean, p_hoje date) returns text
language sql immutable as $$
  select case
    when not p_ativo or p_data >= p_hoje or extract(isodow from p_data) > 5 or coalesce(trim(p_situacao), '') <> '' then null
    when cardinality(p_marcacoes) = 0 then 'sem_marcacao'
    when cardinality(p_marcacoes) % 2 = 1 then 'incompleta'
  end
$$;

create function importar_ponto_colaboradores(p_linhas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := exigir_empresa();
  r jsonb; i int := 0; n int := 0; erros jsonb := '[]';
begin
  for r in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    if coalesce(trim(r->>'matricula'), '') = '' or coalesce(trim(r->>'email'), '') = '' then
      erros := erros || jsonb_build_object('linha', coalesce((r->>'linha')::int, i + 1), 'motivo', 'matrícula e e-mail são obrigatórios');
      continue;
    end if;
    insert into ponto_colaboradores (empresa_id, matricula, nome, email, email_gestor, ativo)
    values (
      v_emp, trim(r->>'matricula'), coalesce(r->>'nome', ''), lower(trim(r->>'email')),
      nullif(lower(trim(coalesce(r->>'emailGestor', ''))), ''), coalesce((r->>'ativo')::boolean, true)
    )
    on conflict (empresa_id, matricula) do update set
      nome = excluded.nome, email = excluded.email, email_gestor = excluded.email_gestor, ativo = excluded.ativo;
    n := n + 1;
  end loop;
  -- Quem saiu (Ativo = não) deixa de ser lembrado: as pendências abertas dessa pessoa são fechadas.
  update ponto_pendencias p set resolvida_em = (now() at time zone 'America/Sao_Paulo')::date
  from ponto_colaboradores c
  where p.empresa_id = v_emp and p.resolvida_em is null
    and c.empresa_id = p.empresa_id and c.matricula = p.matricula and not c.ativo;
  return jsonb_build_object('gravadas', n, 'erros', erros);
end $$;

-- Grava os dias (reimportar substitui o dia) e, na mesma transação, abre, muda o tipo e fecha pendências.
create function importar_ponto_marcacoes(p_linhas jsonb, p_hoje date default (now() at time zone 'America/Sao_Paulo')::date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := exigir_empresa();
  r jsonb; i int := 0; n int := 0; erros jsonb := '[]'; v_mat text; v_abertas int; v_fechadas int;
begin
  for r in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    v_mat := trim(coalesce(r->>'matricula', ''));
    if not exists (select 1 from ponto_colaboradores where empresa_id = v_emp and matricula = v_mat) then
      erros := erros || jsonb_build_object('linha', coalesce((r->>'linha')::int, i + 1), 'motivo', 'matrícula não encontrada: ' || v_mat);
      continue;
    end if;
    insert into ponto_dias (empresa_id, matricula, data, marcacoes, situacao)
    values (v_emp, v_mat, (r->>'data')::date, texto_array(r->'marcacoes'), nullif(trim(coalesce(r->>'situacao', '')), ''))
    on conflict (empresa_id, matricula, data) do update set marcacoes = excluded.marcacoes, situacao = excluded.situacao;
    n := n + 1;
  end loop;

  update ponto_pendencias p set resolvida_em = p_hoje
  from ponto_dias d join ponto_colaboradores c on c.empresa_id = d.empresa_id and c.matricula = d.matricula
  where p.empresa_id = v_emp and p.resolvida_em is null
    and d.empresa_id = p.empresa_id and d.matricula = p.matricula and d.data = p.data
    and ponto_tipo(d.marcacoes, d.situacao, d.data, c.ativo, p_hoje) is null;
  get diagnostics v_fechadas = row_count;

  update ponto_pendencias p set tipo = ponto_tipo(d.marcacoes, d.situacao, d.data, c.ativo, p_hoje)
  from ponto_dias d join ponto_colaboradores c on c.empresa_id = d.empresa_id and c.matricula = d.matricula
  where p.empresa_id = v_emp and p.resolvida_em is null
    and d.empresa_id = p.empresa_id and d.matricula = p.matricula and d.data = p.data
    and ponto_tipo(d.marcacoes, d.situacao, d.data, c.ativo, p_hoje) <> p.tipo;

  insert into ponto_pendencias (empresa_id, matricula, data, tipo, aberta_em)
  select d.empresa_id, d.matricula, d.data, ponto_tipo(d.marcacoes, d.situacao, d.data, c.ativo, p_hoje), p_hoje
  from ponto_dias d join ponto_colaboradores c on c.empresa_id = d.empresa_id and c.matricula = d.matricula
  where d.empresa_id = v_emp
    and ponto_tipo(d.marcacoes, d.situacao, d.data, c.ativo, p_hoje) is not null
    and not exists (
      select 1 from ponto_pendencias p
      where p.empresa_id = d.empresa_id and p.matricula = d.matricula and p.data = d.data and p.resolvida_em is null
    );
  get diagnostics v_abertas = row_count;

  return jsonb_build_object('gravadas', n, 'erros', erros, 'abertas', v_abertas, 'fechadas', v_fechadas);
end $$;

-- Configuração sem a URL do Teams: o app só sabe se ela existe.
create function config_ponto() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_emp uuid := exigir_empresa(); c ponto_config;
begin
  select * into c from ponto_config where empresa_id = v_emp;
  return jsonb_build_object(
    'emailAtivo', coalesce(c.email_ativo, true),
    'teamsAtivo', coalesce(c.teams_ativo, false),
    'teamsConfigurado', c.teams_url is not null,
    'remetenteNome', coalesce(c.remetente_nome, 'RH'),
    'intervaloDias', coalesce(c.intervalo_dias, 1),
    'escalarApos', coalesce(c.escalar_apos, 2)
  );
end $$;

-- teamsUrl ausente ou null mantém a atual; "" apaga.
create function salvar_config_ponto(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := exigir_empresa();
begin
  insert into ponto_config (empresa_id, email_ativo, teams_ativo, teams_url, remetente_nome, intervalo_dias, escalar_apos)
  values (
    v_emp, coalesce((p->>'emailAtivo')::boolean, true), coalesce((p->>'teamsAtivo')::boolean, false),
    nullif(trim(coalesce(p->>'teamsUrl', '')), ''), coalesce(nullif(trim(p->>'remetenteNome'), ''), 'RH'),
    coalesce((p->>'intervaloDias')::int, 1), coalesce((p->>'escalarApos')::int, 2)
  )
  on conflict (empresa_id) do update set
    email_ativo = excluded.email_ativo, teams_ativo = excluded.teams_ativo,
    teams_url = case when p->>'teamsUrl' is null then ponto_config.teams_url else excluded.teams_url end,
    remetente_nome = excluded.remetente_nome, intervalo_dias = excluded.intervalo_dias, escalar_apos = excluded.escalar_apos;
end $$;

revoke execute on function importar_ponto_colaboradores(jsonb), importar_ponto_marcacoes(jsonb, date), config_ponto(), salvar_config_ponto(jsonb) from public, anon;
grant execute on function importar_ponto_colaboradores(jsonb), importar_ponto_marcacoes(jsonb, date), config_ponto(), salvar_config_ponto(jsonb) to authenticated;

create function iniciar_rodada_ponto(p_empresa uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into ponto_rodadas (empresa_id, iniciada_em) values (p_empresa, now())
  on conflict (empresa_id) do update set iniciada_em = now()
    where ponto_rodadas.iniciada_em < now() - interval '10 minutes';
  return found;
end $$;

create function terminar_rodada_ponto(p_empresa uuid) returns void
language sql security definer set search_path = public as $$
  delete from ponto_rodadas where empresa_id = p_empresa
$$;

revoke execute on function iniciar_rodada_ponto(uuid), terminar_rodada_ponto(uuid) from public, anon, authenticated;
grant execute on function iniciar_rodada_ponto(uuid), terminar_rodada_ponto(uuid) to service_role;

-- O RH fecha uma pendência à mão (o dia foi acertado no Senior, mas não veio numa importação nova).
-- Se o dia voltar pendente numa importação seguinte, uma pendência nova é aberta.
create function marcar_ponto_acertado(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update ponto_pendencias set resolvida_em = (now() at time zone 'America/Sao_Paulo')::date, resolvida_manualmente = true
  where id = p_id and empresa_id = exigir_empresa() and resolvida_em is null;
  return found;
end $$;

revoke execute on function marcar_ponto_acertado(uuid) from public, anon;
grant execute on function marcar_ponto_acertado(uuid) to authenticated;
