// Trava do robo de WhatsApp (Cobranca nova - Fase 2, 11/11/2026). Roda ANTES de publicar o send-whatsapp-triggers:
//   npm run deploy:robo   (= este teste + deploy)   ou so o teste: npm run test:robo
// Confere no codigo que TODO envio automatico:
//   1) passa antes pela checagem "recebeuHoje" (no maximo 1 mensagem por cliente por dia - regra de 03/11/2026);
//   2) registra o envio depois (registrarEnvio), para os proximos envios do dia enxergarem;
// e que continuam no lugar: a pausa de quem disse PAGUEI/acordo esperando Pix e o registro que para o robo se falhar.
// Se algo quebrar, o teste falha e o deploy NAO acontece.
import { readFileSync } from "node:fs";

const arq = "supabase/functions/send-whatsapp-triggers/index.ts";
const linhas = readFileSync(arq, "utf8").split(/\r?\n/);
const erros = [];
const inicio = linhas.findIndex((l) => l.includes("function registrarEnvio("));
if (inicio < 0) erros.push("nao achei a funcao registrarEnvio (contador de envios do dia)");

let envios = 0;
linhas.forEach((l, i) => {
  if (i <= inicio || !/await enviarMensagem\(/.test(l)) return;
  envios++;
  const antes = linhas.slice(Math.max(inicio, i - 30), i).join("\n");
  const depois = linhas.slice(i, i + 12).join("\n");
  if (!/recebeuHoje\(/.test(antes)) erros.push(`linha ${i + 1}: envio sem checar recebeuHoje (cliente poderia receber 2 mensagens no dia)`);
  if (!/registrarEnvio\(/.test(depois)) erros.push(`linha ${i + 1}: envio sem registrarEnvio logo depois`);
});
if (envios < 8) erros.push(`so achei ${envios} envios automaticos (esperado 8 ou mais) - o codigo mudou de forma? confira este teste`);

const tudo = linhas.join("\n");
const exige = [
  [/const recebeuHoje = \(customerId[^\n]*clientesComMensagemHoje\.has/, "recebeuHoje precisa olhar clientesComMensagemHoje"],
  [/cobranca_respostas\?tenant_id=eq\.\$\{tenant\.id\}&intencao=eq\.paguei&status=eq\.pendente/, "pausa de quem disse PAGUEI sumiu"],
  [/cobranca_acordos\?tenant_id=eq\.\$\{tenant\.id\}&status=eq\.aguardando_pagamento/, "pausa de quem esta com acordo esperando o Pix sumiu"],
  [/enviosHojeDoTenant\(tenant\.id/, "contagem de envios de hoje (enviosHojeDoTenant) sumiu"],
];
for (const [re, msg] of exige) if (!re.test(tudo)) erros.push(msg);
const log = tudo.slice(tudo.indexOf("async function logTrigger("), tudo.indexOf("async function jaEnviado("));
if (!/throw /.test(log)) erros.push("logTrigger nao para o robo (throw) quando o registro falha - bug de 03/11 (mensagem repetida a cada 15 min)");
if (!/merge-duplicates/.test(log)) erros.push("logTrigger precisa gravar com merge-duplicates (bug de 03/11)");

if (erros.length) {
  console.error("\n❌ TRAVA DO ROBO QUEBRADA - deploy cancelado:\n - " + erros.join("\n - ") + "\n");
  process.exit(1);
}
console.log(`✅ Trava do robo ok: ${envios} envios automaticos, todos com checagem de 1 mensagem por dia e registro.`);
