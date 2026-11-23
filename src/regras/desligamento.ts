/**
 * Manter ou desligar: quanto custa desligar uma pessoa e recontratar depois, comparado a mantê-la parada.
 * É uma estimativa: cada parcela diz se vem da lei, de dado de mercado ou de estimativa nossa.
 */
import { alocacaoAtiva, custoDiario } from "./bench";
import type { Consultor, DadosEmpresa } from "./tipos";

export interface Premissas {
  fatorEncargosClt: number; diasAvisoPj: number; diasAvisoCooperado: number;
  diasParaContratar: number; recrutamentoMeses: number; rampaPercentual: number; contarReceitaParada: boolean;
}

export const PREMISSAS_PADRAO: Premissas = {
  fatorEncargosClt: 1.7, diasAvisoPj: 30, diasAvisoCooperado: 30, diasParaContratar: 45,
  recrutamentoMeses: 1, rampaPercentual: 50, contarReceitaParada: true,
};

export type Origem = "lei" | "mercado" | "estimativa";
export interface Parcela {
  chave: "aviso" | "multaFgts" | "recrutamento" | "rampa" | "margemPerdida";
  rotulo: string; valor: number; origem: Origem; formula: string;
}
export interface ContaPessoa {
  consultor: Consultor; salario: number | null; salarioEstimado: boolean; diasAviso: number;
  /** Recontratar inclui a margem perdida enquanto contrata. */
  desligar: Parcela[]; recontratar: Parcela[];
  totalDesligar: number; totalRecontratar: number; custoDiario: number; pontoDeVirada: number | null;
  /** Aviso de risco do cooperado; null nos outros regimes. */
  aviso: string | null;
}
export interface ContaGrupo {
  pessoas: number; totalDesligar: number; totalRecontratar: number; custoMensal: number; custoDiario: number; pontoDeVirada: number | null;
}

export const TEXTO_COOPERADO =
  "A Lei 12.690/2012 garante direitos ao cooperado. Se houver subordinação no dia a dia, há risco de vínculo trabalhista, e esse risco não está nesta conta.";

/** 13º (1/12) e férias com 1/3 (1/9) sobre cada mês de salário. */
const FGTS = 0.08;
/**
 * Aviso indenizado com reflexos: 13º (1/12) e férias com 1/3 (1/9) por mês de aviso; FGTS de 8% sobre o aviso e o 13º,
 * mas não sobre as férias indenizadas (OJ 195 do TST). Cerca de 1,28.
 */
const FATOR_AVISO = 1 + 1 / 12 + 1 / 9 + FGTS * (1 + 1 / 12);
/** Base anual do FGTS: 12 salários + 13º + 1/3 de férias (as férias substituem o salário do mês) = 13,33 ÷ 12, cerca de 1,11. */
const FATOR_BASE_FGTS = 1 + 1 / 12 + 1 / 36;

/** Aceita só número finito e não negativo (fator de encargos ≥ 1); o resto volta ao padrão do campo. */
export function normalizarPremissas(bruto: unknown): Premissas {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const num = (campo: keyof Premissas, minimo = 0): number => {
    const v = o[campo];
    return typeof v === "number" && Number.isFinite(v) && v >= minimo ? v : (PREMISSAS_PADRAO[campo] as number);
  };
  return {
    fatorEncargosClt: num("fatorEncargosClt", 1),
    diasAvisoPj: num("diasAvisoPj"),
    diasAvisoCooperado: num("diasAvisoCooperado"),
    diasParaContratar: num("diasParaContratar"),
    recrutamentoMeses: num("recrutamentoMeses"),
    rampaPercentual: num("rampaPercentual"),
    contarReceitaParada: typeof o.contarReceitaParada === "boolean" ? o.contarReceitaParada : PREMISSAS_PADRAO.contarReceitaParada,
  };
}

/** Meses completos entre duas datas "YYYY-MM-DD"; nunca negativo. */
function mesesCompletos(de: string, ate: string): number {
  const [y1, m1, d1] = de.split("-").map(Number);
  const [y2, m2, d2] = ate.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const rs = (n: number) => moeda.format(n).replace(/\s/g, " ");
const dec = (n: number, casas = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

const NOME_NIVEL: Record<Consultor["senioridade"], string> = { junior: "júnior", pleno: "pleno", senior: "sênior", especialista: "especialista" };

/**
 * Valor/hora da alocação mais recente da pessoa. Sem histórico, a média das alocações ativas de quem tem a mesma
 * senioridade; sem ninguém nesse nível, a média da empresa; sem nenhuma alocação ativa, 0.
 */
function valorHoraDeReferencia(d: DadosEmpresa, c: Consultor, hoje: string): { valor: number; fonte: string } {
  const dela = d.alocacoes.filter((a) => a.consultorId === c.id).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
  if (dela) return { valor: dela.valorHora, fonte: "última alocação" };
  const media = (lista: { valorHora: number }[]) => lista.reduce((s, a) => s + a.valorHora, 0) / lista.length;
  const ativas = d.alocacoes.filter((a) => alocacaoAtiva(a, hoje));
  const nivel = new Set(d.consultores.filter((x) => x.senioridade === c.senioridade).map((x) => x.id));
  const doNivel = ativas.filter((a) => nivel.has(a.consultorId));
  if (doNivel.length) return { valor: media(doNivel), fonte: `média dos ${NOME_NIVEL[c.senioridade]} alocados` };
  if (ativas.length) return { valor: media(ativas), fonte: "média da empresa" };
  return { valor: 0, fonte: "sem alocações ativas" };
}

export function contaManterOuDesligar(d: DadosEmpresa, c: Consultor, hoje: string, p: Premissas): ContaPessoa {
  const desligar: Parcela[] = [];
  let salario: number | null = null;
  let salarioEstimado = false;
  let diasAviso: number;

  if (c.regime === "CLT") {
    const informado = c.salario != null && c.salario > 0 ? c.salario : null;
    salarioEstimado = informado == null;
    salario = informado ?? Math.round((c.custoMensal / p.fatorEncargosClt) * 100) / 100;
    const meses = mesesCompletos(c.admitidoEm, hoje);
    diasAviso = Math.min(90, 30 + 3 * Math.floor(meses / 12));
    desligar.push({
      chave: "aviso", rotulo: "Aviso prévio indenizado (com 13º, férias e FGTS)", origem: "lei",
      valor: (salario * diasAviso) / 30 * FATOR_AVISO,
      formula: `${diasAviso} dias × ${rs(salario)} ÷ 30 × 1,28`,
    });
    desligar.push({
      chave: "multaFgts", rotulo: "Multa de 40% do FGTS", origem: "lei",
      valor: 0.4 * salario * FGTS * meses * FATOR_BASE_FGTS,
      formula: `40% de ${rs(salario)} × 8% × ${meses} meses × 1,11`,
    });
  } else {
    diasAviso = c.regime === "PJ" ? p.diasAvisoPj : p.diasAvisoCooperado;
    desligar.push({
      chave: "aviso", rotulo: "Aviso do contrato", origem: "estimativa",
      valor: (c.custoMensal * diasAviso) / 30,
      formula: `${dec(diasAviso)} dias × ${rs(c.custoMensal)} ÷ 30`,
    });
  }

  const recontratar: Parcela[] = [
    {
      chave: "recrutamento", rotulo: "Recrutamento e integração", origem: "estimativa",
      valor: c.custoMensal * p.recrutamentoMeses,
      formula: `${dec(p.recrutamentoMeses)} × ${rs(c.custoMensal)}`,
    },
    {
      chave: "rampa", rotulo: "Rampa do primeiro mês", origem: "estimativa",
      valor: (c.custoMensal * p.rampaPercentual) / 100,
      formula: `${dec(p.rampaPercentual)}% de ${rs(c.custoMensal)}`,
    },
  ];
  const diario = custoDiario(c, d.empresa);
  if (p.contarReceitaParada) {
    // Enquanto a vaga espera alguém, perde-se a receita, mas também não se paga a pessoa: o que se perde é a margem.
    const dias = Math.round((p.diasParaContratar * d.empresa.diasUteisMes) / 30);
    const vh = valorHoraDeReferencia(d, c, hoje);
    recontratar.push({
      chave: "margemPerdida", rotulo: "Margem perdida enquanto contrata", origem: "mercado",
      valor: Math.max(0, dias * (8 * vh.valor - diario)),
      formula: `${dias} dias úteis × (8 h × ${rs(vh.valor)}/h, ${vh.fonte}, − ${rs(diario)} de custo por dia)`,
    });
  }

  const totalDesligar = desligar.reduce((s, x) => s + x.valor, 0);
  const totalRecontratar = recontratar.reduce((s, x) => s + x.valor, 0);
  return {
    consultor: c, salario, salarioEstimado, diasAviso, desligar, recontratar, totalDesligar, totalRecontratar,
    custoDiario: diario, pontoDeVirada: virada(totalDesligar + totalRecontratar, diario),
    aviso: c.regime === "Cooperado" ? TEXTO_COOPERADO : null,
  };
}

export function contaDoGrupo(d: DadosEmpresa, consultorIds: string[], hoje: string, p: Premissas): ContaGrupo {
  const contas = d.consultores.filter((c) => consultorIds.includes(c.id)).map((c) => contaManterOuDesligar(d, c, hoje, p));
  const soma = (f: (c: ContaPessoa) => number) => contas.reduce((s, c) => s + f(c), 0);
  const totalDesligar = soma((c) => c.totalDesligar);
  const totalRecontratar = soma((c) => c.totalRecontratar);
  const diario = soma((c) => c.custoDiario);
  return {
    pessoas: contas.length, totalDesligar, totalRecontratar, custoMensal: soma((c) => c.consultor.custoMensal),
    custoDiario: diario, pontoDeVirada: virada(totalDesligar + totalRecontratar, diario),
  };
}

function virada(total: number, diario: number): number | null {
  return diario > 0 ? Math.floor(total / diario) : null;
}
