# Radar de Alocação

Radar para consultorias de TI que alocam profissionais em clientes. Ele mostra:

- **Bench:** quem está sem cliente, há quantos dias úteis e quanto isso já custou.
- **Manter ou desligar:** para cada pessoa no bench (CLT, PJ ou cooperado), por quantos dias úteis, a partir de hoje, mantê-la parada ainda sai mais barato que desligar e recontratar. "Ver a conta" mostra cada parcela (aviso prévio, multa do FGTS, recrutamento, rampa e margem perdida enquanto a vaga espera alguém) com a origem: lei, dado de mercado ou estimativa. As premissas são editáveis na tela e ficam no navegador. No simulador de corte, a mesma conta aparece somada para quem fica sem vaga.
- **Contratos vencendo** em 30, 60 e 90 dias.
- **Risco de concentração:** quanto do time e da receita depende de cada cliente, com alerta acima do limite (30% por padrão).
- **Matching de vaga com consultor:** os 5 melhores candidatos de cada vaga, com uma frase da IA explicando o encaixe ou o que falta.
- **Importação de planilhas** (CSV ou XLSX) para usar com os dados da empresa. O regime aceita CLT, PJ e Cooperado, e a coluna "Salário" é opcional (sem ela, a conta de CLT estima o salário pelo custo mensal).
- **Simulador de corte:** e se um cliente cortar 50% do time numa data? Mostra quem sai, a receita perdida por mês, quanto o bench passa a custar e quem já tem vaga interna. O botão "Registrar corte" encerra as alocações de uma vez e guarda o histórico.
- **Mercado (vender o bench):** o comercial cola o texto de uma vaga vista no mercado, a IA extrai título, senioridade e skills (só as que estão no texto), e o mesmo matching mostra os leads (empresa, vagas, quem encaixa). Gera o perfil anônimo de cada pessoa, para imprimir em PDF, e um rascunho de e-mail para copiar. O radar nunca envia nada.
- **Ponto em dia:** o RH importa a apuração do Senior (planilha), o radar acha os dias úteis sem marcação ou com marcação incompleta e lembra cada pessoa todo dia útil às 9h, por e-mail e/ou Teams, até ela ajustar no Senior. Depois de 2 lembretes (configurável), o gestor recebe um resumo da equipe. O painel mostra quem está pendente, quem já foi lembrado, quem acertou e o registro de cada envio, inclusive as falhas. **É o único módulo que envia mensagens**, e só para o próprio colaborador e o gestor cadastrado dele. Na demonstração, a cobrança é simulada.
- **Notícias dos clientes:** toda segunda (e no botão "Buscar agora"), o radar lê as manchetes de cada cliente no Google Notícias, a IA classifica cada uma (corte, resultado ruim, fusão, troca de diretoria, congelamento, expansão) e o painel mostra a nota de risco por cliente, sempre com o link da notícia.

Sem configuração nenhuma, o app abre a **Nexo Consultoria**, uma consultoria fictícia gerada em memória com datas relativas a hoje. Essa demonstração não usa servidor.

## Como medimos

| Medida | Resultado | Como |
|---|---|---|
| Acerto do matching | **10/10 (100%)** | Para cada vaga da Nexo há um candidato de gabarito; conta acerto quando ele aparece entre os 3 primeiros. `npm run eval` |
| Quem sai em 60 dias e já tem vaga | **6 de 7** | Contratos vencendo em até 60 dias cuja pessoa está no top 3 de alguma vaga aberta |
| Classificação de notícias | **27 de 30 pela regra** (IA: rode `npm run eval:sinais` com a chave) | 30 manchetes de empresas fictícias com o tipo esperado, algumas feitas para enganar palavras-chave. `npm run eval:sinais` |
| Testes | 302 unitários, de banco e de tela + 14 E2E | `npm test` e `npm run e2e` (computador e celular) |

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # regras, banco (PGlite), telas
npm run e2e        # Playwright no Chrome instalado, computador e celular
npm run eval       # acerto do matching
npm run eval:sinais   # acerto da classificação de notícias (regra; com ANTHROPIC_API_KEY, também a IA)
npm run exportar:nexo # grava a Nexo como planilhas em app/public/modelos/nexo-*.csv
```

## Stack

Vite + React 19 + TypeScript · Supabase (Postgres com RLS por empresa, Auth, Edge Functions) · Claude (explicações do matching) · Vitest, Testing Library, PGlite e Playwright.

As regras (`src/regras`) são funções puras. As telas recebem uma `Api`, que tem duas implementações: `apiDemo` (Nexo, em memória) e `apiSupabase` (dados reais).

## Ligar o modo real (Supabase)

1. Crie um projeto no Supabase e rode `npx supabase link --project-ref <ref>` e `npx supabase db push` (as migrações estão em `supabase/migrations`).
2. Grave a chave da IA: `npx supabase secrets set ANTHROPIC_API_KEY=...` (opcional: `MODELO_IA`, `ORIGEM_PAINEL`).
3. Publique as funções:
   ```bash
   npx supabase functions deploy explicar-match
   npx supabase functions deploy mercado
   npx supabase functions deploy sinais --no-verify-jwt   # a função confere o login ou a chave do agendamento
   npx supabase functions deploy ponto --no-verify-jwt    # idem
   ```
4. Crie a empresa e o primeiro usuário. Primeiro crie o usuário em Authentication. Depois rode no SQL Editor:
   ```sql
   insert into empresas (nome) values ('Minha Consultoria') returning id;
   insert into membros (user_id, empresa_id) values ('<id do usuário>', '<id da empresa>');
   ```
5. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. No GitHub, use as variáveis de repositório com os mesmos nomes.
6. Busca semanal das notícias (opcional; sem ela, use o botão "Buscar agora" do painel):
   - grave uma chave qualquer: `npx supabase secrets set CHAVE_AGENDAMENTO=...`;
   - ative `pg_cron` e `pg_net` em Database > Extensions;
   - rode no SQL Editor o `supabase/agendamento.sql.exemplo`, com o id do projeto e a mesma chave.
   Se o nome de um cliente trouxer notícias de outra empresa, preencha `clientes.termo_busca` com um termo mais exato.
7. Ponto em dia (lembretes de marcação):
   - **E-mail:** crie uma conta no [Resend](https://resend.com) e grave `npx supabase secrets set RESEND_API_KEY=... PONTO_REMETENTE=ponto@seudominio.com.br`. Com o remetente de teste do Resend (`onboarding@resend.dev`), só dá para enviar ao e-mail da própria conta; para lembrar a empresa toda, verifique o domínio no Resend.
   - **Teams (opcional):** no Teams, abra Workflows e crie um fluxo com o gatilho "Quando uma solicitação de webhook do Teams for recebida" e a ação "Postar mensagem em um chat ou canal", postando como Flow bot num chat com o destinatário `triggerBody()?['destinatario']` e a mensagem com `triggerBody()?['assunto']` e `triggerBody()?['texto']`. Copie a URL do gatilho e cole em Ponto > Configurações. Se o Workflows estiver bloqueado, peça ao TI para liberar ou use só o e-mail.
   - **Lembrete diário:** o `supabase/agendamento.sql.exemplo` já traz o job `ponto-diario` (segunda a sexta, 9h).
   - **Planilhas:** importe primeiro "Colaboradores do ponto" (matrícula, nome, e-mail, e-mail do gestor e, para quem saiu, "não" em Ativo) e depois "Marcações do ponto" (matrícula, data, marcações, situação), uma linha por pessoa e dia, como no relatório de apuração do Senior. Importe sempre o período inteiro em aberto (o mês até ontem, por exemplo): a pendência fecha quando o dia volta acertado na planilha, ou quando o RH clica em "Acertado" no dia (se o dia voltar pendente numa importação seguinte, ela reabre). Os modelos estão na aba Importar.
   - **Uma rodada por vez:** o agendamento e o botão "Cobrar agora" usam uma trava por empresa, então ninguém é lembrado duas vezes no mesmo dia. Cada envio é gravado assim que sai, e os e-mails saem espaçados por causa do limite do Resend.
   - **Fase 2:** ligar direto na API do Senior (`ClockingEventExportByPeriod`, do Marcação de Ponto) com credenciais da empresa, no lugar da planilha.

Para gerar as explicações e os perfis anônimos da IA da demonstração (ficam salvos em `src/demo/explicacoes-nexo.json` e `src/demo/perfis-nexo.json`), rode:

```bash
ANTHROPIC_API_KEY=... npx tsx scripts/gerar-explicacoes.ts
```

## Publicar

O workflow `.github/workflows/pages.yml` testa, faz o build e publica no GitHub Pages a cada push na `main`. Ative o Pages com a origem "GitHub Actions" nas configurações do repositório.

## Cores da empresa

As cores e as fontes ficam em `app/src/temas.ts`, um bloco por empresa (hoje: `datum`, o padrão, e `radar`, o visual neutro). Para outra empresa:
1. Copie um bloco de `TEMAS`, dê um `id` novo e troque as cores do modo claro e do escuro, as fontes e, se quiser, o `logo` (imagem no topo).
2. Escolha o tema no build com `VITE_TEMA=<id>`. No GitHub Pages, crie a variável `VITE_TEMA` do repositório. Sem ela, ou com um id que não existe, o app usa o padrão.

O alerta (âmbar) e o crítico (vermelho) devem manter o significado em qualquer tema. O `npm test` confere o contraste de todos os temas e recusa combinações ilegíveis.

## Dados e LGPD

A demonstração usa só dados fictícios, inclusive as notícias e o ponto de exemplo. No modo real, cada usuário vê apenas os dados da própria empresa (RLS). O que vai para a IA:
- **Explicações e perfil anônimo:** cargo, senioridade, skills, setores, cidade e se aceita remoto. Nunca o nome, o e-mail ou o nome dos clientes.
- **Vaga colada:** o texto da vaga.
- **Notícias:** as manchetes.

O Ponto não usa IA: as marcações e os e-mails ficam no banco da empresa e só saem nos lembretes para o próprio colaborador e o gestor dele.

O app recusa o perfil ou o e-mail da IA que cite o nome, o e-mail ou um cliente da pessoa, e usa o texto da regra no lugar. Nada de dado pessoal vai para log.
