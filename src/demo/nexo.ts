/**
 * Nexo Consultoria: consultoria fictícia para a demonstração. Nenhum dado real.
 * A história: a Cooperativa Saúde Sul concentra mais de um terço dos alocados e 7 contratos dela vencem em até 60 dias;
 * há 4 pessoas no bench e vagas abertas (várias no Hospital Vida Plena) que encaixam em quem está saindo.
 * Todas as datas são relativas a "hoje", para a demo continuar coerente em qualquer dia.
 */
import { somarDias } from "../regras/datas";
import { explicacaoPorRegra, rankearCandidatos } from "../regras/matching";
import type { Alocacao, Cliente, Consultor, DadosEmpresa, Match, Regime, Senioridade, Sinal, TipoSinal, Vaga } from "../regras/tipos";
import explicacoesIa from "./explicacoes-nexo.json";

const CLIENTES: [string, string, string][] = [
  ["cli1", "Cooperativa Saúde Sul", "Saúde"],
  ["cli2", "Banco Horizonte", "Financeiro"],
  ["cli3", "Varejo Aurora", "Varejo"],
  ["cli4", "Seguradora Atlântica", "Seguros"],
  ["cli5", "Energia Pampa", "Energia"],
  ["cli6", "LogTrans", "Logística"],
  ["cli7", "EduMais", "Educação"],
  ["cli8", "Hospital Vida Plena", "Saúde"],
];

const VALOR_HORA: Record<Senioridade, number> = { junior: 70, pleno: 110, senior: 150, especialista: 200 };

// id, nome, cargo, senioridade, skills, regime, custo mensal, cidade, cliente da última alocação,
// fim da alocação em dias a partir de hoje (null = sem fim; negativo = já terminou, a pessoa está no bench)
type Linha = [string, string, string, Senioridade, string[], Regime, number, string, string | null, number | null];
const POA = "Porto Alegre", CANOAS = "Canoas", SL = "São Leopoldo", NH = "Novo Hamburgo";
const PESSOAS: Linha[] = [
  ["c01", "Ana Ribeiro", "QA Sênior", "senior", ["Playwright", "TypeScript", "Rest Assured", "Java", "JMeter", "Kafka", "Azure DevOps"], "CLT", 14500, POA, "cli1", 8],
  ["c02", "Bruno Carvalho", "Dev Java Pleno", "pleno", ["Java", "Spring Boot", "Oracle", "Kafka", "Docker"], "CLT", 12000, POA, "cli1", 14],
  ["c03", "Camila Duarte", "Dev Front-end Pleno", "pleno", ["React", "TypeScript", "Next.js", "CSS", "Jest"], "PJ", 11500, CANOAS, "cli1", 14],
  ["c04", "Diego Fontes", "Analista de Integração Sênior", "senior", ["Oracle ORDS", "OIC", "PL/SQL", "REST", "Kafka"], "CLT", 15000, POA, "cli1", 21],
  ["c05", "Elisa Moraes", "QA Pleno", "pleno", ["Cypress", "JavaScript", "Postman", "SQL", "Gherkin"], "CLT", 9500, SL, "cli1", 30],
  ["c06", "Felipe Nunes", "Dev .NET Sênior", "senior", ["C#", ".NET", "SQL Server", "Azure", "Docker"], "PJ", 16000, POA, "cli1", 45],
  ["c07", "Gabriela Lopes", "Product Owner", "pleno", ["Scrum", "Jira", "Saúde Suplementar", "ANS", "BPMN"], "CLT", 13000, POA, "cli1", 55],
  ["c08", "Henrique Prado", "DevOps Sênior", "senior", ["Azure DevOps", "Kubernetes", "Terraform", "Docker", "Keycloak"], "PJ", 17500, POA, "cli1", 120],
  ["c09", "Isabela Teixeira", "Analista de Dados Pleno", "pleno", ["SQL", "Power BI", "Python", "Oracle"], "CLT", 10500, NH, "cli1", 150],
  ["c10", "João Pedro Alves", "Dev Java Sênior", "senior", ["Java", "Spring Boot", "Kafka", "Keycloak", "Microsserviços"], "CLT", 16500, POA, "cli1", null],
  ["c11", "Larissa Mendes", "UX Designer", "pleno", ["Figma", "UX Research", "Design System", "Acessibilidade"], "PJ", 11000, POA, "cli1", null],
  ["c12", "Marcelo Rocha", "Dev Mobile Pleno", "pleno", ["React Native", "TypeScript", "Firebase", "Jest"], "CLT", 11500, CANOAS, "cli1", 180],
  ["c13", "Natália Freitas", "Scrum Master", "senior", ["Scrum", "Kanban", "Jira", "Facilitação"], "CLT", 12500, POA, "cli1", 200],
  ["c14", "Otávio Barros", "Dev Java Sênior", "senior", ["Java", "Spring Boot", "AWS", "Kafka", "PostgreSQL"], "CLT", 17000, POA, "cli2", 240],
  ["c15", "Paula Cardoso", "QA Sênior", "senior", ["Selenium", "Java", "Cucumber", "Rest Assured", "Jenkins"], "PJ", 14000, POA, "cli2", null],
  ["c16", "Rafael Gomes", "Dev Python Pleno", "pleno", ["Python", "Django", "PostgreSQL", "Docker"], "CLT", 11000, SL, "cli2", 100],
  ["c17", "Sabrina Lima", "Arquiteta de Soluções", "especialista", ["AWS", "Microsserviços", "Kafka", "Java", "Terraform"], "PJ", 22000, POA, "cli2", null],
  ["c18", "Tiago Martins", "Dev Front-end Sênior", "senior", ["Angular", "TypeScript", "RxJS", "Jest"], "CLT", 14000, POA, "cli2", 75],
  ["c19", "Vanessa Pires", "Analista de Segurança", "senior", ["OWASP", "Pentest", "Keycloak", "SAST"], "PJ", 16000, POA, "cli2", null],
  ["c20", "Wagner Souza", "DBA Sênior", "senior", ["PostgreSQL", "Oracle", "SQL Server", "Performance"], "CLT", 15000, CANOAS, "cli2", 300],
  ["c21", "Yasmin Castro", "Dev Full Stack Pleno", "pleno", ["Node.js", "React", "TypeScript", "MongoDB"], "CLT", 11500, POA, "cli3", 65],
  ["c22", "André Batista", "QA Pleno", "pleno", ["Cypress", "TypeScript", "Postman", "Gherkin"], "Cooperado", 9000, NH, "cli3", 95],
  ["c23", "Beatriz Ramos", "Dev Mobile Sênior", "senior", ["Kotlin", "Swift", "Flutter", "Firebase"], "PJ", 15500, POA, "cli3", null],
  ["c24", "Caio Ferreira", "Engenheiro de Dados", "senior", ["Python", "Spark", "Airflow", "SQL", "AWS"], "PJ", 17000, POA, "cli3", 130],
  ["c25", "Daniela Monteiro", "Product Owner Sênior", "senior", ["Scrum", "Jira", "E-commerce", "Analytics"], "CLT", 14000, POA, "cli3", null],
  ["c26", "Eduardo Vieira", "Dev .NET Pleno", "pleno", ["C#", ".NET", "SQL Server", "Azure"], "CLT", 11000, SL, "cli4", 85],
  ["c27", "Fernanda Araújo", "QA Automação Sênior", "senior", ["SpecFlow", "C#", "Selenium", "Azure DevOps"], "PJ", 13500, POA, "cli4", null],
  ["c28", "Gustavo Pinto", "Dev Java Pleno", "pleno", ["Java", "Spring Boot", "Oracle", "Docker"], "CLT", 11500, POA, "cli4", 160],
  ["c29", "Helena Costa", "Analista de Requisitos", "pleno", ["BPMN", "UML", "Jira", "Seguros"], "Cooperado", 10000, CANOAS, "cli4", null],
  ["c30", "Igor Santana", "Dev Python Sênior", "senior", ["Python", "FastAPI", "PostgreSQL", "Docker", "Kafka"], "PJ", 16000, POA, "cli5", 110],
  ["c31", "Juliana Cunha", "Analista de Dados Sênior", "senior", ["Power BI", "SQL", "Python", "Azure"], "CLT", 13500, POA, "cli5", null],
  ["c32", "Kleber Machado", "DevOps Pleno", "pleno", ["Docker", "Kubernetes", "GitHub Actions", "Linux"], "CLT", 12000, NH, "cli5", 140],
  ["c33", "Luana Dias", "Dev Node Pleno", "pleno", ["Node.js", "TypeScript", "PostgreSQL", "Redis"], "CLT", 11000, POA, "cli6", 70],
  ["c34", "Mateus Correia", "QA Pleno", "pleno", ["Playwright", "TypeScript", "k6", "Postman"], "PJ", 9800, POA, "cli6", null],
  ["c35", "Nicole Andrade", "Dev Front-end Pleno", "pleno", ["Vue.js", "TypeScript", "CSS", "Acessibilidade"], "CLT", 10500, SL, "cli7", 90],
  ["c36", "Pedro Henrique Lima", "Analista de Sistemas Sênior", "senior", ["HL7", "FHIR", "SQL", "Saúde Suplementar", "Java"], "CLT", 14500, POA, "cli8", null],
  ["c37", "Renata Farias", "Dev Java Pleno", "pleno", ["Java", "Spring Boot", "PostgreSQL", "Docker"], "CLT", 11000, POA, "cli2", -4],
  ["c38", "Sérgio Antunes", "QA Pleno", "pleno", ["Selenium", "Java", "Postman", "SQL"], "Cooperado", 9200, CANOAS, "cli3", -10],
  ["c39", "Thaís Rezende", "Dev React Sênior", "senior", ["React", "TypeScript", "Node.js", "GraphQL"], "PJ", 15000, POA, "cli6", -18],
  ["c40", "Vítor Campos", "Analista de Dados Júnior", "junior", ["SQL", "Python", "Power BI"], "CLT", 6000, POA, null, null],
];

// id, cliente, título, senioridade, obrigatórias, desejáveis, início previsto em dias a partir de hoje
type LinhaVaga = [string, string, string, Senioridade, string[], string[], number];
const VAGAS: LinhaVaga[] = [
  ["v01", "cli8", "QA Sênior · Portal do Beneficiário", "senior", ["Playwright", "TypeScript", "Rest Assured", "Kafka"], ["JMeter", "Saúde Suplementar"], 15],
  ["v02", "cli8", "Analista de Integração · Prontuário", "senior", ["Kafka", "REST", "PL/SQL"], ["FHIR", "HL7"], 30],
  ["v03", "cli2", "Dev Java Pleno · Pagamentos", "pleno", ["Java", "Spring Boot", "Kafka"], ["Docker", "PostgreSQL"], 20],
  ["v04", "cli3", "Dev Front-end React", "pleno", ["React", "TypeScript"], ["Jest", "Next.js"], 20],
  ["v05", "cli4", "Dev .NET Sênior", "senior", ["C#", ".NET", "SQL Server"], ["Azure"], 50],
  ["v06", "cli6", "QA Pleno · APIs", "pleno", ["Postman", "SQL"], ["Java", "Selenium"], 7],
  ["v07", "cli5", "Dev React Sênior", "senior", ["React", "TypeScript", "Node.js"], ["GraphQL"], 10],
  ["v08", "cli2", "Dev Java Pleno · Crédito", "pleno", ["Java", "Spring Boot", "PostgreSQL"], ["Docker"], 5],
  ["v09", "cli7", "Analista de Dados Júnior", "junior", ["SQL", "Power BI"], ["Python"], 10],
  ["v10", "cli8", "Product Owner · Saúde", "pleno", ["Scrum", "Jira", "Saúde Suplementar"], ["ANS"], 60],
];

/** Quem a equipe de alocação escolheria para cada vaga (usado no eval). */
export const GABARITO_NEXO: Record<string, string> = {
  v01: "c01", v02: "c04", v03: "c02", v04: "c03", v05: "c06", v06: "c38", v07: "c39", v08: "c37", v09: "c40", v10: "c07",
};

/** Notícias fictícias, sem link: um link real ao lado de uma manchete inventada seria enganoso. */
function sinaisNexo(d: (n: number) => string): Sinal[] {
  const s = (id: string, clienteId: string, tipo: TipoSinal, gravidade: number, dias: number, titulo: string, resumo: string): Sinal => ({
    id, clienteId, titulo, url: null, fonte: "Exemplo fictício", publicadoEm: d(-dias), tipo, gravidade, resumo, origem: "ia",
  });
  return [
    s("s1", "cli1", "corte", 3, 6, "Cooperativa Saúde Sul anuncia plano de redução de custos para 2027",
      "Plano de redução de custos para 2027 prevê revisar contratos com fornecedores, inclusive de tecnologia."),
    s("s2", "cli1", "resultado_ruim", 2, 20, "Cooperativa Saúde Sul registra prejuízo no terceiro trimestre",
      "Prejuízo no terceiro trimestre, puxado pelo aumento de custos assistenciais."),
    s("s3", "cli8", "expansao", 1, 10, "Hospital Vida Plena inaugura nova ala e amplia equipe de tecnologia",
      "Nova ala e equipe de tecnologia maior: oportunidade para oferecer gente."),
    s("s4", "cli2", "troca_diretoria", 1, 40, "Banco Horizonte anuncia novo diretor de tecnologia",
      "Novo diretor de tecnologia; costuma vir revisão de fornecedores."),
    s("s5", "cli5", "irrelevante", 0, 15, "Energia Pampa patrocina corrida de rua", "Patrocínio de evento esportivo."),
  ];
}

const emailDe = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(" ").join(".") + "@nexo.exemplo";

export function gerarNexo(hoje: string): DadosEmpresa {
  const d = (n: number) => somarDias(hoje, n);
  const clientes: Cliente[] = CLIENTES.map(([id, nome, setor]) => ({ id, nome, setor }));
  const consultores: Consultor[] = PESSOAS.map(([id, nome, cargo, senioridade, skills, regime, custoMensal, cidade]) => ({
    id, nome, email: emailDe(nome), cargo, senioridade, skills, regime, custoMensal, cidade, aceitaRemoto: true,
    admitidoEm: id === "c40" ? d(-12) : d(-400 - Number(id.slice(1)) * 7),
  }));
  const alocacoes: Alocacao[] = PESSOAS.filter((p) => p[8] != null).map(([id, , , sen, , , , , cli, fim]) => ({
    id: `a${id.slice(1)}`, consultorId: id, clienteId: cli as string, inicio: d(-300), fim: fim == null ? null : d(fim),
    valorHora: VALOR_HORA[sen], status: fim != null && fim < 0 ? "encerrada" : "ativa",
  }));
  const vagas: Vaga[] = VAGAS.map(([id, clienteId, titulo, senioridade, skillsObrigatorias, skillsDesejaveis, inicio]) => ({
    id, clienteId, titulo, senioridade, skillsObrigatorias, skillsDesejaveis, inicioPrevisto: d(inicio),
    valorHora: VALOR_HORA[senioridade], status: "aberta",
  }));
  const base: DadosEmpresa = {
    empresa: { id: "nexo", nome: "Nexo Consultoria", limiteConcentracao: 0.3, diasUteisMes: 22 },
    clientes, consultores, alocacoes, vagas, matches: [], vagasExternas: [], sinais: sinaisNexo(d),
  };
  const ia = explicacoesIa as Record<string, string>;
  const matches: Match[] = vagas.flatMap((v) =>
    rankearCandidatos(base, v.id, hoje).map((c): Match => {
      const texto = ia[`${v.id}:${c.consultor.id}`];
      return {
        vagaId: v.id, consultorId: c.consultor.id, nota: c.nota, geradoEm: hoje,
        explicacao: texto ?? explicacaoPorRegra(c, v, hoje), origem: texto ? "ia" : "regra",
      };
    }),
  );
  return { ...base, matches };
}
