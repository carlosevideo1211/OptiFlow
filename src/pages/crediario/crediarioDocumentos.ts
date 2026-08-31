// Geração dos documentos imprimíveis de crediário (recibo parcial, recibo de
// parcela individual, carnê completo). Extraído do CrediarioPage.tsx original
// só para organização — o texto/lógica de cada função é idêntico ao que
// estava lá; imprimirCarneIndividual e imprimirCarneCompleto passam a
// receber `tenantId` como parâmetro explícito em vez de via closure.

import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { abrirDocumentoImprimivel } from '../../utils/printDoc';
import { calcJuros, type Parcela } from './crediarioTypes';

export const imprimirReciboParcial = (p: Parcela, pago: number, operador: string) => {
  const saldo = Math.round((p.amount + calcJuros(p) - pago) * 100) / 100;
  const dt = new Date().toLocaleDateString('pt-BR');
  const hr = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const bodyHtml = '<p style="text-align:right;font-size:11px;color:#777">Recebido em: ' + dt + ' as ' + hr + '</p>'
    + '<h2>RECIBO DE PAGAMENTO</h2>'
    + '<p style="text-align:center;font-size:13px">Recebemos de <strong>' + (p.customer_name||'') + '</strong>, a importancia de:</p>'
    + '<div class="val">R$ ' + pago.toFixed(2).replace('.',',') + '</div>'
    + '<div class="box">'
    + '<div class="row"><span>Valor total da parcela</span><span>R$ ' + (p.amount+calcJuros(p)).toFixed(2).replace('.',',') + '</span></div>'
    + '<div class="row"><span>Valor recebido</span><span>R$ ' + pago.toFixed(2).replace('.',',') + '</span></div>'
    + '<div class="row"><span class="sd">Saldo restante</span><span class="sd">R$ ' + saldo.toFixed(2).replace('.',',') + '</span></div>'
    + '</div>'
    + '<p style="font-size:12px;color:#555">Referente a parcela n. ' + p.installment_number + ' de ' + (p.total_installments||'?') + '. Operador: ' + operador + '</p>'
    + '<p style="font-size:12px;color:#555">Damos por paga a referida parcela (parcialmente).</p>';
  const css = 'body{font-family:Arial;padding:24px;max-width:380px;margin:0 auto}'
    + 'h2{text-align:center;font-size:16px}'
    + '.val{text-align:center;font-size:32px;font-weight:bold;margin:16px 0}'
    + '.box{border:1px solid #e5a500;background:#fffbea;border-radius:8px;padding:12px;margin:16px 0;font-size:13px}'
    + '.row{display:flex;justify-content:space-between;padding:4px 0}'
    + '.sd{color:#e5a500;font-weight:bold}';
  abrirDocumentoImprimivel({
    title: 'Recibo',
    filename: 'recibo-parcial-parcela-' + p.installment_number + '.pdf',
    css,
    body: bodyHtml,
    windowFeatures: 'width=420,height=700',
  });
};

export const imprimirCarneIndividual = async (p: Parcela, tenantId: string | null) => {
  const { data: creds } = await supabase.from('crediario').select('*').eq('id', p.crediario_id).single();
  const cr = creds as any || {};
  const { data: todasParcelas } = await supabase.from('crediario_parcelas').select('*').eq('crediario_id', p.crediario_id).order('installment_number', { ascending: true });
  const lista = (todasParcelas || []) as any[];
  const nP = lista.length || cr.installments || 1;
  const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmtD2 = (d: string) => { if (!d) return '--'; const dt=d.includes('T')?new Date(d):new Date(d+'T12:00:00'); return dt.toLocaleDateString('pt-BR'); };
  const pNum = p.installment_number;
  const nP2 = p.total_installments || '?';
  const venc = p.due_date ? fmtD2(p.due_date) : '--';
  const hoje = new Date().toLocaleDateString('pt-BR');
  // Corrigido 22/07/2026: recibo estava imprimindo p.amount (valor base sem juros),
  // ignorando tanto o juros por atraso quanto o valor efetivamente pago (paid_amount).
  const parcelaPaga = p.status === 'pago';
  const valorRecibo = parcelaPaga
    ? (p.paid_amount != null ? p.paid_amount : p.amount)
    : (p.amount + calcJuros(p));
  // Adicionado 22/07/2026: descricao do valor original + juros/ajustes no recibo
  const jurosCalc = parcelaPaga
    ? Math.round((valorRecibo - p.amount) * 100) / 100
    : calcJuros(p);
  const breakdownHtml = jurosCalc !== 0
    ? '<div class="breakdown">'
      + '<div class="brow"><span>Valor original da parcela</span><span>'+fmtV(p.amount)+'</span></div>'
      + '<div class="brow"><span>'+(parcelaPaga ? 'Juros / ajustes' : 'Juros por atraso')+'</span><span>'+fmtV(jurosCalc)+'</span></div>'
      + '<div class="brow total"><span>Total</span><span>'+fmtV(valorRecibo)+'</span></div>'
      + '</div>'
    : '';
  // Buscar dados da loja do Supabase
  let storeName = 'OPTIFLOW';
  let storeCnpj = '';
  let storeAddr = '';
  let storeTel = '';
  let storeLogo = '';
  try {
    const { data: ss } = await supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single();
    if (ss) {
      storeName = (ss.name || ss.company_name || 'OPTIFLOW').toUpperCase();
      storeCnpj = ss.cnpj || '';
      storeAddr = [ss.address, ss.city, ss.state].filter(Boolean).join(', ');
      storeTel = ss.phone || '';
      storeLogo = ss.logo_url || '';
    }
  } catch(e) {}
  const logoHtml = storeLogo
    ? '<img src="'+storeLogo+'" style="width:60px;height:60px;object-fit:contain;border-radius:8px;" />'
    : '<div style="width:60px;height:60px;background:linear-gradient(135deg,#6366f1,#06b6d4);border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:18px;">O</div>';
  const css = '@page{size:A4 portrait;margin:12mm}*{margin:0;padding:0;box-sizing:border-box}'
    +'body{font-family:Arial,sans-serif;color:#222;background:#fff}'
    +'.header{text-align:center;padding-bottom:16px;border-bottom:2px solid #1e3a5f;margin-bottom:20px}'
    +'.logo-row{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:8px}'
    +'.store-name{font-size:22px;font-weight:800;color:#1e3a5f;letter-spacing:1px}'
    +'.store-info{font-size:11px;color:#555;margin-top:2px}'
    +'.title{font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:14px 0 18px;text-align:center;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:8px 0}'
    +'.table{width:100%;border-collapse:collapse;margin-bottom:16px}'
    +'.table th{background:#1e3a5f;color:#fff;padding:8px 12px;font-size:12px;text-align:left}'
    +'.table td{padding:8px 12px;font-size:12px;border-bottom:1px solid #eee}'
    +'.value-box{text-align:center;border:2px solid #1e3a5f;border-radius:8px;padding:16px;margin:20px 0}'
    +'.value-label{font-size:12px;color:#666;margin-bottom:4px}'
    +'.value-amount{font-size:32px;font-weight:800;color:#1e3a5f}'
    +'.breakdown{border:1px solid #ddd;border-radius:8px;padding:10px 14px;margin:16px 0;font-size:12px}'
    +'.brow{display:flex;justify-content:space-between;padding:3px 0}'
    +'.brow.total{border-top:1px solid #ccc;margin-top:4px;padding-top:6px;font-weight:700}'
    +'.footer{margin-top:40px;text-align:center;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:14px}'
    +'.sig{display:flex;justify-content:space-around;margin-top:50px}'
    +'.sig-line{text-align:center;width:200px}'
    +'.sig-line hr{border:none;border-top:1px solid #333;margin-bottom:6px}';
  const html = '<div class="header">'
    +'<div class="logo-row">'+logoHtml+'<span class="store-name">'+storeName+'</span></div>'
    +(storeCnpj?'<div class="store-info">CNPJ: '+storeCnpj+'</div>':'')
    +(storeAddr?'<div class="store-info">'+storeAddr+'</div>':'')
    +(storeTel?'<div class="store-info">Tel: '+storeTel+'</div>':'')
    +'</div>'
    +'<div class="title">Recibo de Pagamento de Parcela</div>'
    +'<table class="table"><thead><tr><th>Parcela</th><th>Cliente</th><th>Vencimento</th><th>Emissão</th></tr></thead>'
    +'<tbody><tr><td>'+pNum+'/'+nP2+'</td><td>'+p.customer_name+'</td><td>'+venc+'</td><td>'+hoje+'</td></tr></tbody></table>'
    +breakdownHtml
    +'<div class="value-box">'
    +'<div class="value-label">'+(parcelaPaga ? 'VALOR TOTAL PAGO' : 'VALOR DA PARCELA')+'</div>'
    +'<div class="value-amount">'+fmtV(valorRecibo)+'</div>'
    +'</div>'
    +'<p style="font-size:11px;color:#888;text-align:center;">O não pagamento acarretará juros de R$ 0,07 ao dia. Pagável somente na loja de origem.</p>'
    +'<div class="sig">'
    +'<div class="sig-line"><hr><span>'+p.customer_name+'</span><br><span style="font-size:10px;color:#888">Assinatura do Cliente</span></div>'
    +'<div class="sig-line"><hr><span>'+storeName+'</span><br><span style="font-size:10px;color:#888">Assinatura da Empresa</span></div>'
    +'</div>'
    +'<div class="footer">'+storeName+' &mdash; '+hoje+'</div>';

  abrirDocumentoImprimivel({
    title: 'Comprovante',
    filename: 'comprovante-parcela-' + pNum + '.pdf',
    css,
    body: html,
    windowFeatures: 'width=800,height=900',
  });
};

export const imprimirCarneCompleto = async (p: Parcela, tenantId: string | null) => {
  const { data: cred } = await supabase.from('crediario').select('*').eq('id', p.crediario_id).single();
  const cr = cred as any || {};
  const { data: parc } = await supabase.from('crediario_parcelas').select('*').eq('crediario_id', p.crediario_id).order('installment_number', { ascending: true });
  const lista = (parc || []) as any[];
  // Corrigido 31/08/2026: antes, se essa busca voltasse vazia (falha de
  // rede, RLS, atraso de replicacao — ou um crediario que nunca teve suas
  // parcelas criadas), o codigo mais abaixo "inventava" datas novas a
  // partir de hoje e imprimia um carne com datas sem nenhuma relacao com o
  // combinado com o cliente, sem avisar ninguem. Agora aborta a impressao e
  // avisa o operador em vez de imprimir dado fabricado.
  if (lista.length === 0) {
    console.error('imprimirCarneCompleto: crediario_parcelas veio vazio para crediario_id=' + p.crediario_id);
    toast.error('Não foi possível carregar as parcelas deste carnê. Tente novamente em alguns instantes; se persistir, avise o suporte (crediário ' + p.crediario_id + ').', { duration: 8000 });
    return;
  }
  const nP = lista.length;
  const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmtD = (d: string) => { if (!d) return '--'; const dt = d.includes('T') ? new Date(d) : new Date(d+'T12:00:00'); return isNaN(dt.getTime()) ? '--' : dt.toLocaleDateString('pt-BR'); };
  let sName = 'Otica'; let sPix = ''; let sLogo = ''; let sCnpj = ''; let sAddr = ''; let sCity = ''; let sState = ''; let sPhone = '';
  try { const { data: ss } = await supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single(); if (ss) { sName = ss.name || ss.company_name || 'Otica'; sPix = ss.pix_key || ''; sLogo = ss.logo_url || ''; sCnpj = ss.cnpj || ''; sAddr = ss.address || ''; sCity = ss.city || ''; sState = ss.state || ''; sPhone = ss.phone || ''; } } catch(e2) {}
  const mkBC = (seed: number) => { const pat=[3,1,4,1,2,1,1,4,2,1,3,1,1,2,1,4,2,1,1,3,4,1,2,1,3,1,1,2,3,1,4,1,2,1,1,3,2,1,1,2,4,1,3,1]; return pat.map((b,i)=>'<span style="display:inline-block;height:42px;width:'+(b+(seed*3+i)%2)+'px;background:'+(i%2===0?'#000':'#fff')+'"></span>').join(''); };
  const pixEMV = (chave: string, valor: number, nome: string): string => { const f=(id:string,vv:string)=>id+String(vv.length).padStart(2,'0')+vv; const mai=f('00','BR.GOV.BCB.PIX')+f('01',chave); const amt=valor>0?valor.toFixed(2):''; let p=f('00','01')+f('26',mai)+f('52','0000')+f('53','986')+(amt?f('54',amt):'')+f('58','BR')+f('59',nome.substring(0,25).replace(/[^A-Za-z0-9 ]/g,''))+f('60','SAO PAULO')+f('62',f('05','***'))+'6304'; let crc=0xFFFF; for(let i=0;i<p.length;i++){crc^=p.charCodeAt(i)<<8;for(let j=0;j<8;j++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;} return p+(crc&0xFFFF).toString(16).toUpperCase().padStart(4,'0'); };
  const custName = p.customer_name;
  const slip = (p: any, idx: number) => { const pN=p.installment_number||idx+1; const sd=String(p.crediario_id||'').slice(-4).padStart(4,'0'); const ld=sd+String(pN).padStart(3,'0')+'0000000000000000000'; const vc=p.due_date?fmtD(p.due_date):'--'; const em=fmtD(cr.created_at || new Date().toISOString()); const vs=fmtV(p.amount).replace('R$ ','').replace('R$','').trim(); const pp=sPix?pixEMV(sPix,p.amount,sName):''; const qi='qr_'+String(p.id||idx).replace(/-/g,''); return '<div class="sr"><div class="mn"><div class="sh"><span class="ss">'+sName+'</span><span class="sm"></span><span class="sp">'+pN+'/'+nP+'</span><span class="sd">'+sd+' / '+ld.slice(0,12)+'...</span></div><div class="fr"><div class="fb s"><span class="fl">Parcela</span><span class="fv">'+pN+'</span></div><div class="fb s"><span class="fl">Vencimento</span><span class="fv">'+vc+'</span></div><div class="fb xl"><span class="fl">Cliente</span><span class="fv">'+custName+'</span></div><div class="fb s"><span class="fl">Emissao</span><span class="fv">'+em+'</span></div></div><div class="in">O nao pagamento acarretara juros de R$ 0,07 ao dia. Pagavel somente na loja de origem.</div><div class="bc">'+mkBC(pN*11)+'</div><div class="fr" style="margin-top:4px"><div class="fb xs"><span class="fl">Nr.Doc</span><span class="fv">'+sd+'</span></div><div class="fb xxl"><span class="fl">&nbsp;</span><span class="fv fm">'+ld.slice(0,30)+'</span></div><div class="fb s"><span class="fl">Emissao</span><span class="fv">'+em+'</span></div><div class="fb sv"><span class="fl">Valor</span><span class="fv fb2">R$ '+vs+'</span></div></div></div><div class="ct">&#9986;</div><div class="st"><div class="s2"><span class="s2p">'+pN+'/'+nP+'</span><span class="s2d">'+sd+'</span></div><div class="sr2"><span class="sl">Vencimento</span><span class="sv">'+vc+'</span></div><div class="sr2 hi"><span class="sl">Valor Cobrado</span><span class="sv sb">R$ '+vs+'</span></div><div class="sr2" style="border:none;text-align:center;padding:2px 0;overflow:hidden"><span style="display:block;font-size:11px;font-weight:800;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+custName+'</span></div>'+(pp?'<div id="'+qi+'" data-pix="'+pp+'" style="width:70px;height:70px;margin:4px auto 18px"></div><div style="text-align:center;margin-top:0"><span style="display:block;font-size:11px;font-weight:800;color:#000;word-break:break-all;line-height:1.3;padding:0 2px">Pix: '+sPix+'</span></div>':'')+'</div></div>'; };
  const capa = '<div class="cp"><div class="ch"><div class="lw">'+(sLogo?'<img src="'+sLogo+'" style="width:62px;height:62px;object-fit:cover;border-radius:4px"/>':'<div class="ls"><div class="lg"></div></div>')+'</div><div class="ct2"><div class="ctit">CARNE DE PAGAMENTO</div><div class="csn">'+sName+'</div>'+(sCnpj?'<div class="csi">CNPJ: '+sCnpj+'</div>':'')+((sAddr||sCity)?'<div class="csi">'+( sAddr||'')+( sCity?', '+sCity:'')+(sState?' - '+sState:'')+'</div>':'')+( sPhone?'<div class="csi">Tel: '+sPhone+'</div>':'')+'</div></div><div class="cb"><div class="cl">CLIENTE / DEVEDOR</div><div class="cn">'+p.customer_name+'</div></div><div class="cf"><div class="ci"><span class="ck">Total da Divida</span><span class="cv">'+fmtV(lista.reduce((s: number,x: any)=>s+x.amount,0))+'</span></div><div class="ci"><span class="ck">No Parcelas</span><span class="cv">'+nP+'</span></div><div class="ci"><span class="ck">Valor/Parcela</span><span class="cv">'+fmtV(lista.reduce((s: number,x: any)=>s+x.amount,0)/nP)+'</span></div><div class="ci"><span class="ck">Emissao</span><span class="cv">'+fmtD(cr.created_at || new Date().toISOString())+'</span></div></div></div>';
  const css = '@page{size:A4 portrait;margin:8mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000;background:#fff;display:flex;flex-direction:column}.cp{border:2px solid #1a3a8f;border-radius:4px;overflow:hidden;margin-bottom:0;flex-shrink:0}.ch{background:#1a3a8f;color:#fff;display:flex;align-items:center;gap:12px;padding:18px 14px}.lw{flex-shrink:0}.ls{width:62px;height:62px;border:2px solid rgba(255,255,255,.4);border-radius:4px;background:rgba(255,255,255,.1)}.lg{width:100%;height:100%;background:repeating-linear-gradient(90deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 1px,transparent 6px) top/6px 6px,repeating-linear-gradient(rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 1px,transparent 6px)}.ct2{flex:1;text-align:center}.ctit{font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.7);margin-bottom:3px}.csn{font-size:22px;font-weight:900}.csi{font-size:10px;color:rgba(255,255,255,.8);margin-top:2px}.cb{padding:20px 14px;border-bottom:1px solid #1a3a8f;flex:1}.cl{font-size:9px;font-weight:700;color:#1a3a8f;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}.cn{font-size:18px;font-weight:800}.cf{display:flex;background:#f0f4ff;border-top:1px solid #1a3a8f}.ci{flex:1;padding:14px 12px;border-right:1px solid #c7d2fe}.ci:last-child{border-right:none}.ck{display:block;font-size:9px;color:#1a3a8f;font-weight:700;text-transform:uppercase;margin-bottom:2px}.cv{font-size:13px;font-weight:800;color:#111}.sr{display:flex;align-items:stretch;border-top:2px dashed #aaa;padding:3px 0;break-inside:avoid;page-break-inside:avoid;width:100%;height:65mm}.mn{flex:6.5;border:1px solid #444;padding:6px 8px;display:flex;flex-direction:column;gap:3px}.ct{width:18px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#bbb;flex-shrink:0}.st{flex:3;min-width:0;border:1px solid #444;padding:4px 8px;background:#fafafa;display:flex;flex-direction:column;gap:2px;overflow:hidden}.sh{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1a3a8f;padding-bottom:4px;gap:4px}.ss{font-size:11px;font-weight:800;flex:1;color:#1a3a8f}.sm{flex:1}.sp{font-size:11px;font-weight:800;flex-shrink:0;color:#1a3a8f}.sd{font-size:8px;color:#666;flex-shrink:0}.fr{display:flex;gap:3px}.fb{border:1px solid #bbb;padding:3px 5px;min-height:30px}.fb.s{flex:1.2}.fb.xs{flex:0.7}.fb.xl{flex:3}.fb.xxl{flex:4}.fb.sv{flex:1.4}.fl{display:block;font-size:7.5px;color:#777;margin-bottom:2px;font-weight:600;text-transform:uppercase}.fv{font-size:10px;font-weight:700;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fb2{font-size:13px;font-weight:900;color:#1a3a8f}.fm{font-family:monospace;font-size:9px}.in{border:1px solid #e5c840;background:#fffbe6;padding:4px 7px;font-size:9px;color:#555;line-height:1.6}.bc{display:flex;align-items:center;height:46px;border:1px solid #bbb;padding:3px 8px;overflow:hidden}.s2{display:flex;justify-content:space-between;border-bottom:2px solid #1a3a8f;padding-bottom:2px;margin-bottom:2px}.s2p{font-size:12px;font-weight:900;color:#1a3a8f}.s2d{font-size:10px;color:#666}.sr2{border:1px solid #bbb;padding:2px 6px;min-height:22px}.sr2.hi{background:#f0f4ff;border-color:#1a3a8f}.sl{display:block;font-size:8px;color:#777;font-weight:700;text-transform:uppercase;margin-bottom:1px}.sv{font-size:10px;font-weight:700;display:block}.sb{font-size:14px;font-weight:900;color:#1a3a8f}.sbl{min-height:18px;border-bottom:1px solid #555;margin-top:6px}.sc{font-size:10px;font-weight:700;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sig{border-top:1px solid #555;margin-top:auto;padding-top:3px;font-size:11px;text-align:center;color:#000;font-weight:700}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sr{break-inside:avoid;page-break-inside:avoid}}';
  const listaFinal = lista; // lista real garantida (ver checagem acima)
  const pg1=listaFinal.slice(0,3);const rest=listaFinal.slice(3);
  let html='<div class="print-page" style="height:277mm;display:flex;flex-direction:column;page-break-after:always">'+capa+pg1.map((p: any,i: number)=>slip(p,i)).join('')+'</div>';
  for(let c=0;c<rest.length;c+=4){const grp=rest.slice(c,c+4);html+='<div class="print-page" style="height:277mm;display:flex;flex-direction:column;page-break-after:always">'+grp.map((p: any,i: number)=>slip(p,c+3+i)).join('')+'</div>';}

  abrirDocumentoImprimivel({
    title: 'Carne',
    filename: 'carne-completo-' + (p.customer_name||'').replace(/\s+/g,'-').toLowerCase() + '.pdf',
    css,
    body: html,
    windowFeatures: 'width=800,height=960',
    extraScripts: `
      __pd_loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js').then(function(){
        document.querySelectorAll('[data-pix]').forEach(function(el){
          var px = el.getAttribute('data-pix');
          if (px && window.QRCode) { new QRCode(el, { text: px, width: 70, height: 70, colorDark: '#000', colorLight: '#fff' }); }
        });
      });
    `,
  });
};
