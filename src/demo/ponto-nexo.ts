/**
 * Ponto da Nexo Consultoria (fictício): as pessoas CLT, 10 dias úteis antes de hoje, com algumas pendências,
 * uma escalada ao gestor, duas acertadas e uma pessoa de férias. Determinístico e relativo a hoje.
 */
import {
  CONFIG_PONTO_PADRAO, proximoDiaUtil, sincronizarPendencias,
  type ColaboradorPonto, type DadosPonto, type DiaPonto, type EnvioPonto, type Pendencia, type TipoPendencia,
} from "../../supabase/functions/_shared/ponto.ts";
import { somarDias } from "../regras/datas";
import { gerarNexo } from "./nexo";

const matriculaDe = (id: string) => String(1000 + Number(id.slice(1)));
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/)[0];

/** Os n dias úteis antes de hoje: [1º antes de hoje, 2º, ...]. */
function diasUteisAntes(hoje: string, n: number): string[] {
  const dias: string[] = [];
  for (let d = somarDias(hoje, -1); dias.length < n; d = somarDias(d, -1)) {
    const semana = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (semana >= 1 && semana <= 5) dias.push(d);
  }
  return dias;
}

// Exceções por pessoa: [n-ésimo dia útil antes de hoje, marcações] (0 = sem marcação, 3 = incompleta).
const EXCECOES: Record<string, [number, 0 | 3][]> = {
  c02: [[2, 0]], c05: [[3, 3]], c09: [[4, 0], [6, 3]], c12: [[2, 3]], c14: [[7, 0]],
};

export function pontoNexo(hoje: string): DadosPonto {
  const nexo = gerarNexo(hoje);
  const dia = diasUteisAntes(hoje, 10);
  const n = (k: number) => dia[k - 1];
  const clienteDe = (id: string) => {
    const a = nexo.alocacoes.filter((x) => x.consultorId === id).sort((x, y) => y.inicio.localeCompare(x.inicio))[0];
    return a ? nexo.clientes.find((c) => c.id === a.clienteId)?.nome ?? null : null;
  };

  const clt = nexo.consultores.filter((c) => c.regime === "CLT");
  const colaboradores: ColaboradorPonto[] = clt.map((c) => {
    const cliente = clienteDe(c.id);
    return {
      matricula: matriculaDe(c.id), nome: c.nome, email: c.email, ativo: true,
      emailGestor: c.id === "c40" ? null : cliente ? `lideranca.${slug(cliente)}@nexo.exemplo` : "rh@nexo.exemplo",
    };
  });

  const dias: DiaPonto[] = [];
  for (const c of clt) {
    const m = matriculaDe(c.id);
    const minuto = String(Number(c.id.slice(1)) % 10);
    const completo = [`08:0${minuto}`, "12:00", "13:00", `17:5${minuto}`];
    for (let k = 1; k <= 10; k++) {
      if (c.id === "c31") { dias.push({ matricula: m, data: n(k), marcacoes: [], situacao: "Férias" }); continue; }
      const excecao = EXCECOES[c.id]?.find(([dk]) => dk === k);
      const marcacoes = excecao ? completo.slice(0, excecao[1]) : completo;
      dias.push({ matricula: m, data: n(k), marcacoes, situacao: null });
    }
  }

  const id = (m: string, data: string) => `pn-${m}-${data}`;
  const abertas: Pendencia[] = sincronizarPendencias(dias, colaboradores, [], hoje).abrir.map((a) => ({
    ...a, id: id(a.matricula, a.data), abertaEm: n(1), resolvidaEm: null, cobrancas: 0, ultimaCobranca: null, escalada: false,
  }));
  // Otávio (c14) já foi lembrado 3 vezes e o gestor foi avisado no último dia útil.
  const otavio = matriculaDe("c14");
  const pendencias = abertas.map((p) =>
    p.matricula === otavio ? { ...p, abertaEm: n(6), cobrancas: 3, ultimaCobranca: n(1), escalada: true } : p,
  );
  const resolvida = (cid: string, k: number, tipo: TipoPendencia, cobradaEm: number, resolvidaEm: number): Pendencia => ({
    id: id(matriculaDe(cid), n(k)), matricula: matriculaDe(cid), data: n(k), tipo, abertaEm: proximoDiaUtil(n(k)),
    resolvidaEm: n(resolvidaEm), cobrancas: 1, ultimaCobranca: n(cobradaEm), escalada: false,
  });
  pendencias.push(resolvida("c20", 8, "sem_marcacao", 4, 2), resolvida("c13", 9, "incompleta", 5, 3));

  const colab = (cid: string) => colaboradores.find((c) => c.matricula === matriculaDe(cid))!;
  let seq = 0;
  const envio = (cid: string | null, destino: string, nivel: "pessoa" | "gestor", assunto: string, k: number): EnvioPonto => ({
    id: `en${++seq}`, matricula: cid ? matriculaDe(cid) : null, destino, canal: "email", nivel, assunto,
    enviadoEm: `${n(k)}T12:00:00.000Z`, ok: true, erro: null, simulado: false,
  });
  const envios: EnvioPonto[] = [
    envio("c13", colab("c13").email, "pessoa", "Ponto: 1 dia para revisar", 5),
    envio("c20", colab("c20").email, "pessoa", "Ponto: 1 dia para revisar", 4),
    envio("c14", colab("c14").email, "pessoa", "Ponto: 1 dia para revisar", 3),
    envio("c14", colab("c14").email, "pessoa", "Ponto: 1 dia para revisar", 2),
    envio("c14", colab("c14").email, "pessoa", "Ponto: 1 dia para revisar", 1),
    envio(null, colab("c14").emailGestor!, "gestor", "Ponto da equipe: 1 pessoa com pendência", 1),
  ];

  return { colaboradores, dias, pendencias, envios, config: { ...CONFIG_PONTO_PADRAO } };
}
