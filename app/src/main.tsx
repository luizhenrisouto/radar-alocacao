import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { hojeSaoPaulo } from "../../src/regras/datas";
import App from "./App";
import { apiDemo } from "./api-demo";
import { apiSupabase } from "./api-supabase";
import "./estilo.css";

// Sem as variáveis do Supabase, o app roda só com a demonstração (é o que vai para o GitHub Pages por padrão).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const real = url && chave ? apiSupabase(url, chave, () => hojeSaoPaulo()) : null;

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App demo={apiDemo()} real={real} />
  </StrictMode>,
);
