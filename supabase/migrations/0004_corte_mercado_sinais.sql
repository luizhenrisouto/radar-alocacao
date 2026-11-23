-- Parte 2: registro de corte, vagas do mercado e notícias dos clientes.

-- Termo para buscar notícias do cliente (quando o nome sozinho traz notícias de outras empresas).
alter table clientes add column termo_busca text;

-- Histórico de cortes registrados (auditoria). Só leitura para os membros; quem grava é registrar_corte.
create table cortes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  cliente_id uuid not null references clientes on delete cascade,
  data date not null,
  motivo text,
  consultores uuid[] not null,
  alocacoes_encerradas int not null,
  receita_mensal numeric not null,
  registrado_por uuid,
  registrado_em timestamptz not null default now()
);

-- Vagas vistas no mercado, coladas pelo comercial.
create table vagas_externas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default minha_empresa() references empresas on delete cascade,
  empresa_alvo text not null default '',
  titulo text not null,
  senioridade text not null check (senioridade in ('junior', 'pleno', 'senior', 'especialista')),
  skills_obrigatorias text[] not null default '{}',
  skills_desejaveis text[] not null default '{}',
  cidade text,
  remoto boolean not null default false,
  url text,
  inicio_previsto date not null,
  origem text not null check (origem in ('ia', 'regra', 'manual')),
  criada_em timestamptz not null default now()
);

-- Notícias dos clientes, classificadas. Só a função sinais (service_role) grava.
create table sinais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas on delete cascade,
  cliente_id uuid not null references clientes on delete cascade,
  titulo text not null,
  url text not null,
  fonte text not null default '',
  publicado_em date not null,
  tipo text not null check (tipo in ('corte', 'resultado_ruim', 'fusao', 'troca_diretoria', 'congelamento', 'expansao', 'irrelevante')),
  gravidade int not null check (gravidade between 0 and 3),
  resumo text not null default '',
  origem text not null check (origem in ('ia', 'regra')),
  criado_em timestamptz not null default now(),
  unique (empresa_id, url)
);

create index on cortes (empresa_id);
create index on vagas_externas (empresa_id);
create index on sinais (empresa_id, publicado_em);

alter table cortes enable row level security;
alter table vagas_externas enable row level security;
alter table sinais enable row level security;

create policy da_empresa on cortes for select to authenticated using (empresa_id = minha_empresa());
create policy da_empresa on vagas_externas for all to authenticated using (empresa_id = minha_empresa()) with check (empresa_id = minha_empresa());
create policy da_empresa on sinais for select to authenticated using (empresa_id = minha_empresa());

revoke all on cortes, vagas_externas, sinais from anon;
revoke insert, update, delete on cortes, sinais from authenticated;

-- Encerra na data, numa transação, as alocações ativas das pessoas no cliente e guarda o corte.
create function registrar_corte(p_cliente uuid, p_consultores uuid[], p_data date, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := exigir_empresa();
  v_n int; v_receita numeric;
begin
  if not exists (select 1 from clientes where id = p_cliente and empresa_id = v_emp) then
    raise exception 'cliente de outra empresa';
  end if;
  if exists (select 1 from unnest(p_consultores) x where not exists (select 1 from consultores c where c.id = x and c.empresa_id = v_emp)) then
    raise exception 'consultor de outra empresa';
  end if;

  with encerradas as (
    update alocacoes set fim = p_data
    where empresa_id = v_emp and cliente_id = p_cliente and consultor_id = any(p_consultores)
      and status = 'ativa' and inicio <= p_data and (fim is null or fim > p_data)
    returning valor_hora
  )
  select count(*), coalesce(sum(valor_hora * 168), 0) into v_n, v_receita from encerradas;

  -- A disponibilidade mudou: as explicações salvas dessas pessoas ficaram velhas.
  delete from matches where empresa_id = v_emp and consultor_id = any(p_consultores);

  insert into cortes (empresa_id, cliente_id, data, motivo, consultores, alocacoes_encerradas, receita_mensal, registrado_por)
  values (v_emp, p_cliente, p_data, nullif(trim(coalesce(p_motivo, '')), ''), p_consultores, v_n, v_receita, auth.uid());

  return jsonb_build_object('encerradas', v_n, 'receitaMensal', v_receita);
end $$;

revoke execute on function registrar_corte(uuid, uuid[], date, text) from public, anon;
grant execute on function registrar_corte(uuid, uuid[], date, text) to authenticated;
