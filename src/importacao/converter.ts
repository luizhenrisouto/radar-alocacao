/** Converte e valida as linhas de uma planilha (formato brasileiro) para o que as RPCs de importação esperam. */
import { normalizarSkill as normalizar } from "../regras/matching";
import type { Regime, Senioridade } from "../regras/tipos";
import { normalizarMatricula } from "../../supabase/functions/_shared/ponto.ts";
import { CAMPOS, type TipoImportacao } from "./colunas";

/** "15/03/2026", "5/3/2026" ou "2026-03-15" → "2026-03-15"; data impossível ou texto → null. */
export function lerData(s: string): string | null {
  const t = (s ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  let [a, me, d] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  if (!m) {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (!m) return null;
    [d, me, a] = [+m[1], +m[2], +m[3]];
  }
  const dt = new Date(Date.UTC(a, me - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== me - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** "R$ 12.500,00" → 12500; "150,5" e "150.5" → 150.5; "12.500" → 12500; vazio ou texto → null. */
export function lerDinheiro(s: string): number | null {
  let t = (s ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** "8:00 12:00;13:00,18:00" → ["08:00", "12:00", "13:00", "18:00"]; horário inválido lança erro com o valor. */
export function lerMarcacoes(s: string): string[] {
  return (s ?? "").split(/[\s;,]+/).filter(Boolean).map((h) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(h);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new LinhaInvalida(`marcação inválida: ${h}`);
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  });
}

export function lerLista(s: string): string[] {
  return (s ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
}

const NIVEL: Record<string, Senioridade> = {
  junior: "junior", jr: "junior", pleno: "pleno", pl: "pleno", senior: "senior", sr: "senior",
  especialista: "especialista", staff: "especialista", principal: "especialista",
};

function lerBooleano(s: string): boolean | null {
  const t = normalizar(s ?? "");
  if (!t) return true;
  if (["sim", "s", "true", "1", "x", "yes"].includes(t)) return true;
  if (["nao", "n", "false", "0", "no"].includes(t)) return false;
  return null;
}

/** Regime pelo texto normalizado; vazio é CLT. */
const REGIME: Record<string, Regime> = { "": "CLT", clt: "CLT", pj: "PJ", cooperado: "Cooperado", coop: "Cooperado", cooperativa: "Cooperado" };

class LinhaInvalida extends Error {}

/** Coluna "Ativo" do ponto: vazio, sim ou ativo = true; não, desligado ou inativo = false. */
function lerAtivo(s: string): boolean {
  const t = normalizar(s ?? "");
  if (["desligado", "inativo", "demitido"].includes(t)) return false;
  if (t === "ativo") return true;
  const b = lerBooleano(s);
  if (b == null) throw new LinhaInvalida(`valor inválido em Ativo: ${s}`);
  return b;
}

export function converterLinhas(
  tipo: TipoImportacao,
  linhas: string[][],
  mapa: Record<string, number | null>,
  ctx: { emailsConhecidos: Set<string> },
): { validas: Record<string, unknown>[]; erros: { linha: number; motivo: string }[] } {
  const validas: Record<string, unknown>[] = [];
  const erros: { linha: number; motivo: string }[] = [];
  const campos = Object.fromEntries(CAMPOS[tipo].map((c) => [c.campo, c]));

  linhas.forEach((celulas, i) => {
    const linha = i + 2; // a linha 1 da planilha é o cabeçalho
    if (celulas.every((x) => !String(x ?? "").trim())) return;
    const bruto = (campo: string) => {
      const idx = mapa[campo];
      return idx == null ? "" : String(celulas[idx] ?? "").trim();
    };
    const texto = (campo: string) => {
      const v = bruto(campo);
      if (!v && campos[campo].obrigatorio) throw new LinhaInvalida(`${campos[campo].rotulo.toLowerCase()} obrigatório`);
      return v;
    };
    const data = (campo: string) => {
      const v = texto(campo);
      if (!v) return null;
      const d = lerData(v);
      if (!d) throw new LinhaInvalida(`data inválida em ${campos[campo].rotulo}: ${v}`);
      return d;
    };
    const dinheiro = (campo: string) => {
      const v = texto(campo);
      if (!v) return null;
      const n = lerDinheiro(v);
      if (n == null) throw new LinhaInvalida(`valor inválido em ${campos[campo].rotulo}: ${v}`);
      return n;
    };
    const senioridade = () => {
      const v = texto("senioridade");
      const s = NIVEL[normalizar(v)];
      if (!s) throw new LinhaInvalida(`senioridade inválida: ${v}`);
      return s;
    };

    try {
      if (tipo === "consultores") {
        const regime = REGIME[normalizar(texto("regime"))];
        if (!regime) throw new LinhaInvalida(`regime inválido: ${bruto("regime")}`);
        const salario = dinheiro("salario");
        if (salario != null && salario < 0) throw new LinhaInvalida(`valor inválido em Salário: ${bruto("salario")}`);
        const remoto = lerBooleano(bruto("aceitaRemoto"));
        if (remoto == null) throw new LinhaInvalida(`valor inválido em Remoto: ${bruto("aceitaRemoto")}`);
        validas.push({
          linha, nome: texto("nome"), email: texto("email").toLowerCase(), cargo: texto("cargo"), senioridade: senioridade(),
          skills: lerLista(texto("skills")), regime, custoMensal: dinheiro("custoMensal") ?? salario ?? 0, salario, cidade: texto("cidade") || null,
          aceitaRemoto: remoto, admitidoEm: data("admitidoEm"),
        });
      } else if (tipo === "alocacoes") {
        const email = texto("email").toLowerCase();
        if (!ctx.emailsConhecidos.has(email)) throw new LinhaInvalida(`consultor não encontrado: ${email}`);
        validas.push({ linha, email, cliente: texto("cliente"), inicio: data("inicio"), fim: data("fim"), valorHora: dinheiro("valorHora") });
      } else if (tipo === "ponto_colaboradores") {
        validas.push({
          linha, matricula: normalizarMatricula(texto("matricula")), nome: texto("nome"), email: texto("email").toLowerCase(),
          emailGestor: texto("emailGestor").toLowerCase() || null, ativo: lerAtivo(bruto("ativo")),
        });
      } else if (tipo === "ponto_marcacoes") {
        validas.push({
          linha, matricula: normalizarMatricula(texto("matricula")), data: data("data"), marcacoes: lerMarcacoes(bruto("marcacoes")),
          situacao: texto("situacao") || null,
        });
      } else {
        validas.push({
          linha, titulo: texto("titulo"), cliente: texto("cliente"), senioridade: senioridade(),
          skillsObrigatorias: lerLista(texto("skillsObrigatorias")), skillsDesejaveis: lerLista(texto("skillsDesejaveis")),
          inicioPrevisto: data("inicioPrevisto"), valorHora: dinheiro("valorHora"),
        });
      }
    } catch (e) {
      if (!(e instanceof LinhaInvalida)) throw e;
      erros.push({ linha, motivo: e.message });
    }
  });
  return { validas, erros };
}
