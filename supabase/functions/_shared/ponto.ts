/**
 * Ponto em dia: pendências de marcação, quem cobrar hoje e o texto das mensagens.
 * Código puro (sem APIs do Deno), usado pela função `ponto` e pelo app. Datas são "YYYY-MM-DD".
 */

export type TipoPendencia = "sem_marcacao" | "incompleta";
export interface ColaboradorPonto { matricula: string; nome: string; email: string; emailGestor: string | null; ativo: boolean }
export interface DiaPonto { matricula: string; data: string; marcacoes: string[]; situacao: string | null }
export interface Pendencia {
  id: string; matricula: string; data: string; tipo: TipoPendencia; abertaEm: string; resolvidaEm: string | null;
  cobrancas: number; ultimaCobranca: string | null; escalada: boolean;
}
export interface EnvioPonto {
  id: string; matricula: string | null; destino: string; canal: "email" | "teams"; nivel: "pessoa" | "gestor";
  assunto: string; enviadoEm: string; ok: boolean; erro: string | null; simulado: boolean;
}
export interface ConfigPonto {
  emailAtivo: boolean; teamsAtivo: boolean; teamsConfigurado: boolean; remetenteNome: string; intervaloDias: number; escalarApos: number;
}
export const CONFIG_PONTO_PADRAO: ConfigPonto = {
  emailAtivo: true, teamsAtivo: false, teamsConfigurado: false, remetenteNome: "RH", intervaloDias: 1, escalarApos: 2,
};
export interface DadosPonto { colaboradores: ColaboradorPonto[]; dias: DiaPonto[]; pendencias: Pendencia[]; envios: EnvioPonto[]; config: ConfigPonto }
export interface Mensagem { assunto: string; texto: string }
export interface Cobranca { nivel: "pessoa" | "gestor"; destino: string; matricula: string | null; pendenciaIds: string[]; mensagem: Mensagem }

// ---------- datas (mesma semântica de src/regras/datas.ts) ----------
const DIA_MS = 86_400_000;
const emMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const diaDaSemana = (iso: string) => new Date(emMs(iso)).getUTCDay();
const somarDias = (iso: string, n: number) => new Date(emMs(iso) + n * DIA_MS).toISOString().slice(0, 10);
const util = (iso: string) => diaDaSemana(iso) >= 1 && diaDaSemana(iso) <= 5;

/** Dias de segunda a sexta com de < d <= ate; 0 se ate <= de. */
export function diasUteisEntre(de: string, ate: string): number {
  let n = 0;
  for (let d = somarDias(de, 1); d <= ate; d = somarDias(d, 1)) if (util(d)) n++;
  return n;
}

export function proximoDiaUtil(hoje: string): string {
  let d = somarDias(hoje, 1);
  while (!util(d)) d = somarDias(d, 1);
  return d;
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "03/11 (ter)". */
export const rotuloDia = (iso: string) => `${ddmm(iso)} (${SEMANA[diaDaSemana(iso)]})`;

// ---------- pendências ----------
export function normalizarMatricula(s: string): string {
  return s.trim().replace(/^0+(?=\d)/, "");
}

/** Tipo da pendência do dia, ou null se o dia não é pendente. */
export function tipoDoDia(d: DiaPonto, hoje: string): TipoPendencia | null {
  if (d.data >= hoje || !util(d.data) || (d.situacao ?? "").trim() !== "") return null;
  if (d.marcacoes.length === 0) return "sem_marcacao";
  return d.marcacoes.length % 2 === 1 ? "incompleta" : null;
}

/** O que a importação muda: abre pendências novas, muda o tipo e fecha as que ficaram ok. Nunca apaga. */
export function sincronizarPendencias(dias: DiaPonto[], colaboradores: ColaboradorPonto[], abertas: Pendencia[], hoje: string) {
  const ativos = new Set(colaboradores.filter((c) => c.ativo).map((c) => c.matricula));
  const chave = (m: string, d: string) => `${m}|${d}`;
  const porDia = new Map(abertas.filter((p) => p.resolvidaEm == null).map((p) => [chave(p.matricula, p.data), p]));
  const abrir: { matricula: string; data: string; tipo: TipoPendencia }[] = [];
  const fechar: string[] = [];
  const mudarTipo: { id: string; tipo: TipoPendencia }[] = [];
  for (const d of dias) {
    const aberta = porDia.get(chave(d.matricula, d.data));
    const tipo = ativos.has(d.matricula) ? tipoDoDia(d, hoje) : null;
    if (aberta && !tipo) fechar.push(aberta.id);
    else if (aberta && tipo && aberta.tipo !== tipo) mudarTipo.push({ id: aberta.id, tipo });
    else if (!aberta && tipo) abrir.push({ matricula: d.matricula, data: d.data, tipo });
  }
  return { abrir, fechar, mudarTipo };
}

// ---------- mensagens ----------
/** "LUIZA DA SILVA" → "Luiza" (o Senior costuma exportar em maiúsculas). */
function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1).toLocaleLowerCase("pt-BR");
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
export const ROTULO_TIPO: Record<TipoPendencia, string> = { sem_marcacao: "sem marcação", incompleta: "marcação incompleta" };

export function mensagemPessoa(c: ColaboradorPonto, pendencias: Pendencia[], hoje: string, remetente: string): Mensagem {
  const lista = [...pendencias].sort((a, b) => a.data.localeCompare(b.data));
  const dias = plural(lista.length, "dia", "dias");
  return {
    assunto: `Ponto: ${dias} para revisar`,
    texto: [
      `Olá, ${primeiroNome(c.nome)}.`,
      "",
      `Encontramos ${dias} no seu ponto que precisam de revisão:`,
      ...lista.map((p) => `- ${rotuloDia(p.data)}: ${ROTULO_TIPO[p.tipo]}`),
      "",
      `Por favor, ajuste no Senior até ${ddmm(proximoDiaUtil(hoje))}. Se já ajustou, desconsidere esta mensagem.`,
      "",
      "Obrigado,",
      remetente,
    ].join("\n"),
  };
}

export function mensagemGestor(itens: { colaborador: ColaboradorPonto; pendencias: Pendencia[] }[], escalarApos: number, remetente: string): Mensagem {
  return {
    assunto: `Ponto da equipe: ${plural(itens.length, "pessoa", "pessoas")} com pendência`,
    texto: [
      "Olá.",
      "",
      `Estas pessoas da sua equipe ainda têm dias de ponto para revisar, mesmo depois de ${escalarApos} lembretes:`,
      ...itens.map(({ colaborador, pendencias }) => {
        const datas = [...pendencias].sort((a, b) => a.data.localeCompare(b.data)).map((p) => ddmm(p.data)).join(", ");
        return `- ${colaborador.nome}: ${datas} (${Math.max(...pendencias.map((p) => p.cobrancas))} lembretes)`;
      }),
      "",
      "Pode reforçar com elas? O ajuste é feito no Senior.",
      "",
      "Obrigado,",
      remetente,
    ].join("\n"),
  };
}

// ---------- quem cobrar hoje ----------
export function planejarCobrancas(p: DadosPonto, hoje: string): { cobrancas: Cobranca[]; semGestor: string[] } {
  const colaboradores = new Map(p.colaboradores.filter((c) => c.ativo).map((c) => [c.matricula, c]));
  const abertas = p.pendencias
    .filter((x) => x.resolvidaEm == null && colaboradores.has(x.matricula))
    .sort((a, b) => a.data.localeCompare(b.data));

  const porPessoa = new Map<string, Pendencia[]>();
  for (const x of abertas) porPessoa.set(x.matricula, [...(porPessoa.get(x.matricula) ?? []), x]);

  const pessoas: Cobranca[] = [];
  for (const [matricula, lista] of porPessoa) {
    const recente = lista.some((x) => x.ultimaCobranca != null && diasUteisEntre(x.ultimaCobranca, hoje) < p.config.intervaloDias);
    if (recente) continue;
    const c = colaboradores.get(matricula)!;
    pessoas.push({ nivel: "pessoa", destino: c.email, matricula, pendenciaIds: lista.map((x) => x.id), mensagem: mensagemPessoa(c, lista, hoje, p.config.remetenteNome) });
  }
  pessoas.sort((a, b) => colaboradores.get(a.matricula!)!.nome.localeCompare(colaboradores.get(b.matricula!)!.nome, "pt-BR"));

  const semGestor = new Set<string>();
  const porGestor = new Map<string, Map<string, Pendencia[]>>();
  for (const x of abertas) {
    if (x.escalada || x.cobrancas < p.config.escalarApos) continue;
    const gestor = colaboradores.get(x.matricula)!.emailGestor;
    if (!gestor) { semGestor.add(x.matricula); continue; }
    const equipe = porGestor.get(gestor) ?? new Map<string, Pendencia[]>();
    equipe.set(x.matricula, [...(equipe.get(x.matricula) ?? []), x]);
    porGestor.set(gestor, equipe);
  }
  const gestores: Cobranca[] = [...porGestor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([destino, equipe]) => {
      const itens = [...equipe.entries()]
        .map(([m, pendencias]) => ({ colaborador: colaboradores.get(m)!, pendencias }))
        .sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome, "pt-BR"));
      return {
        nivel: "gestor" as const, destino, matricula: null,
        pendenciaIds: itens.flatMap((i) => i.pendencias.map((x) => x.id)),
        mensagem: mensagemGestor(itens, p.config.escalarApos, p.config.remetenteNome),
      };
    });

  return { cobrancas: [...pessoas, ...gestores], semGestor: [...semGestor].sort() };
}

/** Efeito de uma cobrança nas pendências. Falha não conta. */
export function aplicarCobranca(pendencias: Pendencia[], c: Cobranca, ok: boolean, hoje: string): Pendencia[] {
  if (!ok) return pendencias;
  const ids = new Set(c.pendenciaIds);
  return pendencias.map((x) => {
    if (!ids.has(x.id)) return x;
    return c.nivel === "pessoa" ? { ...x, cobrancas: x.cobrancas + 1, ultimaCobranca: hoje } : { ...x, escalada: true };
  });
}
