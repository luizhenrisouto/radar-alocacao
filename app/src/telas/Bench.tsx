import { Fragment, useState } from "react";
import { resumoBench } from "../../../src/regras/bench";
import {
  PREMISSAS_PADRAO, contaManterOuDesligar, normalizarPremissas, type ContaPessoa, type Parcela, type Premissas,
} from "../../../src/regras/desligamento";
import type { PropsTela } from "../App";
import { diasUteis, meses, reais } from "../formatar";
import {
  CAMPOS_PREMISSAS, FONTES_PREMISSAS, ROTULO_ORIGEM, gravarPremissas, lerNumero, lerPremissas, textoDoNumero,
} from "../premissas";

type Textos = Record<(typeof CAMPOS_PREMISSAS)[number]["campo"], string>;
const textosDe = (p: Premissas) => Object.fromEntries(CAMPOS_PREMISSAS.map(({ campo }) => [campo, textoDoNumero(p[campo])])) as Textos;


export default function Bench({ dados, hoje }: PropsTela) {
  const [inicial] = useState(lerPremissas);
  const [textos, setTextos] = useState<Textos>(() => textosDe(inicial));
  const [contarReceita, setContarReceita] = useState(inicial.contarReceitaParada);
  const [aberta, setAberta] = useState<string | null>(null);

  const premissas = normalizarPremissas({
    ...Object.fromEntries(Object.entries(textos).map(([campo, t]) => [campo, lerNumero(t)])),
    contarReceitaParada: contarReceita,
  });

  function mudar(novosTextos: Textos, novaReceita: boolean) {
    setTextos(novosTextos);
    setContarReceita(novaReceita);
    gravarPremissas(normalizarPremissas({
      ...Object.fromEntries(Object.entries(novosTextos).map(([campo, t]) => [campo, lerNumero(t)])),
      contarReceitaParada: novaReceita,
    }));
  }

  const itens = resumoBench(dados, hoje);
  const total = itens.reduce((s, i) => s + i.custoAcumulado, 0);
  const mes = dados.empresa.diasUteisMes;
  return (
    <section aria-label="Bench">
      <div className="cartao">
        <h2>{`Custo acumulado: ${reais(total)}`}</h2>
        <p className="suave pequeno">
          Dias úteis desde o fim da última alocação (ou desde a admissão), vezes o custo diário de cada pessoa.
          "Manter por mais" conta a partir de hoje: por quantos dias úteis manter a pessoa parada ainda sai mais barato que desligar e recontratar.
        </p>
        {itens.length === 0 ? (
          <p>Ninguém no bench hoje.</p>
        ) : (
          <table className="lista">
            <thead>
              <tr>
                <th>Pessoa</th><th className="ocultar-celular">Cargo</th><th className="dir">Dias</th>
                <th className="dir">Custo acumulado</th><th className="dir">Manter por mais</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const conta = contaManterOuDesligar(dados, i.consultor, hoje, premissas);
                const id = i.consultor.id;
                return (
                  <Fragment key={id}>
                    <tr data-testid="bench-linha">
                      <td>
                        {i.consultor.nome}<span className="selo">{i.consultor.regime}</span>
                        <div className="suave pequeno">{i.consultor.skills.join(", ")}</div>
                        <button className="link pequeno" aria-expanded={aberta === id} onClick={() => setAberta(aberta === id ? null : id)}>
                          {aberta === id ? "Fechar a conta" : "Ver a conta"}
                        </button>
                      </td>
                      <td className="ocultar-celular">{i.consultor.cargo}</td>
                      <td className="dir num">{i.dias}</td>
                      <td className="dir num">{reais(i.custoAcumulado)}</td>
                      <td className="dir">
                        {conta.pontoDeVirada == null ? (
                          <span className="suave pequeno">sem custo cadastrado</span>
                        ) : (
                          <>
                            <span className="num">{diasUteis(conta.pontoDeVirada)}</span>
                            <div className="suave pequeno">{meses(conta.pontoDeVirada, mes)}</div>
                          </>
                        )}
                      </td>
                    </tr>
                    {aberta === id && (
                      <tr>
                        <td colSpan={5}><DetalheConta conta={conta} premissas={premissas} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <details className="cartao secao premissas">
        <summary>Premissas da conta</summary>
        <div className="premissas-campos">
          {CAMPOS_PREMISSAS.map(({ campo, rotulo, origem }) => (
            <label key={campo} className="campo">
              <span>{rotulo} <span className="selo">{ROTULO_ORIGEM[origem]}</span></span>
              <input
                type="text" inputMode="decimal" aria-label={rotulo} value={textos[campo]}
                onChange={(e) => mudar({ ...textos, [campo]: e.target.value }, contarReceita)}
              />
            </label>
          ))}
        </div>
        <label className="caixa">
          <input type="checkbox" checked={contarReceita} onChange={(e) => mudar(textos, e.target.checked)} />
          Contar a margem perdida enquanto contrata
        </label>
        <p className="suave pequeno">
          Campo vazio ou inválido usa o padrão. As premissas ficam guardadas só neste navegador.
        </p>
        <button className="botao secundario" onClick={() => mudar(textosDe(PREMISSAS_PADRAO), PREMISSAS_PADRAO.contarReceitaParada)}>
          Voltar aos padrões
        </button>
        <h3 className="pequeno">Fontes</h3>
        <ul className="fontes pequeno">
          {FONTES_PREMISSAS.map((f) => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer">{f.titulo}</a></li>)}
        </ul>
      </details>
    </section>
  );
}

function ListaParcelas({ titulo, parcelas, total }: { titulo: string; parcelas: Parcela[]; total: number }) {
  return (
    <div>
      <h3>{titulo}</h3>
      <ul className="parcelas">
        {parcelas.map((p) => (
          <li key={p.chave}>
            <div className="parcela-linha">
              <span>{p.rotulo}<span className={`selo origem-${p.origem}`}>{ROTULO_ORIGEM[p.origem]}</span></span>
              <span className="num">{reais(p.valor)}</span>
            </div>
            <div className="suave pequeno">{p.formula}</div>
          </li>
        ))}
      </ul>
      <div className="parcela-linha total"><span>Total</span><span className="num">{reais(total)}</span></div>
    </div>
  );
}

function DetalheConta({ conta, premissas }: { conta: ContaPessoa; premissas: Premissas }) {
  const regime = conta.consultor.regime;
  return (
    <div data-testid="conta" className="conta">
      <div className="conta-colunas">
        <ListaParcelas titulo="Desligar" parcelas={conta.desligar} total={conta.totalDesligar} />
        <ListaParcelas titulo="Recontratar" parcelas={conta.recontratar} total={conta.totalRecontratar} />
      </div>
      <p>
        Manter custa <span className="num">{reais(conta.custoDiario)}</span> por dia útil.{" "}
        {conta.pontoDeVirada == null
          ? "Sem custo cadastrado, não há ponto de virada."
          : <strong>{`A partir de hoje, por até ${diasUteis(conta.pontoDeVirada)}, manter sai mais barato que desligar e recontratar.`}</strong>}
      </p>
      <ul className="notas suave pequeno">
        {regime === "CLT" && <li>Férias e 13º proporcionais não entram: já estão no custo mensal.</li>}
        {regime === "CLT" && conta.salarioEstimado && <li>{`Salário estimado: custo mensal ÷ ${textoDoNumero(premissas.fatorEncargosClt)}.`}</li>}
        {conta.aviso && <li>{conta.aviso}</li>}
        <li>A conta supõe que vai aparecer uma vaga para esse perfil.</li>
      </ul>
    </div>
  );
}
