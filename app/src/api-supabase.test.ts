import { expect, test, vi } from "vitest";
import { apiSupabase, paraDadosEmpresa, paraDadosPonto } from "./api-supabase";

test("converte as linhas do banco (snake_case) para o formato do app", () => {
  const d = paraDadosEmpresa({
    empresa: { id: "e1", nome: "Datum", limite_concentracao: "0.30", dias_uteis_mes: 22 },
    clientes: [{ id: "cli1", nome: "Banco", setor: null }],
    consultores: [{ id: "c1", nome: "Ana", email: "ana@x.com", cargo: "QA", senioridade: "senior", skills: ["Java"], regime: "PJ", custo_mensal: "14000", cidade: null, aceita_remoto: true, admitido_em: "2025-01-10" }],
    alocacoes: [{ id: "a1", consultor_id: "c1", cliente_id: "cli1", inicio: "2026-01-01", fim: null, valor_hora: 150, status: "ativa" }],
    vagas: [{ id: "v1", cliente_id: "cli1", titulo: "QA", senioridade: "senior", skills_obrigatorias: ["Java"], skills_desejaveis: [], inicio_previsto: "2026-12-10", valor_hora: null, status: "aberta" }],
    matches: [{ vaga_id: "v1", consultor_id: "c1", nota: 90, explicacao: "Boa", origem: "ia", gerado_em: "2026-11-24T10:00:00Z" }],
  });
  expect(d.empresa).toEqual({ id: "e1", nome: "Datum", limiteConcentracao: 0.3, diasUteisMes: 22 });
  expect(d.consultores[0]).toMatchObject({ custoMensal: 14000, aceitaRemoto: true, admitidoEm: "2025-01-10" });
  expect(d.alocacoes[0]).toMatchObject({ consultorId: "c1", clienteId: "cli1", valorHora: 150 });
  expect(d.vagas[0]).toMatchObject({ skillsObrigatorias: ["Java"], inicioPrevisto: "2026-12-10", valorHora: null });
  expect(d.matches[0]).toMatchObject({ vagaId: "v1", consultorId: "c1", origem: "ia" });
  expect(d.vagasExternas).toEqual([]);
  expect(d.sinais).toEqual([]);
});

test("salário vem como número ou null", () => {
  const linha = (id: string, salario: string | null) => ({ id, nome: "Ana", email: `${id}@x.com`, cargo: "QA", senioridade: "senior", skills: [], regime: "Cooperado", custo_mensal: "14000", salario, cidade: null, aceita_remoto: true, admitido_em: "2025-01-10" });
  const d = paraDadosEmpresa({
    empresa: { id: "e1", nome: "Datum", limite_concentracao: "0.30", dias_uteis_mes: 22 },
    clientes: [], consultores: [linha("c1", "8000"), linha("c2", null)], alocacoes: [], vagas: [], matches: [],
  });
  expect(d.consultores.map((c) => [c.regime, c.salario])).toEqual([["Cooperado", 8000], ["Cooperado", null]]);
});

test("converte o ponto do banco para o formato do app", () => {
  const p = paraDadosPonto({
    colaboradores: [{ matricula: "226", nome: "Ana", email: "ana@x.exemplo", email_gestor: null, ativo: true }],
    dias: [{ matricula: "226", data: "2026-11-17", marcacoes: [], situacao: null }],
    pendencias: [{ id: "p1", matricula: "226", data: "2026-11-17", tipo: "sem_marcacao", aberta_em: "2026-11-18", resolvida_em: null, cobrancas: 2, ultima_cobranca: "2026-11-18", escalada: false }],
    envios: [{ id: "e1", matricula: "226", destino: "ana@x.exemplo", canal: "email", nivel: "pessoa", assunto: "Ponto", enviado_em: "2026-11-18T12:00:00+00:00", ok: false, erro: "resend 422" }],
    config: { emailAtivo: true, teamsAtivo: false, teamsConfigurado: true, remetenteNome: "RH", intervaloDias: 1, escalarApos: 2 },
  });
  expect(p.colaboradores[0]).toEqual({ matricula: "226", nome: "Ana", email: "ana@x.exemplo", emailGestor: null, ativo: true });
  expect(p.pendencias[0]).toMatchObject({ abertaEm: "2026-11-18", resolvidaEm: null, cobrancas: 2, ultimaCobranca: "2026-11-18" });
  expect(p.envios[0]).toMatchObject({ enviadoEm: "2026-11-18T12:00:00.000Z", ok: false, erro: "resend 422", simulado: false });
  expect(p.config.teamsConfigurado).toBe(true);
});

/** Dublê do supabase-js: registra a cadeia de cada consulta e devolve linhas vazias (a empresa, uma). */
function clienteFalso() {
  const consultas: { tabela: string; chamadas: [string, unknown[]][] }[] = [];
  const from = (tabela: string) => {
    const c = { tabela, chamadas: [] as [string, unknown[]][] };
    consultas.push(c);
    const construtor: any = new Proxy({}, {
      get(_, nome: string) {
        if (nome === "then") {
          const data = tabela === "empresas" ? [{ id: "e1", nome: "Datum", limite_concentracao: 0.3, dias_uteis_mes: 22 }] : [];
          return (ok: (r: unknown) => void) => ok({ data, error: null });
        }
        return (...args: unknown[]) => { c.chamadas.push([nome, args]); return construtor; };
      },
    });
    return construtor;
  };
  return { cliente: { from } as any, consultas };
}

test("dados() lê só as notícias dos últimos 90 dias, das mais novas para as mais antigas", async () => {
  const { cliente, consultas } = clienteFalso();
  await apiSupabase("http://x", "k", () => "2026-11-24", cliente).dados();
  const sinais = consultas.find((c) => c.tabela === "sinais")!;
  expect(sinais.chamadas).toContainEqual(["gte", ["publicado_em", "2026-08-26"]]);
  expect(sinais.chamadas).toContainEqual(["order", ["publicado_em", { ascending: false }]]);
});

test("paraDadosEmpresa converte vagas externas e sinais", () => {
  const d = paraDadosEmpresa({
    empresa: { id: "e1", nome: "Datum", limite_concentracao: 0.3, dias_uteis_mes: 22 },
    clientes: [], consultores: [], alocacoes: [], vagas: [], matches: [],
    vagasExternas: [{
      id: "x1", empresa_alvo: "Clínica Alfa", titulo: "QA", senioridade: "senior", skills_obrigatorias: ["Playwright"], skills_desejaveis: null,
      cidade: null, remoto: true, url: null, inicio_previsto: "2026-12-24", origem: "ia", criada_em: "2026-11-24T10:00:00Z",
    }],
    sinais: [{
      id: "s1", cliente_id: "cli1", titulo: "Banco corta", url: "https://exemplo.com/1", fonte: "Jornal", publicado_em: "2026-11-20",
      tipo: "corte", gravidade: 3, resumo: "Corte", origem: "regra",
    }],
  });
  expect(d.vagasExternas[0]).toEqual({
    id: "x1", empresaAlvo: "Clínica Alfa", titulo: "QA", senioridade: "senior", skillsObrigatorias: ["Playwright"], skillsDesejaveis: [],
    cidade: null, remoto: true, url: null, inicioPrevisto: "2026-12-24", origem: "ia", criadaEm: "2026-11-24T10:00:00Z",
  });
  expect(d.sinais[0]).toEqual({
    id: "s1", clienteId: "cli1", titulo: "Banco corta", url: "https://exemplo.com/1", fonte: "Jornal", publicadoEm: "2026-11-20",
    tipo: "corte", gravidade: 3, resumo: "Corte", origem: "regra",
  });
});

test("cobrarPonto e testarEnvioPonto chamam a função ponto com a ação", async () => {
  const invoke = vi.fn(async (_nome: string, op: { body: { acao: string } }) =>
    ({ data: op.body.acao === "teste" ? { ok: true } : { enviados: 3, falhas: 1 }, error: null }));
  const api = apiSupabase("http://x", "k", () => "2026-11-24", { functions: { invoke } } as any);
  expect(await api.cobrarPonto()).toEqual({ enviados: 3, falhas: 1 });
  await api.testarEnvioPonto();
  expect(invoke.mock.calls.map(([nome, op]) => [nome, op.body])).toEqual([["ponto", { acao: "cobrar" }], ["ponto", { acao: "teste" }]]);
});

test("cobrarPonto com erro da função avisa", async () => {
  const api = apiSupabase("http://x", "k", () => "2026-11-24", { functions: { invoke: async () => ({ data: null, error: new Error("x") }) } } as any);
  await expect(api.cobrarPonto()).rejects.toThrow("Não foi possível cobrar agora.");
  await expect(api.testarEnvioPonto()).rejects.toThrow("Não foi possível enviar o teste.");
});

test("cobrarPonto repassa quando já há uma rodada em andamento", async () => {
  const api = apiSupabase("http://x", "k", () => "2026-11-24", { functions: { invoke: async () => ({ data: { enviados: 0, falhas: 0, ocupado: true }, error: null }) } } as any);
  expect(await api.cobrarPonto()).toEqual({ enviados: 0, falhas: 0, ocupado: true });
});

test("acertarPendencia chama a RPC com o id", async () => {
  const rpc = vi.fn(async () => ({ data: true, error: null }));
  await apiSupabase("http://x", "k", () => "2026-11-24", { rpc } as any).acertarPendencia("p1");
  expect(rpc).toHaveBeenCalledWith("marcar_ponto_acertado", { p_id: "p1" });
});
