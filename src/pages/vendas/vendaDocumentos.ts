// Geração dos documentos imprimíveis de uma venda (comprovante, carnê,
// instrumento de dívida, quitação). Extraído do VendasPage.tsx original só
// para organização — o texto/lógica de cada função é idêntico ao que estava
// lá, apenas recebendo `storeSettings` como parâmetro explícito em vez de
// via closure do componente.

import { supabase } from '../../lib/supabase';
import { formatBRL } from '../../types/index';
import { abrirDocumentoImprimivel } from '../../utils/printDoc';
import { PAGAMENTOS, formatDate, formatDateTime, type Sale, type StoreSettings } from './vendasTypes';

// ── Cabeçalho empresa para documentos ──
export const getCabecalho = (s: StoreSettings | null) => {
  if (!s) return '<h2 style="text-align:center">ÓPTICA</h2>';
  return `
    <div style="text-align:center;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:16px">
      ${s.logo_url ? `<img src="${s.logo_url}" style="max-height:60px;margin-bottom:8px"><br>` : ''}
      <h2 style="margin:0;font-size:18px;text-transform:uppercase">${s.name}</h2>
      <div style="font-size:11px;color:#555;margin-top:4px">
        ${s.cnpj ? 'CNPJ: ' + s.cnpj : ''}${s.cnpj && s.phone ? ' | ' : ''}${s.phone ? 'Tel: ' + s.phone : ''}<br>
        ${s.address ? s.address + (s.city ? ' — ' + s.city + '/' + s.state : '') : ''}
        ${s.email ? '<br>' + s.email : ''}
      </div>
    </div>`;
};

export const getPagLabel = (v: Sale) => {
  const pag = PAGAMENTOS.find(p => p.value === v.payment_method);
  return (pag?.label || v.payment_method) + (v.installments > 1 ? ' ' + v.installments + 'x' : '');
};

const baseStyle = `body{font-family:Arial,sans-serif;font-size:13px;padding:24px;line-height:1.5}
  table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px}
  th{background:#f5f5f5;font-weight:bold}.assinatura{margin-top:40px;text-align:center}.linha{border-top:1px solid #333;margin:40px 0 6px}`;

export const imprimirComprovante = (v: Sale, storeSettings: StoreSettings | null) => {
  const bodyHtml = `
    ${getCabecalho(storeSettings)}
    <h3 style="text-align:center;text-transform:uppercase;margin:0 0 16px">Comprovante de Pagamento</h3>
    <table><tr><th>Venda</th><th>Data</th><th>Cliente</th><th>Vendedor</th></tr>
    <tr><td>#${String(v.sale_number).padStart(4,'0')}</td><td>${formatDateTime(v.created_at)}</td><td>${v.customer_name}</td><td>${v.vendedor||'—'}</td></tr></table>
    <table><tr><th>Forma de Pagamento</th><th>Parcelas</th><th>Subtotal</th><th>Desconto</th><th>Entrada</th><th>Total</th></tr>
    <tr><td>${getPagLabel(v)}</td><td>${v.installments}x</td><td>${formatBRL(v.subtotal)}</td><td>${formatBRL(v.discount)}</td><td>${formatBRL(v.entrada||0)}</td><td><b>${formatBRL(v.total)}</b></td></tr></table>
    <div class="total">TOTAL PAGO: ${formatBRL(v.total)}</div>
    ${v.notes ? `<p style="font-size:11px;color:#666">Obs: ${v.notes}</p>` : ''}
    <div class="linha"></div><p class="assinatura">Assinatura do Cliente — ${v.customer_name}</p>
    <p style="text-align:center;font-size:10px;color:#999">${storeSettings?.city||''}, ${formatDate(v.created_at)}</p>
  `;
  abrirDocumentoImprimivel({
    title: 'Comprovante',
    filename: 'comprovante-venda-' + String(v.sale_number).padStart(4, '0') + '.pdf',
    css: baseStyle + `.total{font-size:20px;font-weight:bold;text-align:center;padding:12px;border:2px solid #333;border-radius:8px;margin:16px 0}`,
    body: bodyHtml,
    windowFeatures: 'width=600,height=800',
  });
};

export const imprimirCarne = async (v: Sale, storeSettings: StoreSettings | null) => {
  const { data: cred } = await supabase.from('crediario').select('id').eq('sale_id', v.id).single();
  const { data: parc } = cred ? await supabase.from('crediario_parcelas').select('*').eq('crediario_id', cred.id).order('installment_number', { ascending: true }) : { data: [] };
  const lista = (parc || []) as any[];
  const nP = lista.length || v.installments || 1;
  const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmtD = (d: string) => { if (!d) return '--'; const dt = d.includes('T') ? new Date(d) : new Date(d+'T12:00:00'); return isNaN(dt.getTime()) ? '--' : dt.toLocaleDateString('pt-BR'); };
  const sName = storeSettings?.name || 'Otica';
  const sPix = storeSettings?.pix_key || '';
  const sLogo = storeSettings?.logo_url || '';
  const sCnpj = storeSettings?.cnpj || '';
  const sAddr = storeSettings?.address || '';
  const sCity = storeSettings?.city || '';
  const sState = storeSettings?.state || '';
  const sPhone = storeSettings?.phone || '';
  const mkBC = (seed: number) => { const pat=[3,1,4,1,2,1,1,4,2,1,3,1,1,2,1,4,2,1,1,3,4,1,2,1,3,1,1,2,3,1,4,1,2,1,1,3,2,1,1,2,4,1,3,1]; return pat.map((b,i)=>'<span style="display:inline-block;height:42px;width:'+(b+(seed*3+i)%2)+'px;background:'+(i%2===0?'#000':'#fff')+'"></span>').join(''); };
  const pixEMV = (chave: string, valor: number, nome: string): string => { const f=(id:string,vv:string)=>id+String(vv.length).padStart(2,'0')+vv; const mai=f('00','BR.GOV.BCB.PIX')+f('01',chave); const amt=valor>0?valor.toFixed(2):''; let p=f('00','01')+f('26',mai)+f('52','0000')+f('53','986')+(amt?f('54',amt):'')+f('58','BR')+f('59',nome.substring(0,25).replace(/[^A-Za-z0-9 ]/g,''))+f('60','SAO PAULO')+f('62',f('05','***'))+'6304'; let crc=0xFFFF; for(let i=0;i<p.length;i++){crc^=p.charCodeAt(i)<<8;for(let j=0;j<8;j++)crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;} return p+(crc&0xFFFF).toString(16).toUpperCase().padStart(4,'0'); };
  const slip = (p: any, idx: number) => { const pN=p.installment_number||idx+1; const sd=String(v.sale_number||'').padStart(4,'0'); const ld=sd+String(pN).padStart(3,'0')+'0000000000000000000'; const vc=p.due_date?fmtD(p.due_date):'--'; const em=fmtD(v.created_at); const vs=fmtV(p.amount).replace('R$ ','').replace('R$','').trim(); const pp=sPix?pixEMV(sPix,p.amount,sName):''; const qi='qr_'+String(p.id||idx).replace(/-/g,''); return '<div class="sr"><div class="mn"><div class="sh"><span class="ss">'+sName+'</span><span class="sm"></span><span class="sp">'+pN+'/'+nP+'</span><span class="sd">'+sd+' / '+ld.slice(0,12)+'...</span></div><div class="fr"><div class="fb s"><span class="fl">Parcela</span><span class="fv">'+pN+'</span></div><div class="fb s"><span class="fl">Vencimento</span><span class="fv">'+vc+'</span></div><div class="fb xl"><span class="fl">Cliente</span><span class="fv">'+v.customer_name+'</span></div><div class="fb s"><span class="fl">Emissao</span><span class="fv">'+em+'</span></div></div><div class="in">O nao pagamento acarretara juros de R$ 0,07 ao dia. Pagavel somente na loja de origem.</div><div class="bc">'+mkBC(pN*11)+'</div><div class="fr" style="margin-top:4px"><div class="fb xs"><span class="fl">Nr.Doc</span><span class="fv">'+sd+'</span></div><div class="fb xxl"><span class="fl">&nbsp;</span><span class="fv fm">'+ld.slice(0,30)+'</span></div><div class="fb s"><span class="fl">Emissao</span><span class="fv">'+em+'</span></div><div class="fb sv"><span class="fl">Valor</span><span class="fv fb2">R$ '+vs+'</span></div></div></div><div class="ct">&#9986;</div><div class="st"><div class="s2"><span class="s2p">'+pN+'/'+nP+'</span><span class="s2d">'+sd+'</span></div><div class="sr2"><span class="sl">Vencimento</span><span class="sv">'+vc+'</span></div><div class="sr2 hi"><span class="sl">Valor Cobrado</span><span class="sv sb">R$ '+vs+'</span></div><div class="sr2" style="border:none;text-align:center;padding:2px 0;overflow:hidden"><span style="display:block;font-size:11px;font-weight:800;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+v.customer_name+'</span></div>'+(pp?'<div id="'+qi+'" data-pix="'+pp+'" style="width:70px;height:70px;margin:4px auto 18px"></div><div style="text-align:center;margin-top:0"><span style="display:block;font-size:11px;font-weight:800;color:#000;word-break:break-all;line-height:1.3;padding:0 2px">Pix: '+sPix+'</span></div>':'')+'</div></div>'; };
  const capa = '<div class="cp"><div class="ch"><div class="lw">'+(sLogo?'<img src="'+sLogo+'" style="width:62px;height:62px;object-fit:cover;border-radius:4px"/>':'<div class="ls"><div class="lg"></div></div>')+'</div><div class="ct2"><div class="ctit">CARNE DE PAGAMENTO</div><div class="csn">'+sName+'</div>'+(sCnpj?'<div class="csi">CNPJ: '+sCnpj+'</div>':'')+((sAddr||sCity)?'<div class="csi">'+( sAddr||'')+( sCity?', '+sCity:'')+(sState?' - '+sState:'')+'</div>':'')+( sPhone?'<div class="csi">Tel: '+sPhone+'</div>':'')+'</div></div><div class="cb"><div class="cl">CLIENTE / DEVEDOR</div><div class="cn">'+v.customer_name+'</div></div><div class="cf"><div class="ci"><span class="ck">Total da Divida</span><span class="cv">'+fmtV(v.total||0)+'</span></div><div class="ci"><span class="ck">No Parcelas</span><span class="cv">'+nP+'</span></div><div class="ci"><span class="ck">Valor/Parcela</span><span class="cv">'+fmtV((v.total||0)/nP)+'</span></div><div class="ci"><span class="ck">Emissao</span><span class="cv">'+fmtD(v.created_at)+'</span></div></div></div>';
  const css = '@page{size:A4 portrait;margin:8mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000;background:#fff;display:flex;flex-direction:column}.cp{border:2px solid #1a3a8f;border-radius:4px;overflow:hidden;margin-bottom:0;flex-shrink:0}.ch{background:#1a3a8f;color:#fff;display:flex;align-items:center;gap:12px;padding:18px 14px}.lw{flex-shrink:0}.ls{width:62px;height:62px;border:2px solid rgba(255,255,255,.4);border-radius:4px;background:rgba(255,255,255,.1)}.lg{width:100%;height:100%;background:repeating-linear-gradient(90deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 1px,transparent 6px) top/6px 6px,repeating-linear-gradient(rgba(255,255,255,.3) 0,rgba(255,255,255,.3) 1px,transparent 1px,transparent 6px)}.ct2{flex:1;text-align:center}.ctit{font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.7);margin-bottom:3px}.csn{font-size:22px;font-weight:900}.csi{font-size:10px;color:rgba(255,255,255,.8);margin-top:2px}.cb{padding:20px 14px;border-bottom:1px solid #1a3a8f;flex:1}.cl{font-size:9px;font-weight:700;color:#1a3a8f;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}.cn{font-size:18px;font-weight:800}.cf{display:flex;background:#f0f4ff;border-top:1px solid #1a3a8f}.ci{flex:1;padding:14px 12px;border-right:1px solid #c7d2fe}.ci:last-child{border-right:none}.ck{display:block;font-size:9px;color:#1a3a8f;font-weight:700;text-transform:uppercase;margin-bottom:2px}.cv{font-size:13px;font-weight:800;color:#111}.sr{display:flex;align-items:stretch;border-top:2px dashed #aaa;padding:3px 0;break-inside:avoid;page-break-inside:avoid;width:100%;height:65mm}.mn{flex:6.5;border:1px solid #444;padding:6px 8px;display:flex;flex-direction:column;gap:3px}.ct{width:18px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#bbb;flex-shrink:0}.st{flex:3;min-width:0;border:1px solid #444;padding:4px 8px;background:#fafafa;display:flex;flex-direction:column;gap:2px;overflow:hidden}.sh{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1a3a8f;padding-bottom:4px;gap:4px}.ss{font-size:11px;font-weight:800;flex:1;color:#1a3a8f}.sm{flex:1}.sp{font-size:11px;font-weight:800;flex-shrink:0;color:#1a3a8f}.sd{font-size:8px;color:#666;flex-shrink:0}.fr{display:flex;gap:3px}.fb{border:1px solid #bbb;padding:3px 5px;min-height:30px}.fb.s{flex:1.2}.fb.xs{flex:0.7}.fb.xl{flex:3}.fb.xxl{flex:4}.fb.sv{flex:1.4}.fl{display:block;font-size:7.5px;color:#777;margin-bottom:2px;font-weight:600;text-transform:uppercase}.fv{font-size:10px;font-weight:700;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fb2{font-size:13px;font-weight:900;color:#1a3a8f}.fm{font-family:monospace;font-size:9px}.in{border:1px solid #e5c840;background:#fffbe6;padding:4px 7px;font-size:9px;color:#555;line-height:1.6}.bc{display:flex;align-items:center;height:46px;border:1px solid #bbb;padding:3px 8px;overflow:hidden}.s2{display:flex;justify-content:space-between;border-bottom:2px solid #1a3a8f;padding-bottom:2px;margin-bottom:2px}.s2p{font-size:12px;font-weight:900;color:#1a3a8f}.s2d{font-size:10px;color:#666}.sr2{border:1px solid #bbb;padding:2px 6px;min-height:22px}.sr2.hi{background:#f0f4ff;border-color:#1a3a8f}.sl{display:block;font-size:8px;color:#777;font-weight:700;text-transform:uppercase;margin-bottom:1px}.sv{font-size:10px;font-weight:700;display:block}.sb{font-size:14px;font-weight:900;color:#1a3a8f}.sbl{min-height:18px;border-bottom:1px solid #555;margin-top:6px}.sc{font-size:10px;font-weight:700;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sig{border-top:1px solid #555;margin-top:auto;padding-top:3px;font-size:11px;text-align:center;color:#000;font-weight:700}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sr{break-inside:avoid;page-break-inside:avoid}}';
  const listaFinal = lista.length > 0 ? lista : Array.from({length: nP}, (_, i) => {
    const due = new Date(); due.setMonth(due.getMonth() + i);
    return { installment_number: i+1, amount: v.total/nP, due_date: due.toISOString().split('T')[0], id: String(i) };
  });
  const pg1=listaFinal.slice(0,3);const rest=listaFinal.slice(3);
  let html='<div class="print-page" style="height:277mm;display:flex;flex-direction:column;page-break-after:always">'+capa+pg1.map((p: any,i: number)=>slip(p,i)).join('')+'</div>';
  for(let c=0;c<rest.length;c+=4){const grp=rest.slice(c,c+4);html+='<div class="print-page" style="height:277mm;display:flex;flex-direction:column;page-break-after:always">'+grp.map((p: any,i: number)=>slip(p,c+3+i)).join('')+'</div>';}

  abrirDocumentoImprimivel({
    title: 'Carne',
    filename: 'carne-venda-' + String(v.sale_number).padStart(4, '0') + '.pdf',
    css,
    body: html,
    windowFeatures: 'width=800,height=960',
    extraScripts: `
      __pd_loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js').then(function(){
        document.querySelectorAll('[data-pix]').forEach(function(el){
          var px = el.getAttribute('data-pix');
          if (px && window.QRCode) { new QRCode(el, { text: px, width: 90, height: 90, colorDark: '#000', colorLight: '#fff' }); }
        });
      });
    `,
  });
};

export const imprimirInstrumentoDivida = async (v: Sale, storeSettings: StoreSettings | null) => {
  const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', v.id);
  const { data: cred } = await supabase.from('crediario').select('id').eq('sale_id', v.id).single();
  const { data: parc } = cred ? await supabase.from('crediario_parcelas').select('*').eq('crediario_id', cred.id).order('installment_number', { ascending: true }) : { data: [] };
  const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmtD2 = (d: string) => { if (!d) return '--'; const dt=d.includes('T')?new Date(d):new Date(d+'T12:00:00'); return isNaN(dt.getTime())?'--':dt.toLocaleDateString('pt-BR'); };
  const sName = storeSettings?.name || 'Otica';
  const sCnpj = storeSettings?.cnpj || '';
  const sAddr = storeSettings?.address || '';
  const sCity = storeSettings?.city || '';
  const sState = storeSettings?.state || '';
  const sPhone = storeSettings?.phone || '';
  const sLogo = storeSettings?.logo_url || '';
  const saldo = v.total - (v.entrada || 0);
  const nP = v.installments || 1;
  const lista = (parc || []) as any[];
  // Valor real da divida no momento da impressao: soma apenas das parcelas ainda
  // nao pagas. Se o instrumento for reimpresso depois que o cliente ja quitou
  // parte do crediario, o valor da confissao precisa refletir o saldo atual, e
  // nao o valor total financiado la no inicio (que e o que "saldo" representa).
  const saldoAtual = lista.length > 0
    ? lista.filter((p: any) => p.status !== 'pago').reduce((s: number, p: any) => s + p.amount, 0)
    : saldo;
  const itensList = (items || []) as any[];
  const itensHtml = itensList.map((item: any, i: number) =>
    '<tr><td style="text-align:center">'+(i+1)+'</td><td>'+item.description+'</td><td style="text-align:center">'+item.quantity+'</td><td style="text-align:right">'+fmtV(item.unit_price)+'</td><td style="text-align:right">'+fmtV(item.total)+'</td></tr>'
  ).join('');
  const parcelasDemo = lista.length > 0
    ? lista.map((p: any, i: number) => '<div class="pd" style="'+(p.status==='pago'?'opacity:.55':'')+'"><div class="pl">Parcela '+(p.installment_number||i+1)+(p.status==='pago'?' — PAGA':'')+'</div><div class="pv">Venc: '+fmtD2(p.due_date)+'</div><div class="pa">'+fmtV(p.amount)+'</div></div>').join('')
    : Array.from({length: nP}, (_, i) => { const due = new Date(); due.setMonth(due.getMonth()+i+1); return '<div class="pd"><div class="pl">Parcela '+(i+1)+'</div><div class="pv">Venc: '+due.toLocaleDateString('pt-BR')+'</div><div class="pa">'+fmtV(saldo/nP)+'</div></div>'; }).join('');
  const dataLocal = sCity && sState ? sCity+' - '+sState+', '+new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'}) : new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
  const css = '@page{size:A4 portrait;margin:15mm 15mm 15mm 15mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000;background:#fff}.hdr{text-align:center;border-bottom:2px solid #1a3a8f;padding-bottom:12px;margin-bottom:16px}.hdr img{max-height:60px;margin-bottom:4px}.hn{font-size:20px;font-weight:900;color:#1a3a8f}.hs{font-size:11px;color:#444;margin-top:2px}h3{text-align:center;text-decoration:underline;margin:0 0 16px;font-size:14px}p{margin:6px 0;text-align:justify;font-size:12px;line-height:1.6}.info{background:#f5f8ff;border:1px solid #c7d2fe;border-radius:4px;padding:10px 14px;margin:10px 0}.info p{margin:3px 0}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px}th{background:#1a3a8f;color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #e2e8f0}.tot{background:#f0f4ff;font-weight:700}.totv{background:#1a3a8f;color:#fff;font-weight:900;font-size:13px}.demo{margin-top:16px}.demo-title{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;color:#1a3a8f;border-bottom:2px solid #1a3a8f;padding-bottom:4px}.demo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.pd{border:1px solid #c7d2fe;border-radius:4px;padding:8px;background:#f5f8ff}.pl{font-size:10px;font-weight:700;color:#1a3a8f;text-transform:uppercase}.pv{font-size:10px;color:#555;margin:2px 0}.pa{font-size:13px;font-weight:800;color:#111}.sigs{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:50px}.sig-line{border-top:1px solid #000;padding-top:6px;text-align:center;font-size:11px}';
  const html = '<div class="hdr">'+(sLogo?'<img src="'+sLogo+'"/><br/>':'')+'<div class="hn">'+sName+'</div>'+(sCnpj?'<div class="hs">CNPJ: '+sCnpj+'</div>':'')+(sAddr?'<div class="hs">'+sAddr+(sCity?', '+sCity:'')+(sState?' - '+sState:'')+'</div>':'')+(sPhone?'<div class="hs">Tel: '+sPhone+'</div>':'')+'</div>'
    +'<h3>Instrumento de Confissao de Divida</h3>'
    +'<div class="info"><p><b>CONTRATANTE (DEVEDOR):</b> '+v.customer_name+'</p></div>'
    +'<p>Pelo presente instrumento de Confissao de Divida, o(a) Confitente Devedor(a) acima identificado(a), reconhece e confessa dever a esta empresa as parcelas declaradas abaixo, conformas demonstrativo (a) de debito (a) que integra (m) o presente instrumento.</p>'
    +'<p>De acordo com o art. 49 do Codigo de Defesa do Consumidor (Lei n. 8.078/1990), o consumidor pode desistir do contrato no prazo de 7 dias a contar de sua assinatura ou do ato de recebimento do produto, sempre que a contratacao ocorrer fora do estabelecimento comercial. Sendo exercido o direito, os valores pagos serao devolvidos monetariamente atualizados.</p>'
    +'<p>Venda: '+fmtD2(v.created_at)+(v.os_number?' | OS: #'+String(v.os_number).padStart(4,'0'):'')+(v.notes?' | '+v.notes:'')+'</p>'
    +'<table><thead><tr><th>#</th><th>Descricao dos Produtos/Servicos</th><th>Qtd</th><th>Val. Unit.</th><th>Total Item</th></tr></thead><tbody>'+itensHtml+'</tbody>'
    +'<tfoot><tr class="tot"><td colspan="4" style="text-align:right">Subtotal:</td><td style="text-align:right">'+fmtV(v.subtotal||v.total)+'</td></tr>'
    +((v.entrada||0)>0?'<tr class="tot"><td colspan="4" style="text-align:right">Entrada / Sinal:</td><td style="text-align:right">- '+fmtV(v.entrada||0)+'</td></tr>':'')
    +(v.discount>0?'<tr class="tot"><td colspan="4" style="text-align:right">Desconto:</td><td style="text-align:right">- '+fmtV(v.discount)+'</td></tr>':'')
    +'<tr class="totv"><td colspan="4" style="text-align:right">VALOR DA CONFISSAO:</td><td style="text-align:right">'+fmtV(saldoAtual)+'</td></tr></tfoot></table>'
    +(saldoAtual !== saldo ? '<p style="font-size:10px;color:#555">Valor atualizado considerando parcelas já pagas. Valor total originalmente financiado: '+fmtV(saldo)+'.</p>' : '')
    +(nP>1?'<div class="demo"><div class="demo-title">Demonstrativo de Parcelamento (Carne)</div><div class="demo-grid">'+parcelasDemo+'</div></div>':'')
    +'<p style="margin-top:20px">'+dataLocal+'</p>'
    +'<div class="sigs"><div class="sig-line">'+v.customer_name+'<br/><span style="font-size:10px;color:#666">Assinatura do Devedor</span></div><div class="sig-line">'+sName+'<br/><span style="font-size:10px;color:#666">Assinatura da Empresa</span></div></div>';

  abrirDocumentoImprimivel({
    title: 'Instrumento',
    filename: 'instrumento-divida-venda-' + String(v.sale_number).padStart(4, '0') + '.pdf',
    css,
    body: html,
    windowFeatures: 'width=800,height=960',
  });
};

export const imprimirQuitacao = async (v: Sale, storeSettings: StoreSettings | null) => {
  const { data: custData } = await supabase.from('customers').select('cpf,rg,phone,address,city,state').eq('id', v.customer_id || '').single();
  const cust = custData as any || {};
  const fmtV = (n: number) => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const fmtD2 = (d: string) => { if (!d) return '--'; const dt=d.includes('T')?new Date(d):new Date(d+'T12:00:00'); return isNaN(dt.getTime())?'--':dt.toLocaleDateString('pt-BR'); };
  const sName = storeSettings?.name || 'Otica';
  const sCnpj = storeSettings?.cnpj || '';
  const sAddr = storeSettings?.address || '';
  const sCity = storeSettings?.city || '';
  const sState = storeSettings?.state || '';
  const sPhone = storeSettings?.phone || '';
  const sLogo = storeSettings?.logo_url || '';
  const custCpf = cust.cpf || '';
  const custRg = cust.rg || '';
  const dataExtenso = new Date().toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
  const dataVenda = fmtD2(v.created_at);
  const css = '@page{size:A4 portrait;margin:15mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000;background:#fff}.hdr{text-align:center;border-bottom:2px solid #1a3a8f;padding-bottom:12px;margin-bottom:24px}.hdr img{max-height:60px;margin-bottom:4px}.hn{font-size:20px;font-weight:900;color:#1a3a8f}.hs{font-size:11px;color:#444;margin-top:2px}.wrap{overflow:hidden;margin-bottom:16px}.selo{float:right;border:3px solid #e53e3e;color:#e53e3e;padding:6px 14px;border-radius:4px;font-weight:900;font-size:14px;transform:rotate(-12deg);margin-top:-8px;letter-spacing:1px}h3{text-align:center;text-decoration:underline;font-size:14px;margin:0 0 20px;text-transform:uppercase}p{margin:10px 0;text-align:justify;line-height:1.7}.sig{margin-top:50px;text-align:center}.sig-line{display:inline-block;min-width:260px;border-top:1px solid #000;padding-top:6px;font-size:11px}';
  const cnpjLine = sCnpj ? ', inscrita no CNPJ sob o n. '+sCnpj+',' : ',';
  const cpfLine = custCpf ? ', inscrito(a) no CPF sob o n. '+custCpf+(custRg?', RG n. '+custRg:'') : '';
  const html = '<div class="hdr">'+(sLogo?'<img src="'+sLogo+'"/><br/>':'')+'<div class="hn">'+sName+'</div>'+(sCnpj?'<div class="hs">CNPJ: '+sCnpj+'</div>':'')+(sAddr?'<div class="hs">'+sAddr+(sCity?', '+sCity:'')+(sState?' - '+sState:'')+'</div>':'')+(sPhone?'<div class="hs">Tel: '+sPhone+'</div>':'')+'</div>'
    +'<div class="wrap"><div class="selo">DEBITO QUITADO</div><h3>Termo de Quitacao Total</h3></div>'
    +'<p>Pelo presente instrumento particular, a empresa <b>'+sName+'</b>'+cnpjLine+' declara para os devidos fins que o(a) Sr(a). <b>'+v.customer_name+'</b>'+cpfLine+', efetuou o pagamento integral de todos os debitos referentes a venda efetuada em <b>'+dataVenda+'</b>.</p>'
    +'<p>O valor total liquidado foi de <b>'+fmtV(v.total)+'</b>, correspondente a <b>'+v.installments+'</b> parcela(s) do crediario proprio, todas devidamente quitadas ate a presente data.</p>'
    +'<p>Desta forma, damos plena, geral e irrevogavel quitacao de todos os valores e obrigacoes decorrentes deste contrato, nada mais havendo o que reclamar ou exigir a qualquer titulo.</p>'
    +'<p>Por ser a expressao da verdade, firmamos o presente.</p>'
    +'<p style="margin-top:30px">, '+dataExtenso+'</p>'
    +'<div class="sig"><div class="sig-line">'+sName+'<br/><span style="font-size:10px;color:#666">Assinatura da Empresa</span></div></div>';

  abrirDocumentoImprimivel({
    title: 'Quitacao',
    filename: 'quitacao-venda-' + String(v.sale_number).padStart(4, '0') + '.pdf',
    css,
    body: html,
    windowFeatures: 'width=800,height=960',
  });
};
