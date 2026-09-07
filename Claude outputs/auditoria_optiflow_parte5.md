# Auditoria OptiFlow — Parte 5 (Módulo de Consulta)

Cobre `pages/consulta/` — o módulo de consultas/clínica (optometria), usado pelos tenants no plano Consultório e também pela parte de Consulta/Rx do plano Ótica. É o maior módulo do sistema: 22 arquivos, quase 460 KB de código.

Dado o tamanho, fiz uma varredura por padrões de risco em 100% dos arquivos (o mesmo bug de data, tratamento de erro, chaves/credenciais) e uma leitura detalhada dos pontos que a varredura sinalizou. Não reli linha a linha os 22 arquivos por completo — registro isso porque é diferente do nível de detalhe que consegui dar às Partes 1–4, e quero ser transparente sobre isso.

Nenhuma linha de código foi alterada.

---

## Achado 1 (continuação) — o mesmo bug de fuso horário, espalhado por praticamente todo o módulo de Consulta

Como já vínhamos vendo, esse não é um problema de uma tela — é um padrão usado errado em vários lugares. Aqui no módulo de Consulta apareceu em pelo menos 6 telas, e três delas com o mesmo tipo de efeito prático que já vimos no Financeiro/Dashboard principal:

**`FilaEsperaConsultas.tsx` (impacto: alto)** — a tela de Fila de Espera (usada durante o atendimento, em tempo real) busca os agendamentos **diretamente no banco** filtrando por `.eq('date', hoje)` — não é só uma classificação visual errada, é a própria consulta ao Supabase que sai errada. À noite, essa tela buscaria os agendamentos de amanhã, mostrando "Nenhum paciente na fila hoje" mesmo com pacientes de verdade esperando.

**`InicioConsultas.tsx` (impacto: alto)** — é o painel inicial do módulo de Consulta (equivalente ao Dashboard principal, mas para esse módulo): "agendadas hoje", "realizadas hoje", "receita do mês", "consultas do mesmo mês no ano passado" — todos os cálculos partem do mesmo `hoje`/`inicioMes`/`fimMes` calculados com esse padrão. Mesmo problema, mesmo horário de efeito (a partir de ~20h).

**`FinanceiroConsultas.tsx` (impacto: alto)** — a aba financeira própria do módulo de Consulta. Tem o card "Vencido" e o selo por linha, exatamente como no Financeiro principal (Parte 2, Achado 1) — à noite, uma conta que vence hoje aparece como vencida antes da hora.

**`FichaPaciente.tsx` (impacto: médio-alto)** — a ficha de um paciente específico mostra quantas parcelas de crediário dele estão vencidas, usando `due_date < hoje` com o mesmo cálculo. Esse é o mesmo domínio da reclamação original (valores de crediário em atraso) — só que aqui aplicado a um paciente específico, não à loja toda.

**`ConsultaPage.tsx` (impacto: médio)** — o card "Hoje" na lista geral de consultas conta errado à noite, pelo mesmo motivo.

**`RelatoriosConsultas.tsx` (impacto: médio)** — os botões de período rápido ("Hoje", "Semana", "30 dias", "Ano") têm exatamente o mesmo problema já visto em `RelatoriosPage.tsx` (Parte 3): clicar em "Hoje" à noite busca a data de amanhã.

**`RelatoriosOperacionais.tsx` (impacto: baixo)** — só usa esse cálculo pra definir o início de uma janela de "últimos 12 meses"; o efeito de estar até um dia adiantado nessa fronteira é pouco perceptível num relatório de 12 meses.

**`NovaConsultaModal.tsx` e `PacientesTab.tsx` (impacto: baixo)** — aqui o padrão só preenche a data padrão de um formulário novo (agendamento/atendimento), igual ao que já vimos na Agenda (Parte 2) — à noite, o campo de data viria preenchido com amanhã em vez de hoje, mas é fácil de perceber e corrigir na hora.

Passamos de 24 para pelo menos 30 arquivos com essa mesma classe de bug confirmada ao longo da auditoria. Vou consolidar a lista completa, por prioridade, no relatório final.

---

## Revisado sem novos problemas

Os outros 12 arquivos do módulo (`AjustesConsultas.tsx`, `AuditoriaConsultas.tsx`, `ConfiguracoesConsultas.tsx`, `DadosClinica.tsx`, `FichaClinicaConsultas.tsx`, `HistoricoPage.tsx`, `ModelosConsultas.tsx`, `ParceriasConsultas.tsx`, `PermissoesConsultas.tsx`, `ProcedimentosConsultas.tsx`, `ProntuarioPage.tsx`, `atendimentoUI.tsx`) não caíram na varredura do bug de data. Também não encontrei blocos de erro engolidos em silêncio nem nenhuma chave/credencial exposta em nenhum arquivo do módulo (varredura em 100% dos arquivos).

`AtendimentoPage.tsx` (116 KB, a maior tela do sistema) recebeu atenção extra dado o tamanho — verifiquei especificamente os pontos de gravação de dados e o rodapé de documentos impressos (que usa a data de hoje só para formatar "dia de mês de ano" por extenso, sem o problema de fuso horário, já que não passa por conversão UTC).

---

## Ainda falta auditar

- As 9 Edge Functions do Supabase (a última parte da auditoria)

Depois disso, junto tudo num relatório final consolidado, por prioridade, como combinamos.
