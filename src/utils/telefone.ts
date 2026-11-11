// Telefone celular brasileiro valido para cobranca pelo WhatsApp (Cobranca nova - Fase 2, Telefones, 11/11/2026).
// Aceita com ou sem 55, com ou sem o 9 da frente. Recusa vazio, curto, DDD impossivel e numero repetido (99999-9999).
export function telefoneValido(t?: string | null): boolean {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || d[1] === '0') return false;
  if (/^(\d)\1+$/.test(d.slice(2))) return false;
  return true;
}
