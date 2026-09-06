// Tipos, constantes e helpers compartilhados da tela de Crediário
// (CrediarioPage.tsx e o gerador de documentos em crediarioDocumentos.ts).
// Extraído do CrediarioPage.tsx original só para organização — nenhum
// comportamento foi alterado.

import type { Tier } from '../../utils/clienteRanking';

export const CINCO_ANOS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  if (!password) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export interface Parcela {
  id: string; crediario_id: string; tenant_id: string;
  installment_number: number; due_date: string; amount: number;
  paid_at?: string; paid_amount?: number; status: string;
  customer_name?: string; customer_id?: string; whatsapp?: string;
  total_installments?: number; sale_id?: string; payment_method?: string;
  arquivado?: boolean;
}

export interface CrediarioResumo {
  id: string; customer_id: string; customer_name: string; total_amount: number;
  negativado: boolean; negativado_em?: string | null;
  valorEmAtraso: number; qtdEmAtraso: number; ultimaParcelaVencimento: string | null;
  tier: Tier; created_at?: string;
  // Status do carne (ativo/quitado/cancelado) — usado pra saber quando todas
  // as parcelas ja foram pagas e liberar o icone de "Emitir Termo de
  // Quitacao" (pedido pelo Carlos, 01/09/2026).
  status?: string;
}

export interface CobrancaLog {
  trigger_type: string; sent_at: string; success: boolean; error_message?: string;
}

export const JANELA_LABELS: Record<string, string> = {
  vencimento: 'Automatica (-5 dias)',
  vencimento_dia: 'Automatica (dia do vencimento)',
  vencimento_atraso5: 'Automatica (+5 dias)',
  cobranca_atraso: 'Automatica (atraso 30+ dias)',
  cobranca_manual: 'Manual (via sistema)',
  cobranca_manual_local: 'Manual (WhatsApp pessoal)',
};

// Retorna a data local (fuso do navegador) no formato YYYY-MM-DD.
// IMPORTANTE: nunca usar `new Date().toISOString().split('T')[0]` para
// "qual e o dia de hoje" — toISOString() sempre converte para UTC, o que
// no horario de Manaus (UTC-4) faz "hoje" virar "amanha" a partir de
// aproximadamente 20h. Como due_date e armazenado como data local (sem
// horario), comparar com uma string "hoje" em UTC faz uma parcela que
// vence hoje sumir das listas de "vence hoje"/"vencidas" durante a noite.
// Corrigido 31/08/2026 apos relato da Otica Solar (Larissa): parcela do
// dia sumindo da relacao de crediario e aparecendo com data errada.
export function toLocalDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const JUROS_DIA = 0.07;

export function calcJuros(p: Parcela): number {
  if (p.status === 'pago' || !p.due_date) return 0;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(p.due_date + 'T00:00:00');
  if (venc >= hoje) return 0;
  const dias = Math.floor((hoje.getTime() - venc.getTime()) / (1000*60*60*24));
  return Math.round(dias * JUROS_DIA * 100) / 100;
}
