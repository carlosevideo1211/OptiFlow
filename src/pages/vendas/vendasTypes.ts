// Tipos e constantes compartilhados da tela de Vendas (VendasPage.tsx e o
// gerador de documentos em vendaDocumentos.ts). Extraído do VendasPage.tsx
// original só para organização — nenhum comportamento foi alterado.

export const PAGAMENTOS = [
  { value: 'dinheiro',      label: 'Dinheiro',      icon: '💵' },
  { value: 'pix',           label: 'PIX',            icon: '📱' },
  { value: 'credito',       label: 'Crédito',        icon: '💳' },
  { value: 'debito',        label: 'Débito',         icon: '🏧' },
  { value: 'crediario',     label: 'Crediário',      icon: '📋' },
  { value: 'transferencia', label: 'Transferência',  icon: '🏦' },
  { value: 'boleto', label: 'Boleto', icon: '📄' },
];

export interface Product { id: string; name: string; sale_price: number; stock: number; category: string; brand?: string; code?: string; }
export interface Customer { id: string; name: string; }
export interface SaleItem { product_id: string; description: string; quantity: number; unit_price: number; total: number; acrescimo: number; }
export interface Sale {
  id: string; sale_number: number; customer_name: string; payment_method: string;
  installments: number; subtotal: number; discount: number; total: number; entrada?: number;
  status: string; created_at: string; notes?: string; vendedor?: string; os_number?: number; os_id?: string; customer_id?: string;
}
export interface OS {
  id: string; os_number: number; customer_name: string; customer_id?: string;
  frame_brand?: string; frame_model?: string; frame_color?: string; frame_price?: number;
  lens_type?: string; lens_brand?: string; lens_price?: number;
  total?: number; discount?: number; entrada?: number;
  od_esf?: number; od_cil?: number; od_eixo?: number;
  oe_esf?: number; oe_cil?: number; oe_eixo?: number;
  medico?: string; obs_cliente?: string; status?: string;
}
export interface StoreSettings {
  name: string; cnpj: string; phone: string; email: string;
  address: string; city: string; state: string; logo_url?: string; pix_key?: string;
}

export function formatDate(d: string) { return new Date(d).toLocaleDateString('pt-BR'); }
export function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
