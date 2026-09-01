// Gerador de Pix "Copia e Cola" (BR Code / EMV) e carregador da lib de QR
// Code usada para desenhar esse codigo na tela.
//
// Extraido de src/pages/crediario/crediarioDocumentos.ts (onde essa mesma
// funcao pixEMV existia duplicada, quase identica, em
// src/pages/vendas/vendaDocumentos.ts). Nenhum comportamento foi alterado —
// so juntamos as duas copias aqui para reaproveitar no lembrete de
// mensalidade do inquilino (ver src/config/platformPix.ts e
// src/pages/DashboardPage.tsx). As duas telas de carne continuam
// funcionando do mesmo jeito, agora importando dessa funcao em vez de
// terem a sua propria copia.

// Monta o payload Pix estatico (BR Code) no formato EMV, com o valor fixo
// (Pix "Copia e Cola" comum, sem passar por nenhuma API de banco/gateway —
// so o texto que qualquer app de banco sabe ler).
export function pixEMV(chave: string, valor: number, nome: string): string {
  const f = (id: string, vv: string) => id + String(vv.length).padStart(2, '0') + vv;
  const mai = f('00', 'BR.GOV.BCB.PIX') + f('01', chave);
  const amt = valor > 0 ? valor.toFixed(2) : '';
  let p =
    f('00', '01') +
    f('26', mai) +
    f('52', '0000') +
    f('53', '986') +
    (amt ? f('54', amt) : '') +
    f('58', 'BR') +
    f('59', nome.substring(0, 25).replace(/[^A-Za-z0-9 ]/g, '')) +
    f('60', 'SAO PAULO') +
    f('62', f('05', '***')) +
    '6304';
  let crc = 0xffff;
  for (let i = 0; i < p.length; i++) {
    crc ^= p.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return p + (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

// Carrega a biblioteca qrcodejs (via CDN) uma unica vez por pagina, e
// resolve imediatamente se ja estiver carregada. Mesmo padrao ja usado em
// src/pages/PlanosPage.tsx para o QR do Pix Automatico (Asaas).
export function carregarQrCodeLib(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).QRCode) { resolve(); return; }
    const existente = document.getElementById('qrcodejs-lib') as HTMLScriptElement | null;
    if (existente) { existente.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'qrcodejs-lib';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar biblioteca de QR Code'));
    document.head.appendChild(script);
  });
}
