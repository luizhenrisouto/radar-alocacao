-- Importação de planilhas (uma transação por chamada) e cache de explicações.
-- As linhas chegam já convertidas pelo app (camelCase) e trazem "linha", o número da linha na planilha, para os erros.

create function exigir_empresa() returns uuid
language plpgsql stable set search_path = public as $$
declare v uuid := minha_empresa();
begin
  if v is null then raise exception 'usuário sem empresa'; end if;
  return v;
end $$;

create function texto_array(j jsonb) returns text[]
language sql immutable as $$
  select coalesce(array(select jsonb_array_elements_text(coalesce(j, '[]'::jsonb))), '{}')
$$;

-- Consultores: cria ou atualiza pelo e-mail (sem diferenciar maiúsculas).
create function importar_consultores(p_linhas jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_emp uuid := exigir_empresa();
  r jsonb; i int := 0; n int := 0; erros jsonb := '[]';
begin
  for r in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    if coalesce(trim(r->>'email'), '') = '' then
      erros := erros || jsonb_build_object('linha', coalesce((r->>'linha')::int, i + 1), 'motivo', 'e-mail obrigatório');
      continue;
    end if;
    insert into consultores (empresa_id, nome, email, cargo, senioridade, skills, regime, custo_mensal, cidade, aceita_remoto, admitido_em)
    values (
      v_emp, r->>'nome', lower(trim(r->>'email')), coalesce(r->>'cargo', ''), r->>'senioridade', texto_array(r->'skills'),
      coalesce(r->>'regime', 'CLT'), coalesce((r->>'custoMensal')::numeric, 0), r->>'cidade',
      coalesce((r->>'aceitaRemoto')::boolean, true), coalesce((r->>'admitidoEm')::date, current_date)
    )
    on conflict (empresa_id, email) do update set
      nome = excluded.nome, cargo = excluded.cargo, senioridade = excluded.senioridade, skills = excluded.skills,
      regime = excluded.regime, custo_mensal = excluded.custo_mensal, cidade = excluded.cidade,
      aceita_remoto = excluded.aceita_remoto, admitido_em = excluded.admitido_em;
    n := n + 1;
  end loop;
  return jsonb_build_object('gravadas', n, 'erros', erros);
end $$;

create function cliente_por_nome(p_empresa uuid, p_nome text) returns uuid
language sql set search_path = public as $$
  insert into clientes (empresa_id, nome) values (p_empresa, trim(p_nome))
  on conflict (empresa_id, nome) do update set nome = excluded.nome
  returning id
$$;

-- Alocações: substitui todas as da empresa. Consultor pelo e-mail; cliente pelo nome (criado se não existir).
create function importar_alocacoes(p_linhas jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_emp uuid := exigir_empresa();
  r jsonb; i int := 0; n int := 0; erros jsonb := '[]'; v_cons uuid; v_fim date;
begin
  delete from alocacoes where empresa_id = v_emp;
  for r in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    select id into v_cons from consultores where empresa_id = v_emp and email = lower(trim(r->>'email'));
    if v_cons is null then
      erros := erros || jsonb_build_object('linha', coalesce((r->>'linha')::int, i + 1), 'motivo', 'consultor não encontrado: ' || coalesce(r->>'email', ''));
      continue;
    end if;
    v_fim := (r->>'fim')::date;
    insert into alocacoes (empresa_id, consultor_id, cliente_id, inicio, fim, valor_hora, status)
    values (
      v_emp, v_cons, cliente_por_nome(v_emp, r->>'cliente'), (r->>'inicio')::date, v_fim,
      coalesce((r->>'valorHora')::numeric, 0),
      coalesce(r->>'status', case when v_fim is not null and v_fim < current_date then 'encerrada' else 'ativa' end)
    );
    n := n + 1;
  end loop;
  return jsonb_build_object('gravadas', n, 'erros', erros);
end $$;

-- Vagas: substitui todas as da empresa (e, em cascata, as explicações salvas).
create function importar_vagas(p_linhas jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_emp uuid := exigir_empresa();
  r jsonb; n int := 0;
begin
  delete from vagas where empresa_id = v_emp;
  for r in select * from jsonb_array_elements(p_linhas) loop
    insert into vagas (empresa_id, cliente_id, titulo, senioridade, skills_obrigatorias, skills_desejaveis, inicio_previsto, valor_hora, status)
    values (
      v_emp, cliente_por_nome(v_emp, r->>'cliente'), r->>'titulo', r->>'senioridade', texto_array(r->'skillsObrigatorias'),
      texto_array(r->'skillsDesejaveis'), (r->>'inicioPrevisto')::date, (r->>'valorHora')::numeric, coalesce(r->>'status', 'aberta')
    );
    n := n + 1;
  end loop;
  return jsonb_build_object('gravadas', n, 'erros', '[]'::jsonb);
end $$;

-- Explicação salva fica velha quando a vaga ou o consultor mudam.
create function limpar_matches_vaga() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from matches where vaga_id = new.id; return new; end $$;
create function limpar_matches_consultor() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from matches where consultor_id = new.id; return new; end $$;
create trigger vaga_mudou after update on vagas for each row execute function limpar_matches_vaga();
create trigger consultor_mudou after update on consultores for each row execute function limpar_matches_consultor();

-- Só a Edge Function (service_role) grava explicações.
create function salvar_matches(p_vaga uuid, p_matches jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid; r jsonb;
begin
  select empresa_id into v_emp from vagas where id = p_vaga;
  if v_emp is null then raise exception 'vaga não encontrada'; end if;
  for r in select * from jsonb_array_elements(p_matches) loop
    insert into matches (vaga_id, consultor_id, empresa_id, nota, explicacao, origem, gerado_em)
    values (p_vaga, (r->>'consultorId')::uuid, v_emp, (r->>'nota')::int, r->>'explicacao', r->>'origem', now())
    on conflict (vaga_id, consultor_id) do update set
      nota = excluded.nota, explicacao = excluded.explicacao, origem = excluded.origem, gerado_em = excluded.gerado_em;
  end loop;
end $$;

revoke execute on function salvar_matches(uuid, jsonb) from public, anon, authenticated;
grant execute on function salvar_matches(uuid, jsonb) to service_role;
