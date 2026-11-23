import { useState } from "react";
import type { Api } from "../api";

export default function Entrar({ api, aoEntrar, aoCancelar }: { api: Api; aoEntrar: () => void; aoCancelar: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api.entrar(email.trim(), senha);
      aoEntrar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-label="Entrar" className="cartao">
      <h2>Entrar com sua conta</h2>
      <p className="suave pequeno">Com login, o radar mostra os dados da sua empresa e libera a importação de planilhas.</p>
      <form className="campos" onSubmit={enviar}>
        <label>E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Senha<input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
        {erro && <p className="erro">{erro}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="botao" type="submit" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
          <button className="botao secundario" type="button" onClick={aoCancelar}>Voltar à demonstração</button>
        </div>
      </form>
    </section>
  );
}
