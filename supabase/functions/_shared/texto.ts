/** Procura skills num texto livre (vaga colada, resposta da IA). Sem APIs do Deno: o app também usa. */
import { normalizarSkill } from "./matching.ts";

/** Sem acento, minúsculo, separado em tudo que não é letra, número, # ou +. "Node.js, C#" → ["node", "js", "c#"]. */
export function tokensDoTexto(texto: string): string[] {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9#+]+/).filter(Boolean);
}

/** A skill aparece no texto se a forma normalizada dela é a junção de 1 a 3 tokens seguidos ("Type Script" = TypeScript; "JavaScript" ≠ Java). */
export function skillNoTexto(skill: string, tokens: string[]): boolean {
  const alvo = normalizarSkill(skill).replace(/[^a-z0-9#+]/g, "");
  if (!alvo) return false;
  for (let i = 0; i < tokens.length; i++) {
    let junto = "";
    for (let j = i; j < Math.min(i + 3, tokens.length); j++) {
      junto += tokens[j];
      if (junto === alvo) return true;
      if (!alvo.startsWith(junto)) break;
    }
  }
  return false;
}

/**
 * As skills que aparecem no texto, na ordem da lista. A mais longa ocupa as palavras primeiro:
 * "REST Assured" não conta também "REST", mas "Java e JavaScript" conta as duas.
 */
export function skillsNoTexto(skills: string[], tokens: string[]): string[] {
  const usados = new Set<number>();
  const achadas = new Set<string>();
  const alvo = (s: string) => normalizarSkill(s).replace(/[^a-z0-9#+]/g, "");
  for (const s of [...skills].sort((a, b) => alvo(b).length - alvo(a).length)) {
    const a = alvo(s);
    if (!a) continue;
    busca: for (let i = 0; i < tokens.length; i++) {
      let junto = "";
      for (let j = i; j < Math.min(i + 3, tokens.length) && !usados.has(j); j++) {
        junto += tokens[j];
        if (junto === a) {
          for (let k = i; k <= j; k++) usados.add(k);
          achadas.add(s);
          break busca;
        }
        if (!a.startsWith(junto)) break;
      }
    }
  }
  return skills.filter((s) => achadas.has(s));
}
