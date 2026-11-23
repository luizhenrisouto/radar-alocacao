import { useEffect, useRef, useState } from "react";
import { somarDias } from "../../../src/regras/datas";
import {
  anonimo, citaSoSkills, emailPorRegra, encaixesPorPessoa, extrairVagaPorRegra, leadsDeMercado, perfilPorRegra, proibidosDe, setoresDe, skillsConhecidas,
  type Lead, type Perfil, type RascunhoEmail, type RascunhoVaga,
} from "../../../src/regras/mercado";
import { NIVEIS, type Consultor, type Senioridade } from "../../../src/regras/tipos";
import type { PropsTela } from "../App";
import { dataBr, reais } from "../formatar";

const ROTULO_NIVEL: Record<Senioridade, string> = { junior: "Júnior", pleno: "Pleno", senior: "Sênior", especialista: "Especialista" };
const separar = (s: string) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

interface Formulario { rascunho: RascunhoVaga; origem: "ia" | "regra"; inicio: string; url: string; obrigatorias: string; desejaveis: string }

function Selo({ origem }: { origem: "ia" | "regra" }) {
  return <span className={origem === "ia" ? "selo ia" : "selo"}>{origem === "ia" ? "IA" : "Regra"}</span>;
}

export default function Mercado({ dados, hoje, api, recarregar, foco }: PropsTela) {
  const [texto, setTexto] = useState("");
  const [link, setLink] = useState("");
  const [lendo, setLendo] = useState(false);
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<{ consultor: Consultor; perfil: Perfil } | null>(null);
  const [email, setEmail] = useState<{ lead: Lead; email: RascunhoEmail } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const focoRef = useRef<HTMLLIElement | null>(null);
  // Um pedido à IA por vez; a resposta de um pedido antigo é descartada (nunca mostra o perfil da pessoa errada).
  const [gerando, setGerando] = useState<string | null>(null);
  const pedido = useRef(0);

  const leads = leadsDeMercado(dados, hoje);
  // Quem vem do simulador de corte pode ainda não estar saindo: entra na lista mesmo assim.
  const pessoas = encaixesPorPessoa(dados, hoje, 60, foco ? [foco] : []);
  const remetente = dados.empresa.nome;

  useEffect(() => { focoRef.current?.scrollIntoView?.({ block: "center" }); }, [foco]);

  async function ler() {
    if (!texto.trim()) return;
    setLendo(true);
    setErro(null);
    const daIa = await api.extrairVaga(texto).catch(() => null);
    const rascunho = daIa ?? extrairVagaPorRegra(texto, skillsConhecidas(dados));
    setForm({
      rascunho, origem: daIa ? "ia" : "regra", inicio: somarDias(hoje, 30), url: link.trim(),
      obrigatorias: rascunho.skillsObrigatorias.join(", "), desejaveis: rascunho.skillsDesejaveis.join(", "),
    });
    setLendo(false);
  }

  const mudar = (campo: Partial<RascunhoVaga>) => form && setForm({ ...form, rascunho: { ...form.rascunho, ...campo } });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSalvando(true);
    setErro(null);
    try {
      await api.salvarVagaExterna({
        ...form.rascunho, empresaAlvo: form.rascunho.empresaAlvo.trim(), titulo: form.rascunho.titulo.trim(),
        skillsObrigatorias: separar(form.obrigatorias), skillsDesejaveis: separar(form.desejaveis),
        url: form.url || null, inicioPrevisto: form.inicio, origem: form.origem,
      });
      setForm(null);
      setTexto("");
      setLink("");
      recarregar();
    } catch (x) {
      setErro((x as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function abrirPerfil(c: Consultor) {
    setEmail(null);
    setPerfil(null);
    const meu = ++pedido.current;
    setGerando(`perfil:${c.id}`);
    const setores = setoresDe(dados, c.id);
    const daIa = await api.perfilAnonimo(c, setores).catch(() => null);
    if (meu !== pedido.current) return;
    setGerando(null);
    const textos = daIa ? [daIa.titulo, daIa.resumo, ...daIa.destaques] : [];
    const seguro = daIa && anonimo(textos, proibidosDe(dados, c)) && citaSoSkills(textos, skillsConhecidas(dados), c.skills);
    setPerfil({ consultor: c, perfil: seguro ? daIa : perfilPorRegra(c, setores) });
  }

  async function abrirEmail(lead: Lead) {
    setPerfil(null);
    setEmail(null);
    setCopiado(false);
    const meu = ++pedido.current;
    setGerando(`email:${lead.empresa}`);
    const perfis = lead.pessoas.map((p) => perfilPorRegra(p, setoresDe(dados, p.id)));
    const daIa = await api.rascunhoEmail(lead, perfis, remetente).catch(() => null);
    if (meu !== pedido.current) return;
    setGerando(null);
    const proibidos = lead.pessoas.flatMap((p) => proibidosDe(dados, p));
    const permitidas = [...lead.pessoas.flatMap((p) => p.skills), ...lead.vagas.flatMap((v) => [...v.skillsObrigatorias, ...v.skillsDesejaveis])];
    const seguro = daIa && anonimo([daIa.assunto, daIa.corpo], proibidos) && citaSoSkills([daIa.assunto, daIa.corpo], skillsConhecidas(dados), permitidas);
    setEmail({ lead, email: seguro ? daIa : emailPorRegra(lead, perfis, remetente) });
  }

  async function copiar(t: string) {
    try { await navigator.clipboard.writeText(t); setCopiado(true); } catch { setCopiado(false); }
  }

  async function apagar(id: string) {
    await api.apagarVagaExterna(id).catch((x: Error) => setErro(x.message));
    recarregar();
  }

  return (
    <section aria-label="Mercado">
      <div className="grade-2">
        <div className="cartao nao-imprimir">
          <h2>Colar vaga do mercado</h2>
          <p className="suave pequeno">Cole o texto de uma vaga que você viu (LinkedIn, Gupy, e-mail de um contato). O radar encontra quem do time encaixa.</p>
          <div className="campos-coluna">
            <label className="campo">
              Texto da vaga
              <textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={20000} />
            </label>
            <label className="campo">
              Link (opcional, só para guardar)
              <input value={link} onChange={(e) => setLink(e.target.value)} />
            </label>
            <div><button className="botao" onClick={ler} disabled={lendo || !texto.trim()}>{lendo ? "Lendo…" : "Ler vaga"}</button></div>
          </div>

          {form && (
            <form aria-label="Vaga lida" className="campos-coluna secao" onSubmit={salvar}>
              <div>Vaga lida <Selo origem={form.origem} /></div>
              <label className="campo">Empresa<input value={form.rascunho.empresaAlvo} onChange={(e) => mudar({ empresaAlvo: e.target.value })} /></label>
              <label className="campo">Título<input required value={form.rascunho.titulo} onChange={(e) => mudar({ titulo: e.target.value })} /></label>
              <label className="campo">
                Senioridade
                <select value={form.rascunho.senioridade} onChange={(e) => mudar({ senioridade: e.target.value as Senioridade })}>
                  {NIVEIS.map((n) => <option key={n} value={n}>{ROTULO_NIVEL[n]}</option>)}
                </select>
              </label>
              <label className="campo">Skills obrigatórias<input value={form.obrigatorias} onChange={(e) => setForm({ ...form, obrigatorias: e.target.value })} /></label>
              <label className="campo">Skills desejáveis<input value={form.desejaveis} onChange={(e) => setForm({ ...form, desejaveis: e.target.value })} /></label>
              <label className="campo">Cidade<input value={form.rascunho.cidade ?? ""} onChange={(e) => mudar({ cidade: e.target.value || null })} /></label>
              <label className="pessoa-corte"><input type="checkbox" checked={form.rascunho.remoto} onChange={(e) => mudar({ remoto: e.target.checked })} /> Aceita remoto</label>
              <label className="campo">Início previsto<input type="date" value={form.inicio} onChange={(e) => e.target.value && setForm({ ...form, inicio: e.target.value })} /></label>
              <div className="acoes">
                <button className="botao" type="submit" disabled={salvando || separar(form.obrigatorias).length === 0}>{salvando ? "Salvando…" : "Salvar vaga"}</button>
                <button className="botao secundario" type="button" onClick={() => setForm(null)}>Cancelar</button>
              </div>
            </form>
          )}
          {erro && <p className="erro">{erro}</p>}
        </div>

        <div className="cartao nao-imprimir">
          <h2>Leads</h2>
          {leads.length === 0 && <p className="suave pequeno">Nenhum lead ainda. Cole vagas do mercado para ver onde o time encaixa.</p>}
          {leads.map((l) => (
            <div key={l.empresa} className="lead" data-testid="lead">
              <div className="candidato-topo">
                <h3>{l.empresa}</h3>
                <span className="suave pequeno">{l.vagas.length === 1 ? "1 vaga" : `${l.vagas.length} vagas`}</span>
              </div>
              <p className="pequeno">Encaixam: {l.pessoas.map((p) => p.nome).join(", ")}</p>
              <p className="suave pequeno">Custo dessas pessoas paradas: <span className="num">{reais(l.custoMensalParado)}</span>/mês</p>
              <button className="botao secundario" onClick={() => abrirEmail(l)} disabled={gerando != null}>
                {gerando === `email:${l.empresa}` ? "Gerando…" : "Rascunho de e-mail"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {perfil && (
        <div className="cartao secao perfil-impressao" data-testid="perfil">
          <p className="suave pequeno">Perfil · {remetente}</p>
          <h2>{perfil.perfil.titulo} <Selo origem={perfil.perfil.origem} /></h2>
          <p>{perfil.perfil.resumo}</p>
          {perfil.perfil.destaques.length > 0 && <ul>{perfil.perfil.destaques.map((d) => <li key={d}>{d}</li>)}</ul>}
          <div className="acoes nao-imprimir">
            <button className="botao" onClick={() => window.print()}>Imprimir</button>
            <button className="botao secundario" onClick={() => setPerfil(null)}>Fechar</button>
          </div>
        </div>
      )}

      {email && (
        <div className="cartao secao nao-imprimir" data-testid="email">
          <h2>E-mail para {email.lead.empresa} <Selo origem={email.email.origem} /></h2>
          <p className="suave pequeno">Rascunho para você revisar e enviar do seu e-mail. O radar não envia nada.</p>
          <div className="campos-coluna">
            <label className="campo">Assunto<input readOnly value={email.email.assunto} /></label>
            <label className="campo">Corpo<textarea readOnly rows={10} value={email.email.corpo} /></label>
          </div>
          <div className="acoes secao">
            <button className="botao" onClick={() => copiar(`${email.email.assunto}\n\n${email.email.corpo}`)}>Copiar</button>
            <button className="botao secundario" onClick={() => setEmail(null)}>Fechar</button>
            {copiado && <span role="status" className="pequeno">Copiado.</span>}
          </div>
        </div>
      )}

      <div className="cartao secao nao-imprimir">
        <h2>Por pessoa</h2>
        <p className="suave pequeno">Quem está no bench ou sai nos próximos 60 dias, com as vagas do mercado em que aparece entre os 3 primeiros.</p>
        <ul className="afetados">
          {pessoas.map((p) => {
            const emFoco = p.consultor.id === foco;
            return (
              <li key={p.consultor.id} data-testid="pessoa-mercado" aria-current={emFoco ? "true" : undefined} className={emFoco ? "em-foco" : undefined} ref={emFoco ? focoRef : undefined}>
                <div className="candidato-topo">
                  <div><strong>{p.consultor.nome}</strong> <span className="suave pequeno">{p.consultor.cargo}</span></div>
                  <button className="botao secundario" onClick={() => abrirPerfil(p.consultor)} disabled={gerando != null}>
                    {gerando === `perfil:${p.consultor.id}` ? "Gerando…" : "Perfil anônimo"}
                  </button>
                </div>
                <div className="pequeno suave">{p.disponivelEm <= hoje ? "Disponível agora" : `Disponível a partir de ${dataBr(p.disponivelEm)}`}</div>
                <div className="pequeno">
                  {p.vagas.length === 0 ? "Nenhuma vaga do mercado ainda." : p.vagas.map((v) => `${v.titulo} · ${v.empresaAlvo || "Empresa não informada"}`).join("; ")}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {dados.vagasExternas.length > 0 && (
        <div className="cartao secao nao-imprimir">
          <h2>Vagas do mercado</h2>
          <ul className="afetados">
            {dados.vagasExternas.map((v) => (
              <li key={v.id} data-testid="vaga-externa">
                <div className="candidato-topo">
                  <div>
                    <strong>{v.titulo}</strong> <span className="suave pequeno">{v.empresaAlvo || "Empresa não informada"} · início {dataBr(v.inicioPrevisto)}</span>
                    <Selo origem={v.origem === "ia" ? "ia" : "regra"} />
                  </div>
                  <button className="botao secundario" onClick={() => apagar(v.id)}>Apagar</button>
                </div>
                <div className="pequeno suave">
                  {v.skillsObrigatorias.join(", ")}
                  {v.url && <> · <a href={v.url} target="_blank" rel="noopener noreferrer">ver anúncio</a></>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
