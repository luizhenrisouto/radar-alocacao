import { describe, expect, test, vi } from "vitest";
import { GABARITO_SINAIS } from "../../../src/demo/gabarito-sinais";
import { avaliarClassificacao } from "../../../src/regras/avaliacao";
import type { TipoSinal } from "../../../src/regras/tipos";
import type { ClienteIa } from "./explicar.ts";
import type { Manchete } from "./rss.ts";
import {
  atenderSinais, buscarSinais, classificarManchetes, classificarPorRegra, GRAVIDADE_POR_TIPO, TIPOS_SINAL, urlBusca,
  type DependenciasSinais, type NovoSinal,
} from "./sinais.ts";

describe("classificarPorRegra", () => {
  test.each([
    ["Empresa X demite 200 funcionários", "corte"],
    ["Empresa X registra prejuízo no trimestre", "resultado_ruim"],
    ["Empresa X adquire concorrente do Paraná", "fusao"],
    ["Empresa X anuncia novo CEO", "troca_diretoria"],
    ["Empresa X congela contratações em 2027", "congelamento"],
    ["Empresa X inaugura centro de tecnologia", "expansao"],
  ] as [string, TipoSinal][])("%s → %s", (titulo, tipo) => {
    expect(classificarPorRegra(titulo)).toEqual({ tipo, gravidade: GRAVIDADE_POR_TIPO[tipo] });
  });

  test("manchete neutra é irrelevante", () => {
    expect(classificarPorRegra("Empresa X patrocina festival de música")).toEqual({ tipo: "irrelevante", gravidade: 0 });
  });

  test("suspender contratações é congelamento, não expansão", () => {
    expect(classificarPorRegra("Empresa X suspende contratações").tipo).toBe("congelamento");
  });
});

test("TIPOS_SINAL tem os mesmos tipos do app", () => {
  const tipos = TIPOS_SINAL satisfies readonly TipoSinal[];
  expect(new Set(tipos).size).toBe(7);
});

test("urlBusca monta a busca do Google Notícias", () => {
  expect(urlBusca("Banco Horizonte")).toBe(
    "https://news.google.com/rss/search?q=%22Banco%20Horizonte%22%20when%3A30d&hl=pt-BR&gl=BR&ceid=BR:pt-419",
  );
});

test("o gabarito tem 30 manchetes e pelo menos 3 de cada tipo", () => {
  expect(GABARITO_SINAIS).toHaveLength(30);
  for (const t of TIPOS_SINAL) expect(GABARITO_SINAIS.filter((g) => g.tipo === t).length, t).toBeGreaterThanOrEqual(3);
});

test("a regra acerta pelo menos 20 das 30 manchetes do gabarito", () => {
  const r = avaliarClassificacao(GABARITO_SINAIS, (t) => classificarPorRegra(t).tipo);
  expect(r.total).toBe(30);
  expect(r.acertos).toBeGreaterThanOrEqual(20);
});

// ——— Classificação com IA e busca por empresa ———

const m = (titulo: string, url: string, publicadoEm: string | null = "2026-11-20"): Manchete => ({ titulo, url, fonte: "Jornal", publicadoEm });
function iaQueResponde(itens: unknown[]): ClienteIa {
  return { messages: { create: vi.fn(async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ itens }) }] })) } };
}
const iaFora: ClienteIa = { messages: { create: async () => { throw new Error("fora"); } } };

describe("classificarManchetes", () => {
  const manchetes = [m("Banco X demite 100", "u1"), m("Banco X patrocina corrida", "u2")];

  test("classifica com a IA e mantém a ordem das manchetes", async () => {
    const ia = iaQueResponde([
      { indice: 1, tipo: "irrelevante", gravidade: 0, resumo: "Patrocínio." },
      { indice: 0, tipo: "corte", gravidade: 3, resumo: "Demissão de 100 pessoas." },
    ]);
    expect(await classificarManchetes(manchetes, { ia, modelo: "m" })).toEqual([
      { tipo: "corte", gravidade: 3, resumo: "Demissão de 100 pessoas.", origem: "ia" },
      { tipo: "irrelevante", gravidade: 0, resumo: "Patrocínio.", origem: "ia" },
    ]);
  });

  test("item com tipo fora da lista ou gravidade 5 cai para a regra, só nesse item", async () => {
    const ia = iaQueResponde([
      { indice: 0, tipo: "corte", gravidade: 5, resumo: "x" },
      { indice: 1, tipo: "fofoca", gravidade: 0, resumo: "y" },
    ]);
    const r = await classificarManchetes(manchetes, { ia, modelo: "m" });
    expect(r[0]).toEqual({ tipo: "corte", gravidade: 3, resumo: "Banco X demite 100", origem: "regra" });
    expect(r[1]).toEqual({ tipo: "irrelevante", gravidade: 0, resumo: "Banco X patrocina corrida", origem: "regra" });
    const parcial = await classificarManchetes(manchetes, { ia: iaQueResponde([{ indice: 0, tipo: "corte", gravidade: 3, resumo: "Corte." }]), modelo: "m" });
    expect(parcial.map((x) => x.origem)).toEqual(["ia", "regra"]);
  });

  test("IA fora do ar classifica tudo pela regra; lista vazia não chama a IA", async () => {
    expect((await classificarManchetes(manchetes, { ia: iaFora, modelo: "m" })).every((x) => x.origem === "regra")).toBe(true);
    const ia = iaQueResponde([]);
    expect(await classificarManchetes([], { ia, modelo: "m" })).toEqual([]);
    expect(ia.messages.create).not.toHaveBeenCalled();
  });
});

function rss(...itens: [string, string][]): string {
  return `<rss><channel>${itens.map(([t, u]) => `<item><title>${t}</title><link>${u}</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate></item>`).join("")}</channel></rss>`;
}

function dependencias(extra: Partial<DependenciasSinais> = {}) {
  const gravados: { empresaId: string; sinais: NovoSinal[] }[] = [];
  const deps: DependenciasSinais = {
    ia: iaFora, modelo: "m", hoje: "2026-11-24",
    buscarRss: vi.fn(async () => rss(["Banco X demite 100", "u1"], ["Banco X patrocina corrida", "u2"])),
    clientes: async () => [{ id: "cli1", nome: "Banco X", termoBusca: null }],
    salvasRecentes: vi.fn(async () => [] as { url: string; titulo: string }[]),
    gravar: vi.fn(async (empresaId: string, sinais: NovoSinal[]) => { gravados.push({ empresaId, sinais }); }),
    ...extra,
  };
  return { deps, gravados };
}
const doisClientes = async () => [{ id: "cli1", nome: "Banco X", termoBusca: null }, { id: "cli2", nome: "Banco Y", termoBusca: null }];

describe("buscarSinais", () => {
  test("grava as manchetes novas de cada cliente, com a data da notícia", async () => {
    const { deps, gravados } = dependencias();
    expect(await buscarSinais("e1", deps)).toEqual({ novos: 2 });
    expect(gravados[0].sinais[0]).toEqual({
      clienteId: "cli1", titulo: "Banco X demite 100", url: "u1", fonte: "", publicadoEm: "2026-11-20", tipo: "corte", gravidade: 3, resumo: "Banco X demite 100", origem: "regra",
    });
  });

  test("consulta só as notícias salvas dos últimos 35 dias (a busca cobre 30)", async () => {
    const { deps } = dependencias();
    await buscarSinais("e1", deps);
    expect(deps.salvasRecentes).toHaveBeenCalledWith("e1", "2026-10-20");
  });

  test("não reclassifica manchete com link já salvo", async () => {
    const ia = iaQueResponde([{ indice: 0, tipo: "irrelevante", gravidade: 0, resumo: "ok" }]);
    const { deps, gravados } = dependencias({ ia, salvasRecentes: async () => [{ url: "u1", titulo: "outra" }] });
    expect(await buscarSinais("e1", deps)).toEqual({ novos: 1 });
    expect(gravados[0].sinais.map((s) => s.url)).toEqual(["u2"]);
    const enviado = JSON.stringify((ia.messages.create as any).mock.calls[0][0].messages);
    expect(enviado).not.toContain("demite");
  });

  test("manchete com o mesmo título de uma já salva não grava de novo, mesmo com outro link", async () => {
    const { deps } = dependencias({ salvasRecentes: async () => [{ url: "outro-veiculo", titulo: "Banco X DEMITE 100" }] });
    expect(await buscarSinais("e1", deps)).toEqual({ novos: 1 });
  });

  test("a mesma manchete de veículos diferentes conta uma vez", async () => {
    const { deps, gravados } = dependencias({
      buscarRss: async () => rss(["Banco X demite 100", "u1"], ["Banco X demite 100", "u7"], ["Banco X demite 100", "u1"]),
    });
    expect(await buscarSinais("e1", deps)).toEqual({ novos: 1 });
    expect(gravados[0].sinais.map((s) => s.url)).toEqual(["u1"]);
  });

  test("sem manchete nova não chama a IA nem grava", async () => {
    const ia = iaQueResponde([]);
    const { deps } = dependencias({ ia, salvasRecentes: async () => [{ url: "u1", titulo: "a" }, { url: "u2", titulo: "b" }] });
    expect(await buscarSinais("e1", deps)).toEqual({ novos: 0 });
    expect(ia.messages.create).not.toHaveBeenCalled();
    expect(deps.gravar).not.toHaveBeenCalled();
  });

  test("manchete repetida entre clientes da mesma busca grava uma vez, e cada cliente grava o seu", async () => {
    const { deps, gravados } = dependencias({ clientes: doisClientes });
    expect(await buscarSinais("e1", deps)).toEqual({ novos: 2 });
    expect(gravados).toHaveLength(1);
    expect(gravados[0].sinais.map((s) => s.url)).toEqual(["u1", "u2"]);
  });

  test("grava por cliente: a falha ao gravar um não perde o outro", async () => {
    const buscarRss = vi.fn(async (url: string) => (url.includes("Banco%20X") ? rss(["Banco X demite 100", "u1"]) : rss(["Banco Y inaugura sede", "u9"])));
    const gravar = vi.fn(async (_e: string, s: NovoSinal[]) => { if (s[0].clienteId === "cli1") throw new Error("banco fora"); });
    const { deps } = dependencias({ buscarRss, gravar, clientes: doisClientes });
    expect(await buscarSinais("e1", deps)).toEqual({ novos: 1 });
    expect(gravar).toHaveBeenCalledTimes(2);
  });

  test("usa o termo de busca quando o cliente tem um", async () => {
    const { deps } = dependencias({ clientes: async () => [{ id: "cli5", nome: "Energia Pampa", termoBusca: "Pampa Energia S.A." }] });
    await buscarSinais("e1", deps);
    expect(deps.buscarRss).toHaveBeenCalledWith(urlBusca("Pampa Energia S.A."));
  });

  test("falha no RSS de um cliente não impede os outros", async () => {
    const buscarRss = vi.fn(async (url: string) => {
      if (url.includes("Banco%20X")) throw new Error("timeout");
      return rss(["Banco Y inaugura sede", "u9"]);
    });
    const { deps } = dependencias({ buscarRss, clientes: doisClientes });
    expect(await buscarSinais("e1", deps)).toEqual({ novos: 1 });
  });

  test("sem data na notícia, vale hoje; no máximo 10 manchetes por cliente", async () => {
    const muitas = Array.from({ length: 12 }, (_, i) => `<item><title>Notícia ${i}</title><link>u${i}</link></item>`).join("");
    const { deps, gravados } = dependencias({ buscarRss: async () => `<rss>${muitas}</rss>` });
    expect(await buscarSinais("e1", deps)).toEqual({ novos: 10 });
    expect(gravados[0].sinais[0].publicadoEm).toBe("2026-11-24");
  });
});

describe("atenderSinais", () => {
  const negado = { status: 403, corpo: { erro: "acesso" } };

  test("sem login e sem chave certa responde 403", async () => {
    const { deps } = dependencias();
    expect(await atenderSinais({ empresaDoUsuario: null, chaveRecebida: null, chaveEsperada: "segredo", empresaPedida: "e1" }, deps)).toEqual(negado);
    expect(await atenderSinais({ empresaDoUsuario: null, chaveRecebida: "errada", chaveEsperada: "segredo", empresaPedida: "e1" }, deps)).toEqual(negado);
    expect(await atenderSinais({ empresaDoUsuario: null, chaveRecebida: "", chaveEsperada: null, empresaPedida: "e1" }, deps)).toEqual(negado);
  });

  test("agendamento (chave certa) roda só para a empresa pedida", async () => {
    const { deps, gravados } = dependencias();
    expect(await atenderSinais({ empresaDoUsuario: null, chaveRecebida: "segredo", chaveEsperada: "segredo", empresaPedida: "e2" }, deps))
      .toEqual({ status: 200, corpo: { novos: 2 } });
    expect(gravados.map((g) => g.empresaId)).toEqual(["e2"]);
  });

  test("agendamento sem empresa no pedido responde 422 e não busca nada", async () => {
    const { deps } = dependencias();
    expect(await atenderSinais({ empresaDoUsuario: null, chaveRecebida: "segredo", chaveEsperada: "segredo", empresaPedida: null }, deps))
      .toEqual({ status: 422, corpo: { erro: "pedido" } });
    expect(deps.buscarRss).not.toHaveBeenCalled();
  });

  test("logado roda só para a própria empresa, mesmo pedindo outra", async () => {
    const { deps, gravados } = dependencias();
    expect(await atenderSinais({ empresaDoUsuario: "e2", chaveRecebida: null, chaveEsperada: "segredo", empresaPedida: "e1" }, deps))
      .toEqual({ status: 200, corpo: { novos: 2 } });
    expect(gravados.map((g) => g.empresaId)).toEqual(["e2"]);
  });
});
