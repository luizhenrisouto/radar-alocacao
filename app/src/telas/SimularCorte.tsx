import { useEffect, useState } from "react";
import { concentracao } from "../../../src/regras/concentracao";
import { aplicarCorte, cortaveis, escolherPorPercentual, simularCorte } from "../../../src/regras/corte";
import { somarDias } from "../../../src/regras/datas";
import { contaDoGrupo } from "../../../src/regras/desligamento";
import type { PropsTela } from "../App";
import { dataBr, diasUteis, porcento, reais } from "../formatar";
import { lerPremissas, textoDoNumero } from "../premissas";

export default function SimularCorte({ dados, hoje, api, recarregar, navegar }: PropsTela) {
  const clientes = concentracao(dados, hoje).map((r) => r.cliente);
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [percentual, setPercentual] = useState(50);
  const [data, setData] = useState(somarDias(hoje, 30));
  const [marcados, setMarcados] = useState<string[] | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [premissas] = useState(lerPremissas);

  // Mudar cliente, percentual ou data volta a seguir o percentual; dados novos (depois de registrar) também.
  useEffect(() => { setMarcados(null); setConfirmando(false); }, [clienteId, percentual, data, dados]);

  if (clientes.length === 0) return <p>Nenhum cliente com pessoas alocadas.</p>;

  const pessoas = cortaveis(dados, clienteId, hoje, data);
  const ids = marcados ?? escolherPorPercentual(dados, clienteId, percentual / 100, hoje, data);
  const corte = { clienteId, consultorIds: ids, data };
  const r = simularCorte(dados, corte, hoje);
  const encerrar = aplicarCorte(dados, corte).cortadas.length;
  const semVaga = r.afetados.filter((a) => a.ficaSemAlocacao).map((a) => a.consultor.id);
  const grupo = contaDoGrupo(dados, semVaga, hoje, premissas);
  const nomeCliente = (id: string) => (id.startsWith("externa:") ? "" : dados.clientes.find((c) => c.id === id)?.nome ?? "");

  function alternar(id: string) {
    setMarcados(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  async function registrar() {
    setEnviando(true);
    setErro(null);
    try {
      const { encerradas } = await api.registrarCorte({ ...corte, motivo });
      setMensagem(api.modo === "real"
        ? `${encerradas} alocações encerradas. Atualize também a sua planilha de alocações: reimportar a planilha antiga desfaz o corte.`
        : `${encerradas} alocações encerradas.`);
      setConfirmando(false);
      setMotivo("");
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-label="Simular corte">
      <div className="cartao">
        <h2>E se o cliente cortar?</h2>
        <div className="controles-corte">
          <label>
            Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label>
            Quanto o cliente corta
            <input type="range" aria-label="Quanto o cliente corta" min={0} max={100} step={10} value={percentual} onChange={(e) => setPercentual(Number(e.target.value))} />
            <span className="num">{percentual}%</span>
          </label>
          <label>
            Último dia
            <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
          </label>
        </div>
        <p className="suave pequeno">
          Saem primeiro os contratos que terminam antes. Quem já sai até {dataBr(data)} não entra no corte. Marque ou desmarque à mão.
        </p>
        <div className="pessoas-corte">
          {pessoas.map((p) => (
            <label key={p.id} className="pessoa-corte">
              <input type="checkbox" checked={ids.includes(p.id)} onChange={() => alternar(p.id)} />
              <span>{p.nome}<span className="suave pequeno"> · {p.cargo}</span></span>
            </label>
          ))}
          {pessoas.length === 0 && <p className="suave pequeno">Ninguém deste cliente continua alocado depois de {dataBr(data)}.</p>}
        </div>
      </div>

      <div className="numeros numeros-4 secao">
        <div className="cartao numero"><div className="rotulo">Pessoas afetadas</div><div className="valor">{r.afetados.length}</div></div>
        <div className="cartao numero destaque"><div className="rotulo">Receita perdida por mês</div><div className="valor">{reais(r.receitaPerdidaMensal)}</div></div>
        <div className="cartao numero destaque">
          <div className="rotulo">Custo do bench por mês</div><div className="valor">{reais(r.custoBenchMensal)}</div>
          <div className="suave pequeno">Por dia útil: <span className="num">{reais(r.custoBenchDia)}</span></div>
        </div>
        <div className="cartao numero"><div className="rotulo">Já têm vaga interna</div><div className="valor">{`${r.comVagaInterna} de ${r.afetados.length}`}</div></div>
      </div>
      <p className="suave pequeno">
        Concentração em {nomeCliente(clienteId)}: {porcento(r.parcelaAntes)} hoje, {porcento(r.parcelaDepois)} depois do corte.
        Receita = valor/hora × 168 horas; custo = custo mensal de quem fica sem nenhuma alocação; vaga interna = top 3 do matching.
      </p>

      {grupo.pessoas > 0 && (
        <div className="cartao secao grupo-desligar" data-testid="grupo-desligar">
          <h2>Manter ou desligar os que ficam sem vaga</h2>
          <p>
            {`Desligar os ${grupo.pessoas} custaria ${reais(grupo.totalDesligar)} agora e ${reais(grupo.totalRecontratar)} para recontratar depois. `}
            {`Manter os ${grupo.pessoas} parados custa ${reais(grupo.custoMensal)} por mês. `}
            {grupo.pontoDeVirada != null && <strong>{`Manter sai mais barato por até ${diasUteis(grupo.pontoDeVirada)}.`}</strong>}
          </p>
          <p className="suave pequeno">
            {`Premissas: ${textoDoNumero(premissas.diasParaContratar)} dias para contratar, recrutamento de ${textoDoNumero(premissas.recrutamentoMeses)} ${premissas.recrutamentoMeses === 1 ? "custo mensal" : "custos mensais"}, rampa de ${textoDoNumero(premissas.rampaPercentual)}%`}
            {premissas.contarReceitaParada ? ", com a margem perdida enquanto contrata." : ", sem a margem perdida."}
            {navegar && <> <button className="link" onClick={() => navegar("Bench")}>Ajustar premissas</button></>}
          </p>
        </div>
      )}

      {r.afetados.length > 0 && (
        <div className="cartao secao">
          <h2>Quem sai</h2>
          <ul className="afetados">
            {r.afetados.map((a) => (
              <li key={a.consultor.id}>
                <div><strong>{a.consultor.nome}</strong> <span className="suave pequeno">{a.consultor.cargo}</span></div>
                <div className="pequeno">
                  {a.vagaInterna
                    ? `Encaixa em ${a.vagaInterna.vaga.titulo} (${nomeCliente(a.vagaInterna.vaga.clienteId)}), ${a.vagaInterna.posicao}º no matching`
                    : a.ficaSemAlocacao ? "Sem vaga interna" : "Continua alocado em outro cliente"}
                  {!a.vagaInterna && a.ficaSemAlocacao && navegar && (
                    <> · <button className="link" onClick={() => navegar("Mercado", a.consultor.id)}>Ver no mercado</button></>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cartao secao">
        {!confirmando ? (
          <button className="botao" disabled={encerrar === 0} onClick={() => { setConfirmando(true); setMensagem(null); }}>Registrar corte</button>
        ) : (
          <div className="confirmar">
            <p><strong>{`Encerrar ${encerrar} alocações em ${dataBr(data)}?`}</strong></p>
            <label className="campo">
              Motivo (opcional)
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            <div className="acoes">
              <button className="botao" onClick={registrar} disabled={enviando}>{enviando ? "Registrando…" : "Confirmar"}</button>
              <button className="botao secundario" onClick={() => setConfirmando(false)}>Cancelar</button>
            </div>
          </div>
        )}
        {mensagem && <p role="status">{mensagem}</p>}
        {erro && <p className="erro">{erro}</p>}
        {api.modo === "demo" && <p className="suave pequeno">Na demonstração, o corte vale até recarregar a página.</p>}
      </div>
    </section>
  );
}
