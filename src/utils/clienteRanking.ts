// Classificacao de clientes por historico de pagamento do crediario:
// Ouro  = nunca atrasou nenhuma parcela
// Prata = ja pagou alguma parcela em atraso, mas nao tem nada vencido agora
// Bronze = tem parcela vencida (nao paga) no momento
//
// IMPORTANTE: crediario_parcelas.status na pratica so assume 'pendente' ou 'pago'
// (nunca 'vencida'/'vencido' como sugeriam os types) — atraso e sempre calculado
// comparando due_date com a data de hoje. Centralizado aqui para nao repetir esse
// calculo (e esse detalhe) em cada tela que precisa da classificacao.

export interface ParcelaRanking {
  due_date: string | null;
  status: string;
  paid_at?: string | null;
}

export type Tier = 'ouro' | 'prata' | 'bronze' | null;

export function computeTier(parcelas: ParcelaRanking[]): Tier {
  if (!parcelas || parcelas.length === 0) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const vencidas = parcelas.filter(p => {
    if (p.status === 'pago') return false;
    if (!p.due_date) return false;
    return new Date(p.due_date + 'T00:00:00') < hoje;
  });
  if (vencidas.length > 0) return 'bronze';

  const pagas = parcelas.filter(p => p.status === 'pago');
  const comAtraso = pagas.filter(p => {
    if (!p.due_date || !p.paid_at) return false;
    return new Date(p.paid_at) > new Date(p.due_date + 'T00:00:00');
  }).length;
  if (comAtraso > 0) return 'prata';
  if (pagas.length > 0) return 'ouro';
  return null;
}

export const TIER_STYLES: Record<'ouro'|'prata'|'bronze', {bg: string, color: string, label: string}> = {
  ouro:   { bg: 'rgba(234,179,8,.2)',   color: '#eab308', label: '★ Ouro' },
  prata:  { bg: 'rgba(148,163,184,.2)', color: '#94a3b8', label: '● Prata' },
  bronze: { bg: 'rgba(180,83,9,.2)',    color: '#b45309', label: '◆ Bronze' },
};

// Um cliente esta "em atraso agora" se tiver ao menos uma parcela pendente com
// vencimento no passado — usado para destacar nome em vermelho (pedido do Carlos).
export function estaEmAtraso(parcelas: ParcelaRanking[]): boolean {
  return computeTier(parcelas) === 'bronze';
}
