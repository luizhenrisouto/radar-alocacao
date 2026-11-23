-- Manter ou desligar: regime cooperado e salário opcional (só usado na conta de CLT).

alter table consultores drop constraint consultores_regime_check;
alter table consultores add constraint consultores_regime_check check (regime in ('CLT', 'PJ', 'Cooperado'));
alter table consultores add column salario numeric;

-- Igual à de 0003_importar.sql, agora gravando o salário.
create or replace function importar_consultores(p_linhas jsonb) returns jsonb
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
    insert into consultores (empresa_id, nome, email, cargo, senioridade, skills, regime, custo_mensal, salario, cidade, aceita_remoto, admitido_em)
    values (
      v_emp, r->>'nome', lower(trim(r->>'email')), coalesce(r->>'cargo', ''), r->>'senioridade', texto_array(r->'skills'),
      coalesce(r->>'regime', 'CLT'), coalesce((r->>'custoMensal')::numeric, 0), (r->>'salario')::numeric, r->>'cidade',
      coalesce((r->>'aceitaRemoto')::boolean, true), coalesce((r->>'admitidoEm')::date, current_date)
    )
    on conflict (empresa_id, email) do update set
      nome = excluded.nome, cargo = excluded.cargo, senioridade = excluded.senioridade, skills = excluded.skills,
      regime = excluded.regime, custo_mensal = excluded.custo_mensal, salario = excluded.salario, cidade = excluded.cidade,
      aceita_remoto = excluded.aceita_remoto, admitido_em = excluded.admitido_em;
    n := n + 1;
  end loop;
  return jsonb_build_object('gravadas', n, 'erros', erros);
end $$;
