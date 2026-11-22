// Cadastro: percebe e-mail com o final digitado errado (ex.: @gmai.com) e sugere o certo.
const DOMINIOS_CONHECIDOS = [
  'gmail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'mail.com', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br',
];
const ERROS_COMUNS: Record<string, string> = { 'gmail.com.br': 'gmail.com' };

function distancia(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length];
}

export function sugerirEmail(email: string): string | null {
  const limpo = email.trim().toLowerCase();
  const arroba = limpo.lastIndexOf('@');
  if (arroba < 1) return null;
  const nome = limpo.slice(0, arroba);
  const dominio = limpo.slice(arroba + 1);
  if (dominio.length < 4 || DOMINIOS_CONHECIDOS.includes(dominio)) return null;
  if (ERROS_COMUNS[dominio]) return `${nome}@${ERROS_COMUNS[dominio]}`;
  let melhor: string | null = null;
  let menor = 3;
  for (const conhecido of DOMINIOS_CONHECIDOS) {
    const d = distancia(dominio, conhecido);
    if (d < menor) { menor = d; melhor = conhecido; }
  }
  return melhor ? `${nome}@${melhor}` : null;
}
