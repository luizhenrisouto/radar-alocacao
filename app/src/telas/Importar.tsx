import { useState } from "react";
import { CAMPOS, mapearColunas, type TipoImportacao } from "../../../src/importacao/colunas";
import { converterLinhas } from "../../../src/importacao/converter";
import { lerArquivo } from "../../../src/importacao/ler";
import type { PropsTela } from "../App";
import type { ResultadoImportacao } from "../api";

const TIPOS: { tipo: TipoImportacao; nome: string }[] = [
  { tipo: "consultores", nome: "Consultores" },
  { tipo: "alocacoes", nome: "Alocações" },
  { tipo: "vagas", nome: "Vagas" },
  { tipo: "ponto_colaboradores", nome: "Colaboradores do ponto" },
  { tipo: "ponto_marcacoes", nome: "Marcações do ponto" },
];

const NOTA: Partial<Record<TipoImportacao, string>> = {
  alocacoes: "Importe os consultores antes: alocações procuram a pessoa pelo e-mail. Esta importação substitui todas as alocações atuais.",
  vagas: "Importe os consultores antes: alocações procuram a pessoa pelo e-mail. Esta importação substitui todas as vagas atuais.",
  ponto_colaboradores: "Matrícula como no Senior (zeros à esquerda não importam). O e-mail do gestor é opcional: sem ele, o gestor não é avisado. Quem saiu da empresa: “não” na coluna Ativo, e os lembretes param.",
  ponto_marcacoes: "Importe os colaboradores do ponto antes: marcações procuram a pessoa pela matrícula. Uma linha por pessoa e dia, como no relatório de apuração do Senior; reimportar um dia substitui as marcações dele e fecha as pendências acertadas. Importe sempre o período inteiro em aberto (por exemplo, o mês até ontem): um dia que não volta na planilha continua pendente.",
};

export default function Importar({ dados, api, recarregar }: PropsTela) {
  const [tipo, setTipo] = useState<TipoImportacao>("consultores");
  const [grade, setGrade] = useState<string[][] | null>(null);
  const [mapa, setMapa] = useState<Record<string, number | null>>({});
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  if (api.modo === "demo") {
    return (
      <section aria-label="Importar" className="cartao">
        <h2>Importar planilhas</h2>
        <p>Para importar suas planilhas, entre com sua conta.</p>
        <p className="suave pequeno">Modelos: {TIPOS.map((t, i) => <span key={t.tipo}>{i > 0 && " · "}<a href={`modelos/${t.tipo}.csv`} download>{t.nome}</a></span>)}</p>
      </section>
    );
  }

  const campos = CAMPOS[tipo];
  const cabecalho = grade?.[0] ?? [];
  const faltando = campos.filter((c) => c.obrigatorio && mapa[c.campo] == null);
  const emails = new Set(dados.consultores.map((c) => c.email.toLowerCase()));
  const conversao = grade && faltando.length === 0 ? converterLinhas(tipo, grade.slice(1), mapa, { emailsConhecidos: emails }) : null;

  function trocarTipo(t: TipoImportacao) {
    setTipo(t);
    setResultado(null);
    if (grade) setMapa(mapearColunas(t, grade[0] ?? []));
  }

  async function escolherArquivo(arquivo: File | undefined) {
    setResultado(null);
    setErroArquivo(null);
    if (!arquivo) return;
    try {
      const g = await lerArquivo(arquivo);
      if (g.length < 2) throw new Error("A planilha precisa de um cabeçalho e pelo menos uma linha.");
      setGrade(g);
      setMapa(mapearColunas(tipo, g[0]));
    } catch (e) {
      setGrade(null);
      setErroArquivo((e as Error).message);
    }
  }

  async function enviar() {
    if (!conversao) return;
    setEnviando(true);
    setErroEnvio(null);
    try {
      setResultado(await api.importar(tipo, conversao.validas));
      recarregar();
    } catch (e) {
      setErroEnvio((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-label="Importar" className="passos">
      <div className="cartao">
        <h2>1. O que você vai importar</h2>
        <form className="campos" onSubmit={(e) => e.preventDefault()}>
          <label>
            Tipo de planilha
            <select value={tipo} onChange={(e) => trocarTipo(e.target.value as TipoImportacao)}>
              {TIPOS.map((t) => <option key={t.tipo} value={t.tipo}>{t.nome}</option>)}
            </select>
          </label>
          <a href={`modelos/${tipo}.csv`} download className="pequeno">Baixar modelo</a>
          {NOTA[tipo] && <p className="suave pequeno">{NOTA[tipo]}</p>}
          <label>
            Arquivo da planilha
            <input type="file" accept=".csv,.xlsx" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
          </label>
          {erroArquivo && <p className="erro">{erroArquivo}</p>}
        </form>
      </div>

      {grade && (
        <div className="cartao">
          <h2>2. Colunas</h2>
          <div className="mapa campos">
            {campos.map((c) => (
              <label key={c.campo}>
                {c.obrigatorio ? `${c.rotulo} (obrigatório)` : c.rotulo}
                <select value={mapa[c.campo] ?? ""} onChange={(e) => setMapa({ ...mapa, [c.campo]: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">—</option>
                  {cabecalho.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          {faltando.length > 0 && <p className="aviso">{`Escolha a coluna de: ${faltando.map((c) => c.rotulo).join(", ")}`}</p>}
        </div>
      )}

      {conversao && (
        <div className="cartao">
          <h2>3. Conferir e importar</h2>
          {conversao.validas.length > 0 && (
            <table className="lista">
              <thead><tr>{campos.slice(0, 4).map((c) => <th key={c.campo}>{c.rotulo}</th>)}</tr></thead>
              <tbody>
                {conversao.validas.slice(0, 10).map((l) => (
                  <tr key={String(l.linha)}>{campos.slice(0, 4).map((c) => <td key={c.campo}>{formatarCelula(l[c.campo])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
          {conversao.erros.length > 0 && (
            <ul className="erro pequeno">{conversao.erros.map((e) => <li key={e.linha}>{`Linha ${e.linha}: ${e.motivo}`}</li>)}</ul>
          )}
          {conversao.validas.length > 0 && !resultado && (
            <button className="botao" onClick={enviar} disabled={enviando}>
              {enviando ? "Importando…" : `Importar ${conversao.validas.length} ${conversao.validas.length === 1 ? "linha" : "linhas"}`}
            </button>
          )}
          {erroEnvio && <p className="erro">{erroEnvio}</p>}
          {resultado && (
            <div>
              <p><strong>{`${resultado.gravadas} ${resultado.gravadas === 1 ? "linha gravada" : "linhas gravadas"}.`}</strong></p>
              {resultado.erros.length > 0 && <ul className="erro pequeno">{resultado.erros.map((e) => <li key={e.linha}>{`Linha ${e.linha}: ${e.motivo}`}</li>)}</ul>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function formatarCelula(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v == null) return "";
  return String(v);
}
