import { useState } from "react";
import evalSinaisIa from "../../../src/demo/eval-sinais-ia.json";
import { GABARITO_SINAIS } from "../../../src/demo/gabarito-sinais";
import { avaliarClassificacao, avaliarMatching, encaixesAntesDoFim } from "../../../src/regras/avaliacao";
import { nivelRisco, notaRisco, ROTULO_SINAL } from "../../../src/regras/sinais";
import { classificarPorRegra } from "../../../supabase/functions/_shared/sinais.ts";
import { receitaParadaPorDia, resumoBench } from "../../../src/regras/bench";
import { concentracao } from "../../../src/regras/concentracao";
import { vencimentos, type Vencimento } from "../../../src/regras/contratos";
import { GABARITO_NEXO } from "../../../src/demo/nexo";
import type { PropsTela } from "../App";
import { dataBr, porcento, reais } from "../formatar";

const ROTULO_NIVEL = { alto: "alto", atencao: "atenção", baixo: "baixo" } as const;
const ACERTO_REGRA_SINAIS = avaliarClassificacao(GABARITO_SINAIS, (t) => classificarPorRegra(t).tipo);

export default function Painel({ dados, hoje, api, recarregar }: PropsTela) {
  const bench = resumoBench(dados, hoje);
  const custoDia = bench.reduce((s, i) => s + i.custoDiario, 0);
  const venc = vencimentos(dados, hoje);
  const ate60 = venc.filter((v) => v.diasRestantes <= 60);
  const riscos = concentracao(dados, hoje);
  const limite = dados.empresa.limiteConcentracao;
  const escala = Math.max(0.5, ...riscos.map((r) => r.parcelaConsultores));
  const encaixes = encaixesAntesDoFim(dados, hoje);
  const acerto = dados.empresa.id === "nexo" ? avaliarMatching(dados, GABARITO_NEXO, hoje) : null;

  return (
    <section aria-label="Painel">
      <p className="suave pequeno">Situação em {dataBr(hoje)}</p>

      <div className="numeros secao">
        <div className="cartao numero destaque">
          <div className="rotulo">No bench</div>
          <div className="valor">{bench.length}</div>
        </div>
        <div className="cartao numero destaque">
          <div className="rotulo">Custo do bench por dia</div>
          <div className="valor">{reais(custoDia)}</div>
          <div className="suave pequeno">Receita parada por dia: <span className="num">{reais(receitaParadaPorDia(dados, hoje))}</span></div>
        </div>
        <div className="cartao numero">
          <div className="rotulo">Vencendo em até 60 dias</div>
          <div className="valor">{ate60.length}</div>
        </div>
      </div>

      {riscos.filter((r) => r.alerta).map((r) => {
        const doCliente = ate60.filter((v) => v.cliente.id === r.cliente.id).length;
        const texto = doCliente > 0
          ? `${r.cliente.nome} concentra ${porcento(r.parcelaConsultores)} dos alocados e ${doCliente} contratos vencem em até 60 dias.`
          : `${r.cliente.nome} concentra ${porcento(r.parcelaConsultores)} dos alocados.`;
        return <div key={r.cliente.id} className="alerta" role="alert">{texto}</div>;
      })}

      <div className="grade-2 secao">
        <div className="cartao">
          <h2>Contratos vencendo</h2>
          <div className="faixas">
            {([30, 60, 90] as const).map((f) => <Faixa key={f} faixa={f} itens={venc.filter((v) => v.faixa === f)} />)}
          </div>
        </div>

        <div className="cartao">
          <h2>Concentração por cliente</h2>
          <div className="barras">
            {riscos.map((r) => (
              <div key={r.cliente.id} className="barra-linha">
                <span>
                  {r.cliente.nome}
                  <SeloRisco nota={notaRisco(dados.sinais, r.cliente.id, hoje)} />
                  <span className="receita suave">{`${reais(r.receitaMensal)}/mês`}</span>
                </span>
                <div className="barra-trilho" aria-hidden="true">
                  <div className={r.alerta ? "barra-cheia alto" : "barra-cheia"} style={{ width: `${(r.parcelaConsultores / escala) * 100}%` }} />
                  <div className="barra-limite" style={{ left: `${(limite / escala) * 100}%` }} />
                </div>
                <span className="num">{porcento(r.parcelaConsultores)}</span>
              </div>
            ))}
          </div>
          <p className="suave pequeno">A linha marca o limite de {porcento(limite)} dos consultores alocados.</p>
        </div>
      </div>

      <Noticias {...{ dados, hoje, api, recarregar }} />

      <div className="cartao secao">
        <h2>Como medimos</h2>
        <div className="medidas">
          {acerto && <span>{`Acerto do matching: ${acerto.acertos} de ${acerto.total} vagas (gabarito no top 3)`}</span>}
          <span>{`Quem sai nos próximos 60 dias e já tem vaga: ${encaixes.comEncaixe} de ${encaixes.total}`}</span>
          <span>
            {`Classificação de notícias: ${ACERTO_REGRA_SINAIS.acertos} de ${ACERTO_REGRA_SINAIS.total} pela regra`}
            {evalSinaisIa.total > 0 && ` · ${evalSinaisIa.acertos} de ${evalSinaisIa.total} pela IA`}
            {" (gabarito de manchetes fictícias)"}
          </span>
        </div>
      </div>
    </section>
  );
}

function SeloRisco({ nota }: { nota: number }) {
  if (nota <= 0) return null;
  const nivel = nivelRisco(nota);
  return <span className={`selo risco-${nivel}`}>{`Notícias: ${ROTULO_NIVEL[nivel]}`}</span>;
}

function Noticias({ dados, hoje, api, recarregar }: PropsTela) {
  const [buscando, setBuscando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const cliente = (id: string) => dados.clientes.find((c) => c.id === id)?.nome ?? "";
  const recentes = dados.sinais
    .filter((s) => s.tipo !== "irrelevante")
    .sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm))
    .slice(0, 6);

  async function buscar() {
    setBuscando(true);
    setFalhou(false);
    setMensagem(null);
    try {
      const { novos } = await api.buscarSinais();
      setMensagem(novos === 1 ? "1 notícia nova." : `${novos} notícias novas.`);
      recarregar();
    } catch {
      setFalhou(true);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="cartao secao" aria-label="Notícias dos clientes">
      <div className="candidato-topo">
        <h2>Notícias dos clientes</h2>
        {api.modo === "real" && <button className="botao secundario" onClick={buscar} disabled={buscando}>{buscando ? "Buscando…" : "Buscar agora"}</button>}
      </div>
      {mensagem && <p role="status" className="pequeno">{mensagem}</p>}
      {falhou && <p className="aviso">Não foi possível buscar agora.</p>}
      {recentes.length === 0 ? (
        <p className="suave pequeno">Nenhuma notícia ainda.</p>
      ) : (
        <ul className="noticias">
          {recentes.map((s) => (
            <li key={s.id}>
              <div className="pequeno">
                <span className={s.tipo === "expansao" ? "selo ia" : `selo risco-${s.gravidade >= 3 ? "alto" : "atencao"}`}>{ROTULO_SINAL[s.tipo]}</span>{" "}
                <strong>{cliente(s.clienteId)}</strong> <span className="suave">· {dataBr(s.publicadoEm)}</span>
              </div>
              <p>{s.resumo || s.titulo}</p>
              <div className="pequeno suave">
                {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{`Abrir notícia${s.fonte ? ` (${s.fonte})` : ""}`}</a> : "exemplo fictício"}
              </div>
            </li>
          ))}
        </ul>
      )}
      {api.modo === "real" && <p className="suave pequeno">A busca roda toda segunda de manhã. A IA lê só as manchetes; cada notícia tem o link para conferir.</p>}
    </section>
  );
}

function Faixa({ faixa, itens }: { faixa: 30 | 60 | 90; itens: Vencimento[] }) {
  const porCliente = new Map<string, Vencimento[]>();
  for (const v of itens) porCliente.set(v.cliente.nome, [...(porCliente.get(v.cliente.nome) ?? []), v]);
  return (
    <div className="faixa">
      <h3>Até {faixa} dias · {itens.length}</h3>
      {itens.length === 0 && <p className="suave pequeno">Nenhum</p>}
      {[...porCliente].map(([cliente, vs]) => (
        <div key={cliente} className="grupo">
          <div className="cliente">{cliente}</div>
          <ul>
            {vs.map((v) => (
              <li key={v.alocacao.id}><span>{v.consultor.nome}</span><span className="num suave">{dataBr(v.alocacao.fim as string)}</span></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
