// Funcoes de data compartilhadas entre as telas do Admin e o Dashboard do
// inquilino (Painel Admin, Trials Vencidos, Lixeira, Dashboard). Antes cada
// arquivo tinha sua propria copia dessas mesmas 3 funcoes — centralizado
// aqui em 01/09/2026 pra parar de correr o risco de editar uma copia e
// esquecer as outras.

export const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function fmtDate(d?: string | null): string {
  if (!d) return '--';
  const dt = d.includes('T') ? new Date(d) : new Date(d+'T00:00:00');
  return isNaN(dt.getTime()) ? '--' : dt.toLocaleDateString('pt-BR');
}

export function diasRestantes(d?: string | null): number | null {
  if (!d) return null;
  const diff = new Date(d+'T00:00:00').getTime() - new Date().setHours(0,0,0,0);
  return Math.ceil(diff / (1000*60*60*24));
}

// "Pago ate": mostra o MES coberto pelo pagamento (ultimo dia antes do
// vencimento), nao a data do proximo vencimento em si. Pedido pelo Carlos
// (01/09/2026) porque a data crua (ex: 01/10) estava confundindo -- parecia
// que o mes de Outubro tinha sido marcado como pago, quando na verdade
// 01/10 e so a data em que a PROXIMA cobranca vence (ou seja, Setembro que
// esta pago).
export function pagoAteLabel(nextBilling?: string | null): string | null {
  if (!nextBilling) return null;
  const d = new Date(nextBilling+'T00:00:00');
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate()-1);
  return MESES_PT[d.getMonth()] + '/' + d.getFullYear();
}
