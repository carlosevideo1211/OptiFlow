// NCMs usados na NFC-e (definidos pelo contador da Otica Evangelista em
// 24/09/2026). O NCM fica em products.ncm; quando o produto ainda nao tem NCM
// preenchido, a nota usa o padrao da categoria (mesma tabela em
// supabase/functions/emitir-nfce/index.ts — manter as duas iguais).

export const NCM_OPCOES: { ncm: string; label: string }[] = [
  { ncm: '90031100', label: 'Armação de plástico' },
  { ncm: '90031910', label: 'Armação de metal' },
  { ncm: '90031990', label: 'Armação de outros materiais' },
  { ncm: '90014000', label: 'Lente de óculos de vidro' },
  { ncm: '90015000', label: 'Lente de óculos de outros materiais (resina, policarbonato)' },
  { ncm: '90013000', label: 'Lente de contato' },
  { ncm: '90041000', label: 'Óculos de sol' },
  { ncm: '90049010', label: 'Óculos para correção (completo)' },
  { ncm: '42023200', label: 'Estojo de óculos de plástico' },
];

export const NCM_PADRAO_POR_CATEGORIA: Record<string, string> = {
  'Armação': '90031100',
  'Lente de Grau': '90015000',
  'Lente de Contato': '90013000',
  'Lente Solar': '90041000',
  'Estojo': '42023200',
};

export function ncmPadrao(categoria?: string | null): string {
  return NCM_PADRAO_POR_CATEGORIA[categoria || ''] || '';
}

export function formatarNcm(ncm?: string | null): string {
  const d = (ncm || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d;
}
