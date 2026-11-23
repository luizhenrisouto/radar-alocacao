-- Acesso: cada usuário logado vê e altera só os dados da empresa em que é membro. Anônimo não acessa nada.

create function minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from membros where user_id = auth.uid()
$$;

revoke all on all tables in schema public from anon;

alter table empresas enable row level security;
alter table membros enable row level security;
alter table clientes enable row level security;
alter table consultores enable row level security;
alter table alocacoes enable row level security;
alter table vagas enable row level security;
alter table matches enable row level security;

create policy empresa_le on empresas for select to authenticated using (id = minha_empresa());
create policy membro_le on membros for select to authenticated using (user_id = auth.uid());

create policy da_empresa on clientes for all to authenticated using (empresa_id = minha_empresa()) with check (empresa_id = minha_empresa());
create policy da_empresa on consultores for all to authenticated using (empresa_id = minha_empresa()) with check (empresa_id = minha_empresa());
create policy da_empresa on alocacoes for all to authenticated using (empresa_id = minha_empresa()) with check (empresa_id = minha_empresa());
create policy da_empresa on vagas for all to authenticated using (empresa_id = minha_empresa()) with check (empresa_id = minha_empresa());
-- matches: o usuário só lê; quem grava é a Edge Function (service_role) por salvar_matches.
create policy da_empresa on matches for select to authenticated using (empresa_id = minha_empresa());

revoke insert, update, delete on empresas, membros, matches from authenticated;
