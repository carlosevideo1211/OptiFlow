// ── Planos ──────────────────────────────────────────────────
export type Plan = 'trial' | 'basico' | 'profissional' | 'clinica' | 'cancelado';

// ── Usuário ──────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  role: 'master' | 'optometrista' | 'atendente' | 'caixa' | 'system_admin';
  active: boolean;
  crm?: string;
  specialty?: string;
  avatar_url?: string;
}

// ── Tenant (Inquilino) ───────────────────────────────────────
export interface Tenant {
  id: string;
  company_name: string;
  email?: string;
  phone?: string;
  plan: Plan;
  status: 'trial' | 'ativo' | 'inadimplente' | 'bloqueado' | 'cancelado';
  trial_end_date?: string;
  next_billing?: string;
  mrr_value?: number;
  city?: string;
  state?: string;
  created_at: string;
}

// ── Cliente ──────────────────────────────────────────────────
export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  cpf?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  birth_date?: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
  active: boolean;
  created_at: string;
}

// ── Consulta ─────────────────────────────────────────────────
export interface Consultation {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name?: string;
  professional_id?: string;
  professional_name?: string;
  date: string;
  // Longe
  re_esf_longe?: number; re_cil_longe?: number; re_eixo_longe?: number; re_av_longe?: string;
  le_esf_longe?: number; le_cil_longe?: number; le_eixo_longe?: number; le_av_longe?: string;
  // Perto
  re_esf_perto?: number; re_cil_perto?: number; re_eixo_perto?: number;
  le_esf_perto?: number; le_cil_perto?: number; le_eixo_perto?: number;
  // DNP / Altura
  re_dnp?: number; le_dnp?: number;
  re_altura?: number; le_altura?: number;
  // Adição
  adicao?: number;
  // Pupilômetro
  dp_longe?: number; dp_perto?: number;
  // Observações
  notes?: string;
  status: 'agendada' | 'realizada' | 'cancelada';
  generated_os?: boolean;
  created_at: string;
}

// ── Ordem de Serviço ─────────────────────────────────────────
export interface ServiceOrder {
  id: string;
  tenant_id: string;
  os_number?: number;
  customer_id?: string;
  customer_name: string;
  consultation_id?: string;
  // Lente
  lens_type?: string;
  lens_brand?: string;
  lens_material?: string;
  // Armação
  frame_brand?: string;
  frame_model?: string;
  frame_color?: string;
  frame_price?: number;
  // Valores
  lens_price?: number;
  total: number;
  discount?: number;
  // Status
  status: 'orcamento' | 'aprovada' | 'em_producao' | 'pronta' | 'entregue' | 'cancelada';
  lab_name?: string;
  delivery_date?: string;
  notes?: string;
  created_at: string;
}

// ── Produto ──────────────────────────────────────────────────
export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  code?: string;
  category: string;
  brand?: string;
  description?: string;
  cost_price: number;
  sale_price: number;
  stock: number;
  min_stock?: number;
  active: boolean;
  created_at: string;
}

// ── Venda ────────────────────────────────────────────────────
export interface Sale {
  id: string;
  tenant_id: string;
  sale_number?: number;
  customer_id?: string;
  customer_name?: string;
  os_id?: string;
  payment_method: string;
  installments: number;
  subtotal: number;
  discount: number;
  total: number;
  status: 'concluida' | 'cancelada' | 'pendente';
  notes?: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  tenant_id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

// ── Crediário ─────────────────────────────────────────────────
export interface Crediario {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  sale_id?: string;
  total_amount: number;
  installments: number;
  notes?: string;
  status: 'ativo' | 'quitado' | 'cancelado';
  created_at: string;
}

export interface CrediarioParcela {
  id: string;
  crediario_id: string;
  tenant_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_at?: string;
  paid_amount?: number;
  status: 'pendente' | 'paga' | 'vencida' | 'cancelada';
}

// ── Financeiro ───────────────────────────────────────────────
export interface FinancialTransaction {
  id: string;
  tenant_id: string;
  type: 'receita' | 'despesa';
  description: string;
  category?: string;
  amount: number;
  due_date: string;
  paid_at?: string;
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  payment_method?: string;
  notes?: string;
  created_at: string;
}

// ── Fornecedor ───────────────────────────────────────────────
export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  cnpj?: string;
  category: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
  active: boolean;
  created_at: string;
}

// ── Configurações ─────────────────────────────────────────────
export interface StoreSettings {
  id: string;
  tenant_id: string;
  name: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  logo_url?: string;
  pix_key?: string;
  wa_token?: string;
  wa_phone_id?: string;
  wa_number?: string;
}

// ── Utilitários ──────────────────────────────────────────────
export const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');

export const formatDateTime = (d: string) =>
  new Date(d).toLocaleString('pt-BR');

export const PLAN_LABELS: Record<Plan, string> = {
  trial: '🕐 Trial',
  basico: '⭐ Básico',
  profissional: '👑 Profissional',
  clinica: '🏥 Clínica',
  cancelado: '❌ Cancelado',
};

export const OS_STATUS_LABELS: Record<string, string> = {
  orcamento: 'Orçamento',
  aprovada: 'Aprovada',
  em_producao: 'Em Produção',
  pronta: 'Pronta',
  entregue: 'Entregue',
  cancelada: 'Cancelada',
};

export const OS_STATUS_COLORS: Record<string, string> = {
  orcamento: '#8892A4',
  aprovada: '#0070F3',
  em_producao: '#F59E0B',
  pronta: '#00E5C8',
  entregue: '#00C853',
  cancelada: '#FF6B6B',
};
