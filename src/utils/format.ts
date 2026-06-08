// Utilitarios de formatacao para o OptiFlow

/**
 * Formata CPF para o padrao brasileiro: 000.000.000-00
 * Aceita qualquer formato de entrada (com ou sem pontuacao, numeros puros)
 */
export function formatCPF(cpf: string | number | null | undefined): string {
  if (!cpf) return '';
  const n = String(cpf).replace(/[^0-9]/g, '').padStart(11, '0');
  if (n.replace(/0/g, '').length === 0) return '';
  return n.slice(0,3)+'.'+n.slice(3,6)+'.'+n.slice(6,9)+'-'+n.slice(9,11);
}

/**
 * Remove formatacao do CPF, retorna apenas numeros
 */
export function cleanCPF(cpf: string): string {
  return String(cpf || '').replace(/[^0-9]/g, '');
}

/**
 * Valida se CPF tem 11 digitos
 */
export function isValidCPF(cpf: string): boolean {
  const n = cleanCPF(cpf);
  return n.length === 11 && n.replace(/0/g,'').length > 0;
}

/**
 * Formata telefone para (00) 00000-0000
 */
export function formatPhone(phone: string): string {
  if (!phone) return '';
  const n = String(phone).replace(/[^0-9]/g, '');
  if (n.length === 11) return '('+n.slice(0,2)+') '+n.slice(2,7)+'-'+n.slice(7);
  if (n.length === 10) return '('+n.slice(0,2)+') '+n.slice(2,6)+'-'+n.slice(6);
  return phone;
}
