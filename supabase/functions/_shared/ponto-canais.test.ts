import { describe, expect, test, vi } from "vitest";
import { comLimite, enviarResend, postarTeams } from "./ponto-canais.ts";

const MSG = { assunto: "Ponto: 1 dia para revisar", texto: "Olá, Ana." };
const resposta = (status: number) => new Response("{}", { status });

describe("enviarResend", () => {
  test("monta a chamada do Resend", async () => {
    const fetchFn = vi.fn(async () => resposta(200));
    await enviarResend(fetchFn, { chave: "re_123", de: "ponto@datum.exemplo" }, "ana@x.exemplo", MSG, "RH");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_123");
    expect(JSON.parse(init.body as string)).toEqual({ from: '"RH" <ponto@datum.exemplo>', to: ["ana@x.exemplo"], subject: MSG.assunto, text: MSG.texto });
  });

  test("remetente com vírgula ou sinais não quebra o e-mail", async () => {
    const fetchFn = vi.fn(async () => resposta(200));
    await enviarResend(fetchFn, { chave: "k", de: "ponto@datum.exemplo" }, "ana@x.exemplo", MSG, 'Datum, RH <"x">');
    expect(JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).from).toBe('"Datum, RH x" <ponto@datum.exemplo>');
  });

  test("sem chave ou remetente avisa a configuração", async () => {
    await expect(enviarResend(vi.fn(), { chave: undefined, de: "x@y" }, "a@b", MSG, "RH")).rejects.toThrow("e-mail não configurado");
  });

  test("status de erro vira resend <status>", async () => {
    await expect(enviarResend(async () => resposta(429), { chave: "k", de: "x@y" }, "a@b", MSG, "RH")).rejects.toThrow("resend 429");
  });
});

describe("postarTeams", () => {
  test("posta destinatário, assunto e texto", async () => {
    const fetchFn = vi.fn(async () => resposta(202));
    await postarTeams(fetchFn, "https://fluxo.exemplo/abc?sig=SEGREDO", "ana@x.exemplo", MSG);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://fluxo.exemplo/abc?sig=SEGREDO");
    expect(JSON.parse(init.body as string)).toEqual({ destinatario: "ana@x.exemplo", assunto: MSG.assunto, texto: MSG.texto });
  });

  test("erro de rede não expõe a URL do fluxo", async () => {
    const fetchFn = async () => { throw new TypeError("error sending request for url (https://fluxo.exemplo/abc?sig=SEGREDO)"); };
    const erro = await postarTeams(fetchFn, "https://fluxo.exemplo/abc?sig=SEGREDO", "a@b", MSG).catch((e: Error) => e.message);
    expect(erro).toBe("teams: falha de rede");
  });

  test("status de erro vira teams <status>", async () => {
    await expect(postarTeams(async () => resposta(500), "https://f", "a@b", MSG)).rejects.toThrow("teams 500");
  });
});

describe("comLimite", () => {
  test("espera entre envios e tenta de novo uma vez em 429", async () => {
    const esperas: number[] = [];
    let tentativas = 0;
    const enviar = comLimite(async () => {
      tentativas++;
      if (tentativas === 2) throw new Error("resend 429");
    }, { intervaloMs: 600, esperar: async (ms) => { esperas.push(ms); } });
    await enviar();
    await enviar();
    expect(tentativas).toBe(3);
    expect(esperas).toEqual([600, 1500]);
  });

  test("outro erro não é repetido", async () => {
    const fn = vi.fn(async () => { throw new Error("resend 422"); });
    await expect(comLimite(fn, { intervaloMs: 0, esperar: async () => {} })()).rejects.toThrow("resend 422");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
