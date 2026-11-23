import { describe, expect, test } from "vitest";
import {
  CONFIG_PONTO_PADRAO, aplicarCobranca, mensagemGestor, mensagemPessoa, normalizarMatricula, planejarCobrancas, proximoDiaUtil,
  sincronizarPendencias, tipoDoDia, type ColaboradorPonto, type DadosPonto, type DiaPonto, type Pendencia,
} from "./ponto.ts";

const HOJE = "2026-11-19"; // quinta-feira
const QUATRO = ["08:00", "12:00", "13:00", "17:00"];

const col = (matricula: string, extra: Partial<ColaboradorPonto> = {}): ColaboradorPonto => ({
  matricula, nome: `Pessoa ${matricula}`, email: `p${matricula}@x.exemplo`, emailGestor: "gestor@x.exemplo", ativo: true, ...extra,
});
const dia = (matricula: string, data: string, marcacoes: string[], situacao: string | null = null): DiaPonto => ({ matricula, data, marcacoes, situacao });
const pend = (id: string, matricula: string, data: string, extra: Partial<Pendencia> = {}): Pendencia => ({
  id, matricula, data, tipo: "sem_marcacao", abertaEm: "2026-11-10", resolvidaEm: null, cobrancas: 0, ultimaCobranca: null, escalada: false, ...extra,
});
const dados = (parcial: Partial<DadosPonto>): DadosPonto => ({ colaboradores: [], dias: [], pendencias: [], envios: [], config: CONFIG_PONTO_PADRAO, ...parcial });

test("normalizarMatricula tira zeros à esquerda", () => {
  expect(normalizarMatricula("000000226")).toBe("226");
  expect(normalizarMatricula(" 42 ")).toBe("42");
  expect(normalizarMatricula("0")).toBe("0");
});

describe("tipoDoDia", () => {
  test("tipoDoDia: sem marcação, incompleta e completa", () => {
    expect(tipoDoDia(dia("1", "2026-11-17", []), HOJE)).toBe("sem_marcacao");
    expect(tipoDoDia(dia("1", "2026-11-17", ["08:00", "12:00", "13:00"]), HOJE)).toBe("incompleta");
    expect(tipoDoDia(dia("1", "2026-11-17", QUATRO), HOJE)).toBeNull();
  });

  test("tipoDoDia ignora hoje, futuro, fim de semana e situação preenchida", () => {
    expect(tipoDoDia(dia("1", HOJE, []), HOJE)).toBeNull();
    expect(tipoDoDia(dia("1", "2026-11-20", []), HOJE)).toBeNull();
    expect(tipoDoDia(dia("1", "2026-11-15", []), HOJE)).toBeNull();
    expect(tipoDoDia(dia("1", "2026-11-17", [], "Férias"), HOJE)).toBeNull();
    expect(tipoDoDia(dia("1", "2026-11-17", [], "  "), HOJE)).toBe("sem_marcacao");
  });
});

test("sincronizar abre, fecha e muda tipo sem duplicar", () => {
  const r = sincronizarPendencias(
    [dia("A", "2026-11-17", []), dia("B", "2026-11-17", QUATRO), dia("C", "2026-11-18", ["08:00"]), dia("D", "2026-11-17", [])],
    [col("A"), col("B"), col("C"), col("D", { ativo: false }), col("E")],
    [pend("pb", "B", "2026-11-17"), pend("pc", "C", "2026-11-18"), pend("pe", "E", "2026-11-10")],
    HOJE,
  );
  expect(r.abrir).toEqual([{ matricula: "A", data: "2026-11-17", tipo: "sem_marcacao" }]);
  expect(r.fechar).toEqual(["pb"]);
  expect(r.mudarTipo).toEqual([{ id: "pc", tipo: "incompleta" }]);
});

describe("planejarCobrancas", () => {
  test("cobra uma vez por dia útil, juntando as pendências", () => {
    const p = dados({
      colaboradores: [col("A"), col("B"), col("C")],
      pendencias: [
        pend("a1", "A", "2026-11-16"), pend("a2", "A", "2026-11-17"),
        pend("b1", "B", "2026-11-17", { cobrancas: 1, ultimaCobranca: HOJE }),
        pend("c1", "C", "2026-11-17", { cobrancas: 1, ultimaCobranca: "2026-11-18" }),
      ],
    });
    const { cobrancas } = planejarCobrancas(p, HOJE);
    const pessoas = cobrancas.filter((c) => c.nivel === "pessoa");
    expect(pessoas.map((c) => c.matricula)).toEqual(["A", "C"]);
    expect(pessoas[0].pendenciaIds).toEqual(["a1", "a2"]);
    expect(pessoas[0].destino).toBe("pA@x.exemplo");
    const devagar = planejarCobrancas({ ...p, config: { ...CONFIG_PONTO_PADRAO, intervaloDias: 2 } }, HOJE).cobrancas;
    expect(devagar.filter((c) => c.nivel === "pessoa").map((c) => c.matricula)).toEqual(["A"]);
  });

  test("pendência resolvida e colaborador inativo não são cobrados", () => {
    const p = dados({
      colaboradores: [col("A"), col("B", { ativo: false })],
      pendencias: [pend("a1", "A", "2026-11-17", { resolvidaEm: "2026-11-18" }), pend("b1", "B", "2026-11-17")],
    });
    expect(planejarCobrancas(p, HOJE).cobrancas).toEqual([]);
  });

  test("escala ao gestor uma vez, juntando a equipe", () => {
    const p = dados({
      colaboradores: [col("A"), col("C"), col("X")],
      pendencias: [
        pend("a1", "A", "2026-11-12", { cobrancas: 2, ultimaCobranca: "2026-11-18" }),
        pend("c1", "C", "2026-11-13", { cobrancas: 3, ultimaCobranca: "2026-11-18" }),
        pend("x1", "X", "2026-11-13", { cobrancas: 2, ultimaCobranca: "2026-11-18", escalada: true }),
      ],
    });
    const plano = planejarCobrancas(p, HOJE);
    const gestor = plano.cobrancas.filter((c) => c.nivel === "gestor");
    expect(gestor).toHaveLength(1);
    expect(gestor[0]).toMatchObject({ destino: "gestor@x.exemplo", matricula: null, pendenciaIds: ["a1", "c1"] });
    const depois = aplicarCobranca(p.pendencias, gestor[0], true, HOJE);
    expect(planejarCobrancas({ ...p, pendencias: depois }, HOJE).cobrancas.filter((c) => c.nivel === "gestor")).toEqual([]);
  });

  test("colaborador sem gestor vai para semGestor", () => {
    const p = dados({
      colaboradores: [col("A", { emailGestor: null })],
      pendencias: [pend("a1", "A", "2026-11-12", { cobrancas: 2, ultimaCobranca: "2026-11-17" })],
    });
    const plano = planejarCobrancas(p, HOJE);
    expect(plano.semGestor).toEqual(["A"]);
    expect(plano.cobrancas.map((c) => c.nivel)).toEqual(["pessoa"]);
  });
});

describe("aplicarCobranca", () => {
  const pendencias = [pend("a1", "A", "2026-11-17"), pend("a2", "A", "2026-11-18", { cobrancas: 1, ultimaCobranca: "2026-11-18" })];
  const cobranca = { nivel: "pessoa" as const, destino: "pA@x.exemplo", matricula: "A", pendenciaIds: ["a1", "a2"], mensagem: { assunto: "", texto: "" } };

  test("cobrança com sucesso soma e marca a data", () => {
    const r = aplicarCobranca(pendencias, cobranca, true, HOJE);
    expect(r.map((p) => [p.cobrancas, p.ultimaCobranca])).toEqual([[1, HOJE], [2, HOJE]]);
  });

  test("falha não conta como cobrança", () => {
    expect(aplicarCobranca(pendencias, cobranca, false, HOJE)).toEqual(pendencias);
  });
});

describe("mensagens", () => {
  test("mensagem da pessoa", () => {
    const m = mensagemPessoa(
      col("1", { nome: "Ana Souza" }),
      [pend("p1", "1", "2026-11-03"), pend("p2", "1", "2026-11-05", { tipo: "incompleta" })],
      HOJE, "RH",
    );
    expect(m.assunto).toBe("Ponto: 2 dias para revisar");
    expect(m.texto).toContain("Olá, Ana.");
    expect(m.texto).toContain("Encontramos 2 dias no seu ponto que precisam de revisão:");
    expect(m.texto).toContain("- 03/11 (ter): sem marcação");
    expect(m.texto).toContain("- 05/11 (qui): marcação incompleta");
    expect(m.texto).toContain("Por favor, ajuste no Senior até 20/11. Se já ajustou, desconsidere esta mensagem.");
    expect(m.texto).toContain("Obrigado,\nRH");
    const um = mensagemPessoa(col("1"), [pend("p1", "1", "2026-11-03")], HOJE, "RH");
    expect(um.assunto).toBe("Ponto: 1 dia para revisar");
    expect(um.texto).toContain("Encontramos 1 dia no seu ponto que precisa de revisão:");
  });

  test("nome em maiúsculas do Senior vira só a inicial maiúscula", () => {
    expect(mensagemPessoa(col("1", { nome: "LUIZA DA SILVA" }), [pend("p1", "1", "2026-11-03")], HOJE, "RH").texto).toContain("Olá, Luiza.");
    expect(mensagemPessoa(col("1", { nome: "ana souza" }), [pend("p1", "1", "2026-11-03")], HOJE, "RH").texto).toContain("Olá, Ana.");
  });

  test("mensagem do gestor", () => {
    const m = mensagemGestor([{ colaborador: col("1", { nome: "Ana Souza" }), pendencias: [pend("p1", "1", "2026-11-03", { cobrancas: 2 })] }], 2, "RH");
    expect(m.assunto).toBe("Ponto da equipe: 1 pessoa com pendência");
    expect(m.texto).toContain("mesmo depois de 2 lembretes");
    expect(m.texto).toContain("- Ana Souza: 03/11 (2 lembretes)");
    expect(m.texto).toContain("Pode reforçar com elas? O ajuste é feito no Senior.");
  });
});

test("proximoDiaUtil pula o fim de semana", () => {
  expect(proximoDiaUtil("2026-11-20")).toBe("2026-11-23");
  expect(proximoDiaUtil(HOJE)).toBe("2026-11-20");
});
