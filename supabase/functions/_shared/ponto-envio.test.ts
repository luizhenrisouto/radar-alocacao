import { describe, expect, test, vi } from "vitest";
import { CONFIG_PONTO_PADRAO, type ColaboradorPonto, type ConfigPonto, type Pendencia } from "./ponto.ts";
import { atenderPonto, cobrarEmpresa, enviarTeste, type DependenciasPonto } from "./ponto-envio.ts";

const HOJE = "2026-11-19";
const col = (m: string): ColaboradorPonto => ({ matricula: m, nome: `Pessoa ${m}`, email: `p${m}@x.exemplo`, emailGestor: "gestor@x.exemplo", ativo: true });
const pend = (id: string, m: string, extra: Partial<Pendencia> = {}): Pendencia => ({
  id, matricula: m, data: "2026-11-17", tipo: "sem_marcacao", abertaEm: "2026-11-18", resolvidaEm: null, cobrancas: 0, ultimaCobranca: null, escalada: false, ...extra,
});

/** Banco em memória: carregar devolve o estado; gravar atualiza as pendências e guarda os envios. */
function dependencias(extra: { config?: Partial<ConfigPonto>; teamsUrl?: string | null; pendencias?: Pendencia[]; falharEmail?: (destino: string) => boolean; falharTeams?: boolean } = {}) {
  const estado = {
    colaboradores: [col("A"), col("B")],
    pendencias: extra.pendencias ?? [pend("a1", "A"), pend("b1", "B")],
    envios: [] as unknown[],
  };
  const emails: { destino: string; assunto: string; remetente: string }[] = [];
  const teams: { url: string; destino: string }[] = [];
  let rodando = false;
  const deps: DependenciasPonto = {
    hoje: HOJE,
    async iniciarRodada() {
      if (rodando) return false;
      rodando = true;
      return true;
    },
    terminarRodada: vi.fn(async () => { rodando = false; }),
    agora: () => `${HOJE}T12:00:00.000Z`,
    async carregar() {
      return {
        colaboradores: estado.colaboradores, pendencias: estado.pendencias,
        config: { ...CONFIG_PONTO_PADRAO, ...extra.config }, teamsUrl: extra.teamsUrl === undefined ? null : extra.teamsUrl,
      };
    },
    async enviarEmail(destino, m, remetente) {
      if (extra.falharEmail?.(destino)) throw new Error("resend 422");
      emails.push({ destino, assunto: m.assunto, remetente });
    },
    async enviarTeams(url, destino) {
      if (extra.falharTeams) throw new Error("teams 500");
      teams.push({ url, destino });
    },
    gravar: vi.fn(async (_empresa: string, envios: unknown[], mudadas: Pendencia[]) => {
      estado.envios.push(...envios);
      const porId = new Map(mudadas.map((p) => [p.id, p]));
      estado.pendencias = estado.pendencias.map((p) => porId.get(p.id) ?? p);
    }),
  };
  return { deps, estado, emails, teams };
}

describe("cobrarEmpresa", () => {
  test("cobra pelos canais ativos e grava os envios", async () => {
    const { deps, estado, emails, teams } = dependencias({ config: { teamsAtivo: true }, teamsUrl: "https://fluxo.exemplo/x" });
    expect(await cobrarEmpresa("e1", deps)).toEqual({ enviados: 4, falhas: 0 });
    expect(emails.map((e) => e.destino)).toEqual(["pA@x.exemplo", "pB@x.exemplo"]);
    expect(emails[0]).toMatchObject({ assunto: "Ponto: 1 dia para revisar", remetente: "RH" });
    expect(teams).toEqual([{ url: "https://fluxo.exemplo/x", destino: "pA@x.exemplo" }, { url: "https://fluxo.exemplo/x", destino: "pB@x.exemplo" }]);
    expect(estado.envios).toHaveLength(4);
    expect(estado.envios[0]).toMatchObject({ matricula: "A", destino: "pA@x.exemplo", canal: "email", nivel: "pessoa", ok: true, erro: null, enviadoEm: `${HOJE}T12:00:00.000Z` });
    expect(estado.pendencias.map((p) => [p.cobrancas, p.ultimaCobranca])).toEqual([[1, HOJE], [1, HOJE]]);
    expect(deps.gravar).toHaveBeenCalledTimes(2);
  });

  test("grava cada cobrança logo depois de enviar", async () => {
    const { deps, estado } = dependencias();
    deps.enviarEmail = async (destino) => { if (destino === "pB@x.exemplo") throw new Error("função encerrada"); };
    deps.gravar = vi.fn(async (_e: string, envios: unknown[], mudadas: Pendencia[]) => {
      estado.envios.push(...envios);
      const porId = new Map(mudadas.map((p) => [p.id, p]));
      estado.pendencias = estado.pendencias.map((p) => porId.get(p.id) ?? p);
    });
    await cobrarEmpresa("e1", deps);
    const [primeira] = (deps.gravar as ReturnType<typeof vi.fn>).mock.calls;
    expect(primeira[1]).toEqual([expect.objectContaining({ destino: "pA@x.exemplo", ok: true })]);
    expect(primeira[2]).toEqual([expect.objectContaining({ id: "a1", cobrancas: 1 })]);
  });

  test("duas rodadas ao mesmo tempo não lembram duas vezes", async () => {
    const { deps, emails } = dependencias();
    const [um, dois] = await Promise.all([cobrarEmpresa("e1", deps), cobrarEmpresa("e1", deps)]);
    expect(emails).toHaveLength(2);
    expect([um, dois]).toContainEqual({ enviados: 0, falhas: 0, ocupado: true });
  });

  test("a rodada é liberada mesmo se gravar falhar", async () => {
    const { deps } = dependencias();
    deps.gravar = async () => { throw new Error("banco fora"); };
    await expect(cobrarEmpresa("e1", deps)).rejects.toThrow("banco fora");
    expect(deps.terminarRodada).toHaveBeenCalledWith("e1");
  });

  test("falha num envio não para os outros e não conta", async () => {
    const { deps, estado } = dependencias({ falharEmail: (d) => d === "pA@x.exemplo" });
    expect(await cobrarEmpresa("e1", deps)).toEqual({ enviados: 1, falhas: 1 });
    expect(estado.envios).toEqual([
      expect.objectContaining({ destino: "pA@x.exemplo", ok: false, erro: "resend 422" }),
      expect.objectContaining({ destino: "pB@x.exemplo", ok: true }),
    ]);
    expect(estado.pendencias.find((p) => p.id === "a1")!.cobrancas).toBe(0);
    expect(estado.pendencias.find((p) => p.id === "b1")!.cobrancas).toBe(1);
  });

  test("conta se pelo menos um canal enviou", async () => {
    const { deps, estado } = dependencias({ config: { teamsAtivo: true }, teamsUrl: "https://fluxo.exemplo/x", falharTeams: true });
    expect(await cobrarEmpresa("e1", deps)).toEqual({ enviados: 2, falhas: 2 });
    expect(estado.pendencias.every((p) => p.cobrancas === 1)).toBe(true);
  });

  test("Teams sem URL não é chamado", async () => {
    const { deps, teams } = dependencias({ config: { teamsAtivo: true }, teamsUrl: null });
    expect(await cobrarEmpresa("e1", deps)).toEqual({ enviados: 2, falhas: 0 });
    expect(teams).toEqual([]);
  });

  test("rodar duas vezes no mesmo dia não cobra de novo", async () => {
    const { deps, emails } = dependencias();
    await cobrarEmpresa("e1", deps);
    expect(await cobrarEmpresa("e1", deps)).toEqual({ enviados: 0, falhas: 0 });
    expect(emails).toHaveLength(2);
  });

  test("escala ao gestor e marca a pendência", async () => {
    const { deps, estado, emails } = dependencias({ pendencias: [pend("a1", "A", { cobrancas: 2, ultimaCobranca: "2026-11-18" })] });
    expect(await cobrarEmpresa("e1", deps)).toEqual({ enviados: 2, falhas: 0 });
    expect(emails.map((e) => e.destino)).toEqual(["pA@x.exemplo", "gestor@x.exemplo"]);
    expect(estado.envios[1]).toMatchObject({ matricula: null, nivel: "gestor" });
    expect(estado.pendencias[0]).toMatchObject({ cobrancas: 3, escalada: true });
  });

  test("erro longo é cortado em 200 caracteres", async () => {
    const { deps, estado } = dependencias({ pendencias: [pend("a1", "A")] });
    deps.enviarEmail = async () => { throw new Error("x".repeat(500)); };
    await cobrarEmpresa("e1", deps);
    expect((estado.envios[0] as { erro: string }).erro).toHaveLength(200);
  });
});

test("teste vai só para o e-mail logado e não mexe nas pendências", async () => {
  const { deps, emails, estado } = dependencias();
  await enviarTeste("e1", "rh@x.exemplo", deps);
  expect(emails).toEqual([expect.objectContaining({ destino: "rh@x.exemplo", assunto: "Ponto: 2 dias para revisar" })]);
  expect(deps.gravar).not.toHaveBeenCalled();
  expect(estado.pendencias.every((p) => p.cobrancas === 0)).toBe(true);
});

describe("atenderPonto", () => {
  const base = { empresaDoUsuario: null, emailDoUsuario: null, chaveRecebida: null, chaveEsperada: "segredo", empresaPedida: null, acao: undefined };

  test("autenticação: logado, agendamento, sem empresa, recusado", async () => {
    const { deps } = dependencias();
    expect(await atenderPonto({ ...base, empresaDoUsuario: "e1", emailDoUsuario: "rh@x.exemplo" }, deps)).toEqual({ status: 200, corpo: { enviados: 2, falhas: 0 } });
    expect((await atenderPonto({ ...base, chaveRecebida: "segredo", empresaPedida: "e1" }, dependencias().deps)).status).toBe(200);
    expect(await atenderPonto({ ...base, chaveRecebida: "segredo" }, deps)).toEqual({ status: 422, corpo: { erro: "pedido" } });
    expect(await atenderPonto({ ...base, chaveRecebida: "errada", empresaPedida: "e1" }, deps)).toEqual({ status: 403, corpo: { erro: "acesso" } });
    expect(await atenderPonto({ ...base, chaveEsperada: null, chaveRecebida: null, empresaPedida: "e1" }, deps)).toEqual({ status: 403, corpo: { erro: "acesso" } });
  });

  test("ação teste exige login e manda para o e-mail logado", async () => {
    const { deps, emails } = dependencias();
    expect(await atenderPonto({ ...base, empresaDoUsuario: "e1", emailDoUsuario: "rh@x.exemplo", acao: "teste" }, deps)).toEqual({ status: 200, corpo: { ok: true } });
    expect(emails.map((e) => e.destino)).toEqual(["rh@x.exemplo"]);
    expect((await atenderPonto({ ...base, chaveRecebida: "segredo", empresaPedida: "e1", acao: "teste" }, deps)).status).toBe(403);
  });
});
