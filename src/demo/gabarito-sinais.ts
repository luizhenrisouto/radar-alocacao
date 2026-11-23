/**
 * Gabarito da classificação de notícias: 30 manchetes com o tipo que a equipe esperaria.
 * Todas as empresas são fictícias. Algumas manchetes enganam palavras-chave de propósito
 * ("nega rumores de demissões", "contrata consultoria para cortar custos").
 */
import type { TipoSinal } from "../regras/tipos";

export const GABARITO_SINAIS: { titulo: string; tipo: TipoSinal }[] = [
  { titulo: "Cooperativa Litoral demite 300 funcionários após revisão de contratos", tipo: "corte" },
  { titulo: "Banco Meridiano anuncia corte de vagas na área de tecnologia", tipo: "corte" },
  { titulo: "Rede Solar fará redução de quadro de 15% até março", tipo: "corte" },
  { titulo: "Seguradora Prisma desliga equipes terceirizadas de TI", tipo: "corte" },
  { titulo: "Grupo Vértice anuncia plano de eficiência e revê contratos com fornecedores", tipo: "corte" },
  { titulo: "TechSul contrata consultoria para cortar custos", tipo: "corte" },
  { titulo: "Operadora Vale Verde registra prejuízo de R$ 80 milhões no trimestre", tipo: "resultado_ruim" },
  { titulo: "Varejista Estrela entra com pedido de recuperação judicial", tipo: "resultado_ruim" },
  { titulo: "Hospital Santa Aurora tem queda no lucro pelo terceiro ano", tipo: "resultado_ruim" },
  { titulo: "Agência reguladora coloca operadora Bem Viver em direção fiscal", tipo: "resultado_ruim" },
  { titulo: "Grupo Atlas adquire a Clínica Horizonte por R$ 200 milhões", tipo: "fusao" },
  { titulo: "Fusão entre Banco Norte e Banco Pampa é aprovada pelo Cade", tipo: "fusao" },
  { titulo: "Seguradora Prisma é vendida para fundo estrangeiro", tipo: "fusao" },
  { titulo: "Cooperativa Litoral anuncia novo CEO para 2027", tipo: "troca_diretoria" },
  { titulo: "Presidente da Rede Solar deixa o cargo após dez anos", tipo: "troca_diretoria" },
  { titulo: "Ex-executivo de banco assume a presidência da Operadora Vale Verde", tipo: "troca_diretoria" },
  { titulo: "Diretor de tecnologia do Banco Meridiano renuncia", tipo: "troca_diretoria" },
  { titulo: "Varejo Luz congela contratações até o fim do semestre", tipo: "congelamento" },
  { titulo: "Banco Norte suspende contratações na área de TI", tipo: "congelamento" },
  { titulo: "Energia Serra adia projetos de modernização para 2027", tipo: "congelamento" },
  { titulo: "Grupo Atlas pausa as contratações e revisa orçamento", tipo: "congelamento" },
  { titulo: "Hospital Santa Aurora inaugura nova ala e amplia equipe de TI", tipo: "expansao" },
  { titulo: "TechSul abre 200 vagas para desenvolvedores", tipo: "expansao" },
  { titulo: "Rede Bem Estar investe R$ 50 milhões em transformação digital", tipo: "expansao" },
  { titulo: "Logística Rota anuncia expansão para o Nordeste", tipo: "expansao" },
  { titulo: "Clínica Horizonte cresce 30% e prepara novas unidades", tipo: "expansao" },
  { titulo: "Banco Pampa nega rumores de demissões em massa", tipo: "irrelevante" },
  { titulo: "Operadora Vale Verde lança campanha de vacinação", tipo: "irrelevante" },
  { titulo: "Energia Serra recebe prêmio de sustentabilidade", tipo: "irrelevante" },
  { titulo: "Seguradora Prisma muda horário de atendimento no feriado", tipo: "irrelevante" },
];
