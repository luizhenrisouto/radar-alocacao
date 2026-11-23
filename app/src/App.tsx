import { useEffect, useState } from "react";
import { hojeSaoPaulo } from "../../src/regras/datas";
import type { DadosEmpresa } from "../../src/regras/tipos";
import type { Api } from "./api";
import Bench from "./telas/Bench";
import Entrar from "./telas/Entrar";
import Importar from "./telas/Importar";
import Mercado from "./telas/Mercado";
import Painel from "./telas/Painel";
import Ponto from "./telas/Ponto";
import SimularCorte from "./telas/SimularCorte";
import Vagas from "./telas/Vagas";

export const ABAS = ["Painel", "Bench", "Vagas", "Simular corte", "Mercado", "Ponto", "Importar"] as const;
export type Aba = (typeof ABAS)[number];

export interface PropsTela {
  dados: DadosEmpresa; hoje: string; api: Api; recarregar: () => void;
  /** Troca de aba, opcionalmente com uma pessoa em foco. */
  navegar?: (aba: Aba, consultorId?: string) => void;
  foco?: string | null;
}

interface Props { demo: Api; real: Api | null; hoje?: string }

export default function App({ demo, real, hoje = hojeSaoPaulo() }: Props) {
  const [api, setApi] = useState<Api>(demo);
  const [usuario, setUsuario] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [dados, setDados] = useState<DadosEmpresa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("Painel");
  const [versao, setVersao] = useState(0);
  const [foco, setFoco] = useState<string | null>(null);

  async function usarReal() {
    if (!real) return;
    const s = await real.sessao().catch(() => null);
    if (s) { setUsuario(s.email); setApi(real); setEntrando(false); }
  }

  useEffect(() => { void usarReal(); }, [real]);

  // Trocar de empresa (demo ↔ real) limpa a tela; recarregar a mesma empresa mantém os dados atuais
  // enquanto busca os novos, para a tela aberta (ex.: a confirmação da importação) não ser desmontada.
  useEffect(() => { setDados(null); }, [api]);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    api.dados().then((d) => { if (vivo) setDados(d); }).catch((e: Error) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [api, versao]);

  async function sair() {
    await api.sair();
    setUsuario(null);
    setApi(demo);
  }

  const navegar = (a: Aba, consultorId?: string) => { setFoco(consultorId ?? null); setAba(a); };
  const props = dados ? { dados, hoje, api, recarregar: () => setVersao((v) => v + 1), navegar, foco } : null;

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">
          <span className="marca-sinal" aria-hidden="true" />
          <span>Radar de Alocação</span>
        </div>
        {api.modo === "real" ? (
          <span className="empresa">
            {dados?.empresa.nome} · {usuario}{" "}
            <button className="botao secundario" onClick={sair}>Sair</button>
          </span>
        ) : (
          dados && <span className="empresa">{dados.empresa.nome}</span>
        )}
      </header>
      {api.modo === "demo" && (
        <div className="faixa-demo">
          <span>Demonstração: Nexo Consultoria (dados fictícios)</span>
          {real && !entrando && <button onClick={() => setEntrando(true)}>Entrar</button>}
        </div>
      )}
      {entrando && real ? (
        <main className="conteudo secao">
          <Entrar api={real} aoEntrar={usarReal} aoCancelar={() => setEntrando(false)} />
        </main>
      ) : (
        <>
          <nav className="abas" role="tablist">
            {ABAS.map((a) => (
              <button key={a} role="tab" aria-selected={aba === a} className={aba === a ? "aba ativa" : "aba"} onClick={() => navegar(a)}>
                {a}
              </button>
            ))}
          </nav>
          <main className="conteudo">
            {erro && <p className="erro">Não foi possível carregar os dados: {erro}</p>}
            {!erro && !props && <p className="carregando">Carregando…</p>}
            {props && <Tela aba={aba} {...props} />}
          </main>
        </>
      )}
    </div>
  );
}

function Tela({ aba, ...props }: PropsTela & { aba: Aba }) {
  if (aba === "Painel") return <Painel {...props} />;
  if (aba === "Bench") return <Bench {...props} />;
  if (aba === "Vagas") return <Vagas {...props} />;
  if (aba === "Simular corte") return <SimularCorte {...props} />;
  if (aba === "Mercado") return <Mercado {...props} />;
  if (aba === "Ponto") return <Ponto {...props} />;
  return <Importar {...props} />;
}
