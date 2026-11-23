import { beforeEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { USUARIO_A, USUARIO_B, como, criarEmpresaComMembro, importar, novoBanco, um } from "./apoio";

const pessoa = (linha: number, nome: string, email: string) => ({
  linha, nome, email, cargo: "QA", senioridade: "senior", skills: ["Playwright"], regime: "CLT", custoMensal: 14000, cidade: null, aceitaRemoto: true, admitidoEm: "2025-01-10",
});
const alocacao = (linha: number, email: string, cliente: string) => ({ linha, email, cliente, inicio: "2026-01-01", fim: null, valorHora: 100 });

let db: PGlite;
let empresaA: string;
beforeEach(async () => {
  db = await novoBanco();
  empresaA = await criarEmpresaComMembro(db, USUARIO_A, "Empresa A");
  await criarEmpresaComMembro(db, USUARIO_B, "Empresa B");
});

async function cenarioCorte() {
  await importar(db, USUARIO_A, "consultores", [pessoa(2, "Ana", "ana@x.com"), pessoa(3, "Beto", "beto@x.com")]);
  await importar(db, USUARIO_A, "alocacoes", [alocacao(2, "ana@x.com", "Cooperativa X"), alocacao(3, "beto@x.com", "Cooperativa X"), alocacao(4, "ana@x.com", "Banco Y")]);
  return um<{ cliente: string; ids: string[] }>(db,
    "select (select id from clientes where nome = 'Cooperativa X') as cliente, array(select id from consultores order by nome) as ids");
}

const registrar = (usuario: string, cliente: string, ids: string[], data = "2026-12-31") =>
  como(db, "authenticated", usuario, async () =>
    (await um<{ r: { encerradas: number; receitaMensal: number } }>(db, "select registrar_corte($1, $2::uuid[], $3::date, $4) as r", [cliente, ids, data, "corte de fim de ano"])).r);

test("registrar_corte encerra só as alocações ativas do cliente na data e guarda o histórico", async () => {
  const { cliente, ids } = await cenarioCorte();
  const r = await registrar(USUARIO_A, cliente, ids);
  expect(r.encerradas).toBe(2);
  expect(Number(r.receitaMensal)).toBe(33600);
  const fins = (await db.query<{ nome: string; fim: string | null }>(
    "select c.nome, a.fim::text as fim from alocacoes a join clientes c on c.id = a.cliente_id order by c.nome, a.fim")).rows;
  expect(fins).toEqual([{ nome: "Banco Y", fim: null }, { nome: "Cooperativa X", fim: "2026-12-31" }, { nome: "Cooperativa X", fim: "2026-12-31" }]);
  expect(await um(db, "select count(*)::int as n, max(registrado_por::text) as por, max(alocacoes_encerradas) as enc from cortes"))
    .toEqual({ n: 1, por: USUARIO_A, enc: 2 });
});

test("registrar_corte recusa cliente de outra empresa", async () => {
  const { cliente, ids } = await cenarioCorte();
  await expect(registrar(USUARIO_B, cliente, ids)).rejects.toThrow(/cliente de outra empresa/);
});

test("registrar_corte recusa consultor de outra empresa", async () => {
  const { cliente } = await cenarioCorte();
  await importar(db, USUARIO_B, "consultores", [pessoa(2, "Caio", "caio@x.com")]);
  const { caio } = await um<{ caio: string }>(db, "select id as caio from consultores where nome = 'Caio'");
  await expect(registrar(USUARIO_A, cliente, [caio])).rejects.toThrow(/consultor de outra empresa/);
});

test("registrar_corte apaga as explicações salvas das pessoas cortadas", async () => {
  const { cliente, ids } = await cenarioCorte();
  await importar(db, USUARIO_A, "vagas", [{ linha: 2, cliente: "Banco Y", titulo: "QA", senioridade: "senior", skillsObrigatorias: ["Playwright"], skillsDesejaveis: [], inicioPrevisto: "2027-01-10", valorHora: 150 }]);
  const { vaga } = await um<{ vaga: string }>(db, "select id as vaga from vagas");
  await como(db, "service_role", null, () =>
    db.query("select salvar_matches($1, $2::jsonb)", [vaga, JSON.stringify([{ consultorId: ids[0], nota: 90, explicacao: "Boa", origem: "ia" }])]));
  expect(await um(db, "select count(*)::int as n from matches")).toEqual({ n: 1 });
  await registrar(USUARIO_A, cliente, ids);
  expect(await um(db, "select count(*)::int as n from matches")).toEqual({ n: 0 });
});

test("membro lê, cria e apaga vagas externas só da própria empresa", async () => {
  await como(db, "authenticated", USUARIO_A, () => db.query(
    "insert into vagas_externas (empresa_alvo, titulo, senioridade, skills_obrigatorias, inicio_previsto, origem) values ('Clínica Alfa', 'QA', 'senior', '{Playwright}', '2026-12-24', 'regra')"));
  expect(await um(db, "select empresa_id::text as e from vagas_externas")).toEqual({ e: empresaA });
  const vistasPorB = await como(db, "authenticated", USUARIO_B, async () => (await db.query("select * from vagas_externas")).rows);
  expect(vistasPorB).toHaveLength(0);
  const apagadasPorB = await como(db, "authenticated", USUARIO_B, async () => (await db.query("delete from vagas_externas")).affectedRows);
  expect(apagadasPorB).toBe(0);
  const apagadasPorA = await como(db, "authenticated", USUARIO_A, async () => (await db.query("delete from vagas_externas")).affectedRows);
  expect(apagadasPorA).toBe(1);
});

async function clienteDeA(): Promise<string> {
  return (await um<{ id: string }>(db, "insert into clientes (empresa_id, nome) values ($1, 'Banco Y') returning id", [empresaA])).id;
}
const novoSinal = "insert into sinais (empresa_id, cliente_id, titulo, url, fonte, publicado_em, tipo, gravidade, resumo, origem) values ($1, $2, 'Banco Y corta 10%', 'https://exemplo.com/1', 'Jornal', '2026-11-20', 'corte', 3, 'Corte', 'ia')";

test("membro lê sinais e não consegue gravar", async () => {
  const cliente = await clienteDeA();
  await db.query(novoSinal, [empresaA, cliente]);
  const vistos = await como(db, "authenticated", USUARIO_A, async () => (await db.query("select * from sinais")).rows);
  expect(vistos).toHaveLength(1);
  const vistosPorB = await como(db, "authenticated", USUARIO_B, async () => (await db.query("select * from sinais")).rows);
  expect(vistosPorB).toHaveLength(0);
  await expect(como(db, "authenticated", USUARIO_A, () => db.query(novoSinal, [empresaA, cliente]))).rejects.toThrow(/permission denied/);
});

test("link repetido em sinais da mesma empresa não duplica", async () => {
  const cliente = await clienteDeA();
  await como(db, "service_role", null, async () => {
    await db.query(`${novoSinal} on conflict (empresa_id, url) do nothing`, [empresaA, cliente]);
    await db.query(`${novoSinal} on conflict (empresa_id, url) do nothing`, [empresaA, cliente]);
  });
  expect(await um(db, "select count(*)::int as n from sinais")).toEqual({ n: 1 });
});
