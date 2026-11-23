/**
 * Exporta a Nexo Consultoria como as 3 planilhas da importação (CSV do Excel em português: BOM e ";"),
 * para carregar a mesma história numa conta logada e mostrar a IA ao vivo.
 * Uso: npm run exportar:nexo → app/public/modelos/nexo-{consultores,alocacoes,vagas,ponto_colaboradores,ponto_marcacoes}.csv (datas relativas a hoje).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gerarNexo } from "../src/demo/nexo";
import { pontoNexo } from "../src/demo/ponto-nexo";
import { CAMPOS, type TipoImportacao } from "../src/importacao/colunas";
import { hojeSaoPaulo } from "../src/regras/datas";
import type { Senioridade } from "../src/regras/tipos";

const NIVEL: Record<Senioridade, string> = { junior: "Júnior", pleno: "Pleno", senior: "Sênior", especialista: "Especialista" };
const data = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const dinheiro = (n: number | null) => (n == null ? "" : `R$ ${n.toFixed(2).replace(".", ",")}`);
const celula = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function csv(tipo: TipoImportacao, linhas: string[][]): string {
  const cabecalho = CAMPOS[tipo].map((c) => c.rotulo);
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}

export function planilhasNexo(hoje: string): Record<TipoImportacao, string> {
  const d = gerarNexo(hoje);
  const ponto = pontoNexo(hoje);
  const email = (id: string) => d.consultores.find((c) => c.id === id)!.email;
  const cliente = (id: string) => d.clientes.find((c) => c.id === id)!.nome;
  return {
    consultores: csv("consultores", d.consultores.map((c) => [
      c.nome, c.email, c.cargo, NIVEL[c.senioridade], c.skills.join(", "), c.regime, dinheiro(c.custoMensal), dinheiro(c.salario ?? null), c.cidade ?? "",
      c.aceitaRemoto ? "sim" : "não", data(c.admitidoEm),
    ])),
    alocacoes: csv("alocacoes", d.alocacoes.map((a) => [email(a.consultorId), cliente(a.clienteId), data(a.inicio), data(a.fim), dinheiro(a.valorHora)])),
    vagas: csv("vagas", d.vagas.map((v) => [
      v.titulo, cliente(v.clienteId), NIVEL[v.senioridade], v.skillsObrigatorias.join(", "), v.skillsDesejaveis.join(", "), data(v.inicioPrevisto), dinheiro(v.valorHora),
    ])),
    ponto_colaboradores: csv("ponto_colaboradores", ponto.colaboradores.map((c) => [c.matricula, c.nome, c.email, c.emailGestor ?? ""])),
    ponto_marcacoes: csv("ponto_marcacoes", ponto.dias.map((x) => [x.matricula, data(x.data), x.marcacoes.join(" "), x.situacao ?? ""])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pasta = path.resolve(import.meta.dirname, "../app/public/modelos");
  for (const [tipo, conteudo] of Object.entries(planilhasNexo(hojeSaoPaulo()))) {
    const arquivo = path.join(pasta, `nexo-${tipo}.csv`);
    fs.writeFileSync(arquivo, conteudo);
    console.log(`Gravado ${path.relative(process.cwd(), arquivo)}`);
  }
  console.log("Importe na ordem: consultores, alocações, vagas; depois colaboradores do ponto e marcações do ponto.");
}
