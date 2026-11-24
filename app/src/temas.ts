/**
 * Identidade visual por empresa. Para uma empresa nova: copie um bloco de TEMAS, troque as cores e as fontes,
 * e escolha o tema com a variável VITE_TEMA no build. Alerta (âmbar) e crítico (vermelho) mantêm o significado
 * em qualquer tema; os testes conferem o contraste de todos os temas.
 */

export type Cores = Record<
  "fundo" | "superficie" | "tinta" | "tinta-suave" | "linha" | "marca" | "marca-clara" | "sobre-marca"
  | "alerta" | "alerta-fundo" | "critico" | "bom" | "barra",
  string
>;

export interface Tema {
  id: string;
  nome: string;
  claro: Cores;
  escuro: Cores;
  fontes: { texto: string; titulos: string; numeros: string };
  /** Folha de estilo das fontes (Google Fonts). */
  fontesUrl?: string;
  /** Imagem no topo, no lugar do sinal redondo. */
  logo?: string;
}

const NUMEROS = '"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace';

const radar: Tema = {
  id: "radar",
  nome: "Radar (neutro)",
  claro: {
    fundo: "#f3f0e8", superficie: "#fffdf8", tinta: "#15211f", "tinta-suave": "#5b6663", linha: "#ddd6c8",
    marca: "#123f3a", "marca-clara": "#d6e6e2", "sobre-marca": "#f3f0e8", alerta: "#c9781a", "alerta-fundo": "#fbecd5",
    critico: "#b4442c", bom: "#2f7d5b", barra: "#9fbdb6",
  },
  escuro: {
    fundo: "#101716", superficie: "#17211f", tinta: "#e9ede9", "tinta-suave": "#9aa8a4", linha: "#2a3835",
    marca: "#7fc4b6", "marca-clara": "#1d3330", "sobre-marca": "#101716", alerta: "#f0b25a", "alerta-fundo": "#3a2b14",
    critico: "#ef8a72", bom: "#7fcfa6", barra: "#3f6b63",
  },
  fontes: {
    texto: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    titulos: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    numeros: NUMEROS,
  },
  fontesUrl: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
};

const datum: Tema = {
  id: "datum",
  nome: "Datum",
  claro: {
    fundo: "#f6f4fa", superficie: "#ffffff", tinta: "#2b2638", "tinta-suave": "#5f5a6e", linha: "#e2ddea",
    marca: "#633ca1", "marca-clara": "#ece4f7", "sobre-marca": "#ffffff", alerta: "#c9781a", "alerta-fundo": "#fbecd5",
    critico: "#b4442c", bom: "#177a62", barra: "#2bc29f",
  },
  escuro: {
    fundo: "#16121f", superficie: "#1f1a2b", tinta: "#ece9f3", "tinta-suave": "#a49fb4", linha: "#342c45",
    marca: "#b59cf0", "marca-clara": "#2b2140", "sobre-marca": "#16121f", alerta: "#f0b25a", "alerta-fundo": "#3a2b14",
    critico: "#ef8a72", bom: "#4fd6b4", barra: "#2bc29f",
  },
  fontes: {
    texto: '"Quicksand", system-ui, -apple-system, "Segoe UI", sans-serif',
    titulos: '"Rockwell", "Rockwell Nova", "Roboto Slab", Georgia, serif',
    numeros: NUMEROS,
  },
  fontesUrl: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Quicksand:wght@500;600;700&family=Roboto+Slab:wght@700&display=swap",
};

export const TEMAS: Record<string, Tema> = { radar, datum };
export const TEMA_PADRAO = "datum";

export function escolherTema(id: string | undefined): Tema {
  return TEMAS[(id ?? "").trim().toLowerCase()] ?? TEMAS[TEMA_PADRAO];
}

function variaveis(c: Cores): string {
  return Object.entries(c).map(([k, v]) => `  --${k}: ${v};`).join("\n");
}

/** CSS das variáveis do tema, para o modo claro e o escuro. */
export function cssDoTema(t: Tema): string {
  const fontes = `  --fonte: ${t.fontes.texto};\n  --fonte-titulos: ${t.fontes.titulos};\n  --numeros: ${t.fontes.numeros};`;
  return `:root {\n${variaveis(t.claro)}\n${fontes}\n  color-scheme: light;\n}\n`
    + `@media (prefers-color-scheme: dark) {\n:root {\n${variaveis(t.escuro)}\n  color-scheme: dark;\n}\n}\n`;
}

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste da WCAG entre duas cores #rrggbb (de 1 a 21). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

function elemento<T extends HTMLElement>(doc: Document, id: string, tag: string): T {
  let el = doc.getElementById(id) as T | null;
  if (!el) {
    el = doc.createElement(tag) as T;
    el.id = id;
    doc.head.appendChild(el);
  }
  return el;
}

/** Aplica o tema na página: variáveis de cor, fontes e ícone da aba. Pode ser chamado de novo para trocar. */
export function aplicarTema(t: Tema, doc: Document): void {
  elemento<HTMLStyleElement>(doc, "tema", "style").textContent = cssDoTema(t);

  if (t.fontesUrl) {
    const fontes = elemento<HTMLLinkElement>(doc, "tema-fontes", "link");
    fontes.rel = "stylesheet";
    fontes.href = t.fontesUrl;
  } else {
    doc.getElementById("tema-fontes")?.remove();
  }

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='${t.claro.marca}'/><circle cx='16' cy='16' r='5' fill='${t.claro.barra}'/></svg>`;
  const icone = elemento<HTMLLinkElement>(doc, "tema-icone", "link");
  icone.rel = "icon";
  icone.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
