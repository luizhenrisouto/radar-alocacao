import { useState } from "react";
import { explicacaoPorRegra, rankearCandidatos } from "../../../src/regras/matching";
import type { Match } from "../../../src/regras/tipos";
import type { PropsTela } from "../App";
import { dataBr } from "../formatar";

export default function Vagas({ dados, hoje, api }: PropsTela) {
  const abertas = dados.vagas.filter((v) => v.status === "aberta");
  const [vagaId, setVagaId] = useState(abertas[0]?.id ?? null);
  const [geradas, setGeradas] = useState<Record<string, Match>>({});
  const [gerando, setGerando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const vaga = abertas.find((v) => v.id === vagaId) ?? null;
  const cliente = (id: string) => dados.clientes.find((c) => c.id === id)?.nome ?? "";
  const candidatos = vaga ? rankearCandidatos(dados, vaga.id, hoje) : [];

  const explicacao = (consultorId: string) => {
    const chave = `${vaga?.id}:${consultorId}`;
    return geradas[chave] ?? dados.matches.find((m) => m.vagaId === vaga?.id && m.consultorId === consultorId) ?? null;
  };

  async function gerar() {
    if (!vaga) return;
    setGerando(true);
    setFalhou(false);
    try {
      const novos = await api.explicar(vaga, candidatos);
      setGeradas((g) => ({ ...g, ...Object.fromEntries(novos.map((m) => [`${m.vagaId}:${m.consultorId}`, m])) }));
    } catch {
      setFalhou(true);
    } finally {
      setGerando(false);
    }
  }

  if (abertas.length === 0) return <p>Nenhuma vaga aberta.</p>;

  return (
    <section aria-label="Vagas" className="vagas">
      <div>
        {abertas.map((v) => (
          <button key={v.id} className={v.id === vagaId ? "vaga-item ativa" : "vaga-item"} onClick={() => { setVagaId(v.id); setFalhou(false); }}>
            <div><strong>{v.titulo}</strong></div>
            <div className="sub">{cliente(v.clienteId)} · início {dataBr(v.inicioPrevisto)}</div>
          </button>
        ))}
      </div>

      {vaga && (
        <div className="cartao">
          <h2>{vaga.titulo}</h2>
          <p className="suave pequeno">
            {cliente(vaga.clienteId)} · obrigatórias: {vaga.skillsObrigatorias.join(", ")}
            {vaga.skillsDesejaveis.length > 0 && ` · desejáveis: ${vaga.skillsDesejaveis.join(", ")}`}
          </p>
          {api.modo === "real" && candidatos.length > 0 && (
            <button className="botao secundario" onClick={gerar} disabled={gerando}>
              {gerando ? "Gerando…" : "Gerar de novo com IA"}
            </button>
          )}
          {falhou && <p className="aviso">Não foi possível gerar agora; mostrando a explicação da regra.</p>}
          {candidatos.length === 0 && <p>Nenhum consultor cobre as skills obrigatórias desta vaga.</p>}
          {candidatos.map((c) => {
            const m = explicacao(c.consultor.id);
            const origem = m?.origem ?? "regra";
            return (
              <div key={c.consultor.id} className="candidato" data-testid="candidato">
                <div className="candidato-topo">
                  <h3>{c.consultor.nome}</h3>
                  <span className="nota" aria-label={`nota ${c.nota}`}>{c.nota}</span>
                </div>
                <div className="suave pequeno">
                  {c.consultor.cargo}
                  <span className={origem === "ia" ? "selo ia" : "selo"}>{origem === "ia" ? "IA" : "Regra"}</span>
                </div>
                <p>{m?.explicacao ?? explicacaoPorRegra(c, vaga, hoje)}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
