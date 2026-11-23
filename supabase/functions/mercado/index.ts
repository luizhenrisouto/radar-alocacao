import Anthropic from "npm:@anthropic-ai/sdk";
import { MODELO_PADRAO } from "../_shared/explicar.ts";
import { atenderMercado } from "../_shared/mercado.ts";
import { empresaDoUsuario, servir } from "../_shared/deno.ts";

// Extrair vaga colada, perfil anônimo e rascunho de e-mail. Sem estado: não lê nem grava o banco, só confere a empresa.
const ia = new Anthropic();

servir(async (req) => {
  const corpo = await req.json().catch(() => null);
  return await atenderMercado(corpo, {
    empresaDoUsuario: await empresaDoUsuario(req),
    ia,
    modelo: Deno.env.get("MODELO_IA") ?? MODELO_PADRAO,
  });
});
