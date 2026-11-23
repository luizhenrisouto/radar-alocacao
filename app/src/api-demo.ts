/** Modo demonstração: a Nexo Consultoria, fictícia, gerada em memória. Pública, só leitura, sem rede. */
import { gerarNexo } from "../../src/demo/nexo";
import { pontoNexo } from "../../src/demo/ponto-nexo";
import { aplicarCobranca, planejarCobrancas, type EnvioPonto } from "../../supabase/functions/_shared/ponto.ts";
import { aplicarCorte } from "../../src/regras/corte";
import perfisNexo from "../../src/demo/perfis-nexo.json";
import type { Perfil } from "../../src/regras/mercado";
import { hojeSaoPaulo } from "../../src/regras/datas";
import type { Api } from "./api";

export function apiDemo(hoje: string = hojeSaoPaulo()): Api {
  // Mutável: o corte registrado na demonstração vale até recarregar a página.
  let dados = gerarNexo(hoje);
  let seq = 0;
  let ponto = pontoNexo(hoje);
  const soLeitura = () => Promise.reject(new Error("Entre com sua conta para usar esta função."));
  return {
    modo: "demo",
    sessao: async () => null,
    entrar: soLeitura,
    sair: async () => {},
    dados: async () => dados,
    explicar: soLeitura,
    importar: soLeitura,
    async registrarCorte(c) {
      const { dados: depois, cortadas } = aplicarCorte(dados, c);
      const pessoas = new Set(cortadas.map((a) => a.consultorId));
      dados = { ...depois, matches: depois.matches.filter((m) => !pessoas.has(m.consultorId)) };
      return { encerradas: cortadas.length };
    },
    // Sem IA na demonstração pública: colar vaga e e-mail usam a regra; os perfis da Nexo vêm já gerados.
    extrairVaga: async () => null,
    async salvarVagaExterna(v) {
      seq += 1;
      dados = { ...dados, vagasExternas: [...dados.vagasExternas, { ...v, id: `vx${seq}`, criadaEm: hoje }] };
    },
    async apagarVagaExterna(id) {
      dados = { ...dados, vagasExternas: dados.vagasExternas.filter((v) => v.id !== id) };
    },
    async perfilAnonimo(c) {
      const p = (perfisNexo as Record<string, Omit<Perfil, "origem">>)[c.id];
      return p ? { ...p, origem: "ia" } : null;
    },
    rascunhoEmail: async () => null,
    buscarSinais: () => Promise.reject(new Error("Entre com sua conta para buscar notícias.")),
    ponto: async () => ponto,
    async cobrarPonto() {
      // Simula a rodada de hoje: mesma regra da função real, sem enviar nada.
      const canais = [...(ponto.config.emailAtivo ? ["email" as const] : []), ...(ponto.config.teamsAtivo ? ["teams" as const] : [])];
      const envios: EnvioPonto[] = [];
      let pendencias = ponto.pendencias;
      for (const c of planejarCobrancas(ponto, hoje).cobrancas) {
        for (const canal of canais) {
          seq += 1;
          envios.push({
            id: `sim${seq}`, matricula: c.matricula, destino: c.destino, canal, nivel: c.nivel, assunto: c.mensagem.assunto,
            enviadoEm: `${hoje}T${new Date().toISOString().slice(11)}`, ok: true, erro: null, simulado: true,
          });
        }
        if (canais.length) pendencias = aplicarCobranca(pendencias, c, true, hoje);
      }
      ponto = { ...ponto, pendencias, envios: [...ponto.envios, ...envios] };
      return { enviados: envios.length, falhas: 0 };
    },
    testarEnvioPonto: soLeitura,
    async acertarPendencia(id) {
      ponto = { ...ponto, pendencias: ponto.pendencias.map((p) => (p.id === id && p.resolvidaEm == null ? { ...p, resolvidaEm: hoje } : p)) };
    },
    salvarConfigPonto: soLeitura,
  };
}
