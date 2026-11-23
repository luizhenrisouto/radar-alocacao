import Anthropic from "npm:@anthropic-ai/sdk";
import { explicarParaEmpresa, MODELO_PADRAO, type PedidoExplicar } from "../_shared/explicar.ts";
import { clienteServico, empresaDoUsuario, servir } from "../_shared/deno.ts";

// ANTHROPIC_API_KEY vem dos segredos do projeto. MODELO_IA é opcional (padrão: claude-haiku-5-5).
const ia = new Anthropic();

servir(async (req) => {
  const corpo = (await req.json().catch(() => null)) as PedidoExplicar;
  const sb = clienteServico();
  return await explicarParaEmpresa(corpo, {
    empresaDoUsuario: await empresaDoUsuario(req),
    async carregar(vagaId, ids) {
      const { data: v } = await sb.from("vagas")
        .select("id, empresa_id, titulo, senioridade, skills_obrigatorias, skills_desejaveis").eq("id", vagaId).maybeSingle();
      if (!v) return null;
      const { data: cs } = await sb.from("consultores").select("id, empresa_id, nome, cargo, senioridade, skills").in("id", ids);
      return {
        empresaId: v.empresa_id,
        vaga: { id: v.id, titulo: v.titulo, senioridade: v.senioridade, skillsObrigatorias: v.skills_obrigatorias, skillsDesejaveis: v.skills_desejaveis },
        consultores: (cs ?? []).map((c) => ({ id: c.id, empresaId: c.empresa_id, nome: c.nome, cargo: c.cargo, senioridade: c.senioridade, skills: c.skills })),
      };
    },
    async salvar(vagaId, itens) {
      const { error } = await sb.rpc("salvar_matches", { p_vaga: vagaId, p_matches: itens });
      if (error) throw new Error(error.message);
    },
    ia,
    modelo: Deno.env.get("MODELO_IA") ?? MODELO_PADRAO,
  });
});
