import { expect, test } from "vitest";
import { gerarNexo } from "../demo/nexo";
import { rankearCandidatos, rankearParaVaga } from "./matching";
import {
  anonimo, citaSoSkills, emailPorRegra, encaixesPorPessoa, extrairVagaPorRegra, leadsDeMercado, perfilPorRegra, proibidosDe, setoresDe, skillsConhecidas,
} from "./mercado";
import type { DadosEmpresa, VagaExterna } from "./tipos";

const HOJE = "2026-11-24";
const nexo = gerarNexo(HOJE);
const TEXTO = "Buscamos QA Sênior\nPlaywright, Type Script e REST Assured. Desejável k6.";

function externa(id: string, empresaAlvo: string, skills: string[], extra: Partial<VagaExterna> = {}): VagaExterna {
  return {
    id, empresaAlvo, titulo: `Vaga ${id}`, senioridade: "senior", skillsObrigatorias: skills, skillsDesejaveis: [], cidade: null, remoto: true,
    url: null, inicioPrevisto: "2026-12-24", origem: "regra", criadaEm: HOJE, ...extra,
  };
}
const comExternas = (...vagasExternas: VagaExterna[]): DadosEmpresa => ({ ...nexo, vagasExternas });

test("rankearParaVaga dá o mesmo resultado que rankearCandidatos", () => {
  const v03 = nexo.vagas.find((v) => v.id === "v03")!;
  expect(rankearParaVaga(nexo, v03, HOJE)).toEqual(rankearCandidatos(nexo, "v03", HOJE));
});

test("extrairVagaPorRegra acha as skills conhecidas do texto e a senioridade", () => {
  const r = extrairVagaPorRegra(TEXTO, ["Playwright", "TypeScript", "Rest Assured", "k6", "Java"]);
  expect(r).toEqual({
    empresaAlvo: "", titulo: "Buscamos QA Sênior", senioridade: "senior", skillsObrigatorias: ["Playwright", "TypeScript", "Rest Assured", "k6"],
    skillsDesejaveis: [], cidade: null, remoto: false,
  });
});

test("sem palavra de senioridade a regra usa pleno; Jr vira júnior; remoto é reconhecido", () => {
  expect(extrairVagaPorRegra("Dev Python\nTrabalho 100% remoto", ["Python"]).senioridade).toBe("pleno");
  expect(extrairVagaPorRegra("Dev Python\nTrabalho 100% remoto", ["Python"]).remoto).toBe(true);
  expect(extrairVagaPorRegra("Analista Jr de dados, PL/SQL", ["PL/SQL"]).senioridade).toBe("junior");
});

test("skillsConhecidas junta consultores e vagas sem repetir grafias", () => {
  const s = skillsConhecidas(nexo);
  expect(s.filter((x) => x.toLowerCase() === "java")).toEqual(["Java"]);
  expect(s).toContain("Saúde Suplementar");
});

test("leadsDeMercado agrupa por empresa e ordena por quantas pessoas encaixam", () => {
  const d = comExternas(
    externa("x1", "Clínica Alfa", ["Playwright", "TypeScript"]),
    externa("x2", "Rede Beta", ["Cobol"]),
    externa("x3", "Rede Beta", ["Cobol"]),
  );
  const leads = leadsDeMercado(d, HOJE);
  expect(leads.map((l) => l.empresa)).toEqual(["Clínica Alfa"]);
  expect(leads[0].pessoas.map((p) => p.nome)).toContain("Ana Ribeiro");
});

test("custo parado do lead soma o custo mensal de quem encaixa", () => {
  const [lead] = leadsDeMercado(comExternas(externa("x1", "Clínica Alfa", ["Playwright", "TypeScript"])), HOJE);
  expect(lead.custoMensalParado).toBe(lead.pessoas.reduce((s, p) => s + p.custoMensal, 0));
  expect(lead.vagas).toHaveLength(1);
});

test("encaixesPorPessoa lista quem está no bench ou sai em 60 dias, com as vagas externas onde está no top 3", () => {
  const r = encaixesPorPessoa(comExternas(externa("x1", "Clínica Alfa", ["Playwright", "TypeScript"])), HOJE);
  const ana = r.find((e) => e.consultor.id === "c01");
  expect(ana?.vagas.map((v) => v.id)).toEqual(["x1"]);
  expect(r.some((e) => e.consultor.id === "c10")).toBe(false);
  expect(r.some((e) => e.consultor.id === "c40")).toBe(true);
});

test("setoresDe usa o setor dos clientes onde a pessoa trabalhou, sem repetir", () => {
  const d: DadosEmpresa = {
    ...nexo,
    alocacoes: [...nexo.alocacoes, { id: "extra", consultorId: "c01", clienteId: "cli8", inicio: "2024-01-01", fim: "2024-12-31", valorHora: 150, status: "encerrada" }],
  };
  expect(setoresDe(d, "c01")).toEqual(["Saúde"]);
  expect(setoresDe(nexo, "c40")).toEqual([]);
});

test("perfilPorRegra não cita nome, e-mail nem cliente", () => {
  const c01 = nexo.consultores.find((c) => c.id === "c01")!;
  const p = perfilPorRegra(c01, setoresDe(nexo, "c01"));
  expect(p.origem).toBe("regra");
  expect(p.resumo).toContain("Saúde");
  expect(p.resumo).toContain("Playwright");
  expect(p.resumo.length).toBeLessThanOrEqual(400);
  expect(anonimo([p.titulo, p.resumo, ...p.destaques], proibidosDe(nexo, c01))).toBe(true);
});

test("anonimo recusa nome, e-mail e cliente e aceita palavra que só contém o nome", () => {
  const ana = proibidosDe(nexo, nexo.consultores.find((c) => c.id === "c01")!);
  const thais = proibidosDe(nexo, nexo.consultores.find((c) => c.id === "c39")!);
  expect(anonimo(["Ana tem experiência em testes"], ana)).toBe(false);
  expect(anonimo(["Contato: ana.ribeiro@nexo.exemplo"], ana)).toBe(false);
  expect(anonimo(["Thais lidera o front-end"], thais)).toBe(false);
  expect(anonimo(["Trabalhou na Cooperativa Saúde Sul"], ana)).toBe(false);
  expect(anonimo(["Faz análise de requisitos", "Experiência em saúde"], ana)).toBe(true);
});

test("emailPorRegra cita as vagas e os títulos dos perfis e nenhum nome", () => {
  const d = comExternas(externa("x1", "Clínica Alfa", ["Playwright", "TypeScript"], { titulo: "QA Sênior" }));
  const [lead] = leadsDeMercado(d, HOJE);
  const perfis = lead.pessoas.map((p) => perfilPorRegra(p, setoresDe(d, p.id)));
  const e = emailPorRegra(lead, perfis, "Nexo Consultoria");
  expect(e.origem).toBe("regra");
  expect(e.corpo).toContain("QA Sênior");
  expect(e.corpo).toContain(perfis[0].titulo);
  expect(e.corpo).toContain("Nexo Consultoria");
  expect(anonimo([e.assunto, e.corpo], lead.pessoas.flatMap((p) => proibidosDe(d, p)))).toBe(true);
});

test("citaSoSkills recusa texto que cita skill conhecida fora das permitidas, sem confiar na lista da IA", () => {
  const conhecidas = skillsConhecidas(nexo);
  expect(citaSoSkills(["Automação com Playwright e TypeScript."], conhecidas, ["Playwright", "TypeScript"])).toBe(true);
  expect(citaSoSkills(["Domina Playwright e Kubernetes."], conhecidas, ["Playwright", "TypeScript"])).toBe(false);
  expect(citaSoSkills(["Trabalha com REST Assured."], conhecidas, ["Rest Assured"])).toBe(true);
});
