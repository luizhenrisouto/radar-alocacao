import { useEffect, useState } from "react";
import type { Api } from "../api";
import { somarDias } from "../../../src/regras/datas";
import {
  ROTULO_TIPO, mensagemPessoa, rotuloDia, type ColaboradorPonto, type ConfigPonto, type DadosPonto, type EnvioPonto, type Pendencia,
} from "../../../supabase/functions/_shared/ponto.ts";
import type { PropsTela } from "../App";

const horario = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function statusEnvio(e: EnvioPonto): string {
  if (e.simulado) return "Simulado";
  return e.ok ? "Enviado" : `Falhou: ${e.erro ?? "erro desconhecido"}`;
}

export default function Ponto({ hoje, api }: PropsTela) {
  const [ponto, setPonto] = useState<DadosPonto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function carregar() {
    try {
      setPonto(await api.ponto());
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  useEffect(() => { void carregar(); }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const [acertando, setAcertando] = useState<string | null>(null);
  async function acertar(p: Pendencia, nome: string) {
    setAcertando(p.id);
    setErro(null);
    try {
      await api.acertarPendencia(p.id);
      setMensagem(`${rotuloDia(p.data)} de ${nome} marcado como acertado.`);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAcertando(null);
    }
  }

  async function cobrar() {
    setCobrando(true);
    setErro(null);
    try {
      const { enviados, falhas, ocupado } = await api.cobrarPonto();
      if (ocupado) setMensagem("Já há uma cobrança em andamento. Confira o registro em alguns minutos.");
      else if (enviados + falhas === 0) setMensagem("Ninguém para lembrar agora: quem tem pendência já foi lembrado hoje.");
      else if (api.modo === "demo") setMensagem(`${plural(enviados, "mensagem simulada", "mensagens simuladas")}.`);
      else setMensagem(`${plural(enviados, "mensagem enviada", "mensagens enviadas")}${falhas ? `, ${falhas} ${falhas === 1 ? "falhou" : "falharam"}` : ""}.`);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCobrando(false);
    }
  }

  if (!ponto) return erro ? <p className="erro">{erro}</p> : <p className="carregando">Carregando…</p>;

  const abertas = ponto.pendencias.filter((p) => p.resolvidaEm == null);
  const porPessoa = new Map<string, Pendencia[]>();
  for (const p of abertas) porPessoa.set(p.matricula, [...(porPessoa.get(p.matricula) ?? []), p]);
  const pessoas = [...porPessoa.entries()]
    .map(([m, lista]) => ({ colaborador: ponto.colaboradores.find((c) => c.matricula === m), pendencias: lista.sort((a, b) => a.data.localeCompare(b.data)) }))
    .filter((x): x is { colaborador: ColaboradorPonto; pendencias: Pendencia[] } => x.colaborador != null)
    .sort((a, b) => a.colaborador.nome.localeCompare(b.colaborador.nome, "pt-BR"));
  const semana = somarDias(hoje, -7);
  const cobrancas7 = ponto.envios.filter((e) => e.nivel === "pessoa" && e.ok && e.enviadoEm.slice(0, 10) > semana).length;
  const acertadas7 = ponto.pendencias.filter((p) => p.resolvidaEm != null && p.resolvidaEm > semana).length;
  const envios = [...ponto.envios].sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm)).slice(0, 30);
  const cfg = ponto.config;
  const canais = [cfg.emailAtivo && "E-mail", cfg.teamsAtivo && "Teams"].filter(Boolean).join(" e ") || "nenhum canal ligado";

  return (
    <section aria-label="Ponto">
      <div className="cartao">
        <h2>Ponto em dia</h2>
        <p className="suave pequeno">
          Dias úteis sem marcação ou com marcação incompleta, vindos da apuração do Senior. Cada pessoa recebe um lembrete por dia útil
          até ajustar; depois de {plural(cfg.escalarApos, "lembrete", "lembretes")}, o gestor é avisado.
        </p>
        <p className="nota-envio pequeno">O Radar só envia mensagens neste módulo, para o próprio colaborador e o gestor dele. Tudo fica registrado aqui.</p>
        <div className="acoes">
          <button className="botao" onClick={cobrar} disabled={cobrando}>
            {cobrando ? "Cobrando…" : api.modo === "demo" ? "Simular cobrança de hoje" : "Cobrar agora"}
          </button>
        </div>
        {mensagem && <p role="status">{mensagem}</p>}
        {erro && <p className="erro">{erro}</p>}
      </div>

      <div className="numeros numeros-4 secao">
        <div className="cartao numero destaque"><div className="rotulo">Pendências abertas</div><div className="valor">{abertas.length}</div></div>
        <div className="cartao numero"><div className="rotulo">Pessoas com pendência</div><div className="valor">{pessoas.length}</div></div>
        <div className="cartao numero"><div className="rotulo">Cobranças em 7 dias</div><div className="valor">{cobrancas7}</div></div>
        <div className="cartao numero"><div className="rotulo">Acertadas em 7 dias</div><div className="valor">{acertadas7}</div></div>
      </div>

      <div className="cartao secao">
        <h2>Quem precisa ajustar</h2>
        <p className="suave pequeno">
          A pessoa já ajustou no Senior e a planilha nova ainda não chegou? Clique em “Acertado” no dia. Se o dia voltar pendente na próxima importação, a pendência reabre.
        </p>
        {pessoas.length === 0 && <p>Ninguém com pendência. O ponto está em dia.</p>}
        <ul className="ponto-pessoas">
          {pessoas.map(({ colaborador: c, pendencias }) => {
            const lembretes = Math.max(...pendencias.map((p) => p.cobrancas));
            const ultima = pendencias.map((p) => p.ultimaCobranca).filter((x): x is string => x != null).sort().at(-1);
            const escalada = pendencias.some((p) => p.escalada);
            const m = mensagemPessoa(c, pendencias, hoje, cfg.remetenteNome);
            return (
              <li key={c.matricula} data-testid="ponto-pessoa">
                <div className="ponto-topo">
                  <div>
                    <strong>{c.nome}</strong>
                    {escalada && <span className="selo risco-atencao">Gestor avisado</span>}
                    {c.emailGestor == null && <span className="selo risco-alto">Sem gestor</span>}
                    <ul className="ponto-dias pequeno">
                      {pendencias.map((p) => (
                        <li key={p.id}>
                          {`${rotuloDia(p.data)} · ${ROTULO_TIPO[p.tipo]}`}
                          <button
                            className="link" disabled={acertando != null}
                            aria-label={`Marcar ${rotuloDia(p.data)} como acertada`} title="Já foi acertado no Senior"
                            onClick={() => acertar(p, c.nome)}
                          >
                            Acertado
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="suave pequeno">
                      {lembretes === 0 ? "Ainda não lembrado" : plural(lembretes, "lembrete", "lembretes")}
                      {ultima && ` · último em ${rotuloDia(ultima)}`}
                    </div>
                  </div>
                  <button className="link pequeno" aria-expanded={aberta === c.matricula} onClick={() => setAberta(aberta === c.matricula ? null : c.matricula)}>
                    {aberta === c.matricula ? "Fechar mensagem" : "Ver mensagem"}
                  </button>
                </div>
                {aberta === c.matricula && (
                  <div className="ponto-mensagem" data-testid="ponto-mensagem">
                    <div className="suave pequeno">Para {c.email} · {canais}</div>
                    <strong>{m.assunto}</strong>
                    <pre>{m.texto}</pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="cartao secao">
        <h2>Registro de envios</h2>
        {envios.length === 0 && <p className="suave">Nenhum envio ainda.</p>}
        <ul className="ponto-envios pequeno">
          {envios.map((e) => (
            <li key={e.id} data-testid="ponto-envio" className={e.ok ? "" : "falhou"}>
              <span className="num">{horario.format(new Date(e.enviadoEm))}</span>
              <span>{e.destino}</span>
              <span className="suave">{e.canal === "email" ? "E-mail" : "Teams"} · {e.nivel === "pessoa" ? "Pessoa" : "Gestor"}</span>
              <span className={e.ok ? "suave" : "erro"}>{statusEnvio(e)}</span>
            </li>
          ))}
        </ul>
      </div>

      <details className="cartao secao configuracoes-ponto">
        <summary>Configurações</summary>
        <p className="suave pequeno">
          Canais: {canais} · Lembrete a cada {plural(cfg.intervaloDias, "dia útil", "dias úteis")} · Gestor avisado depois de{" "}
          {plural(cfg.escalarApos, "lembrete", "lembretes")} · Remetente: {cfg.remetenteNome}
        </p>
        <Configuracoes key={JSON.stringify(cfg)} config={cfg} api={api} aoSalvar={carregar} />
      </details>
    </section>
  );
}

function Configuracoes({ config, api, aoSalvar }: { config: ConfigPonto; api: Api; aoSalvar: () => Promise<void> }) {
  const demo = api.modo === "demo";
  const [emailAtivo, setEmailAtivo] = useState(config.emailAtivo);
  const [teamsAtivo, setTeamsAtivo] = useState(config.teamsAtivo);
  const [remetente, setRemetente] = useState(config.remetenteNome);
  const [intervalo, setIntervalo] = useState(String(config.intervaloDias));
  const [escalar, setEscalar] = useState(String(config.escalarApos));
  const [url, setUrl] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const inteiro = (t: string, padrao: number) => {
    const n = Number(t.trim());
    return Number.isInteger(n) && n >= 1 && n <= 30 ? n : padrao;
  };

  async function executar(acao: () => Promise<void>, sucesso: string) {
    setOcupado(true);
    setAviso(null);
    setFalha(null);
    try {
      await acao();
      setAviso(sucesso);
    } catch (e) {
      setFalha((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const salvar = () => executar(async () => {
    await api.salvarConfigPonto({
      emailAtivo, teamsAtivo, remetenteNome: remetente.trim() || "RH",
      intervaloDias: inteiro(intervalo, config.intervaloDias), escalarApos: inteiro(escalar, config.escalarApos),
      teamsUrl: url.trim() === "" ? null : url.trim(),
    });
    await aoSalvar();
  }, "Configurações salvas.");

  return (
    <div className="campos-ponto">
      <div className="caixas">
        <label className="caixa"><input type="checkbox" checked={emailAtivo} disabled={demo} onChange={(e) => setEmailAtivo(e.target.checked)} />E-mail</label>
        <label className="caixa"><input type="checkbox" checked={teamsAtivo} disabled={demo} onChange={(e) => setTeamsAtivo(e.target.checked)} />Teams</label>
      </div>
      <label className="campo">Nome do remetente<input value={remetente} disabled={demo} onChange={(e) => setRemetente(e.target.value)} /></label>
      <label className="campo">Intervalo entre lembretes (dias úteis)<input inputMode="numeric" value={intervalo} disabled={demo} onChange={(e) => setIntervalo(e.target.value)} /></label>
      <label className="campo">Avisar o gestor depois de (lembretes)<input inputMode="numeric" value={escalar} disabled={demo} onChange={(e) => setEscalar(e.target.value)} /></label>
      <label className="campo">
        URL do fluxo do Teams
        <input
          type="url" value={url} disabled={demo} onChange={(e) => setUrl(e.target.value)}
          placeholder={config.teamsConfigurado ? "configurada" : "https://… (fluxo do Workflows no Teams)"}
        />
      </label>
      <p className="suave pequeno">A URL fica guardada só no servidor; depois de salva, aparece apenas como "configurada". Deixe em branco para manter a atual.</p>
      <div className="acoes">
        <button className="botao" disabled={demo || ocupado} onClick={salvar}>Salvar</button>
        <button className="botao secundario" disabled={demo || ocupado} onClick={() => executar(() => api.testarEnvioPonto(), "Teste enviado para o seu e-mail.")}>
          Enviar teste para mim
        </button>
      </div>
      {aviso && <p className="pequeno">{aviso}</p>}
      {falha && <p className="erro">{falha}</p>}
      {demo && <p className="suave pequeno">Entre com sua conta para configurar e enviar de verdade.</p>}
    </div>
  );
}
