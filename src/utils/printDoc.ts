// Utilitario central para gerar documentos imprimiveis/baixaveis (carne, comprovante,
// instrumento de divida, quitacao, recibo, receituario, contrato, etc).
//
// Abre uma janela nova com o HTML do documento e uma barra fixa no topo com dois
// botoes: "Imprimir" e "Baixar PDF". A barra some automaticamente na impressao
// (regra @media print), entao nao aparece no papel nem no PDF gerado.
//
// O PDF e gerado inteiramente dentro da propria janela do documento (sem depender
// de nenhuma biblioteca do bundle principal), carregando html2canvas + jsPDF via
// CDN sob demanda - mesmo padrao que o carne ja usa hoje para desenhar o QR Code
// do Pix (cdnjs.cloudflare.com), entao nao exige nenhuma instalacao nova no projeto.
//
// Cada "pagina" do documento deve ser envolvida em <div class="print-page">...</div>.
// Se nenhuma div com essa classe existir, o documento inteiro e tratado como
// pagina unica automaticamente.

export interface AbrirDocumentoOpts {
  /** Titulo da aba/janela */
  title: string;
  /** Nome do arquivo ao baixar o PDF (ex: "carne-venda-0093.pdf") */
  filename: string;
  /** CSS especifico deste documento (alem do CSS padrao da barra de ferramentas) */
  css: string;
  /** HTML do conteudo do documento (sem <html>/<head>/<body>) */
  body: string;
  /** Scripts extras que devem rodar apos a janela abrir (ex: gerar QR Code) */
  extraScripts?: string;
  /** Tamanho da janela popup, ex: 'width=800,height=960' */
  windowFeatures?: string;
}

export function abrirDocumentoImprimivel(opts: AbrirDocumentoOpts): Window | null {
  const win = window.open('', '_blank', opts.windowFeatures || 'width=900,height=1000');
  if (!win) {
    alert('Seu navegador bloqueou a janela de impressao. Permita pop-ups para este site e tente novamente.');
    return null;
  }

  const toolbarCss = `
    *{box-sizing:border-box}
    #__pd_toolbar{position:sticky;top:0;left:0;right:0;z-index:99999;display:flex;gap:10px;
      justify-content:center;align-items:center;padding:12px;background:#1a3a8f;
      box-shadow:0 2px 8px rgba(0,0,0,.25)}
    #__pd_toolbar button{border:none;border-radius:8px;padding:11px 20px;font-size:14px;
      font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px;font-family:Arial,sans-serif}
    #__pd_print{background:#fff;color:#1a3a8f}
    #__pd_print:hover{background:#eef2ff}
    #__pd_download{background:#22c55e;color:#fff}
    #__pd_download:hover{background:#16a34a}
    #__pd_download:disabled{opacity:.65;cursor:wait}
    #__pd_status{font-size:12px;color:#dbeafe;font-family:Arial,sans-serif;min-width:160px}
    #__pd_content{width:210mm;margin:0 auto;background:#fff}
    #__pd_content .print-page{width:210mm;background:#fff}
    @media print{#__pd_toolbar{display:none !important}}
  `;

  const toolbarHtml = `
    <div id="__pd_toolbar">
      <button id="__pd_print" type="button">Imprimir</button>
      <button id="__pd_download" type="button">Baixar PDF</button>
      <span id="__pd_status"></span>
    </div>
  `;

  const script = `
    function __pd_loadScript(src){
      return new Promise(function(resolve, reject){
        if (document.querySelector('script[data-src="' + src + '"]')) { resolve(); return; }
        var s = document.createElement('script');
        s.src = src; s.setAttribute('data-src', src);
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    async function __pd_ensureLibs(){
      if (!window.html2canvas) {
        await __pd_loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      }
      if (!window.jspdf) {
        await __pd_loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      }
    }
    async function __pd_baixarPdf(){
      var btn = document.getElementById('__pd_download');
      var status = document.getElementById('__pd_status');
      btn.disabled = true;
      try {
        status.textContent = 'Preparando PDF...';
        await __pd_ensureLibs();
        var pages = document.querySelectorAll('.print-page');
        if (pages.length === 0) pages = [document.getElementById('__pd_content')];
        var jsPDFctor = window.jspdf.jsPDF;
        var pdf = new jsPDFctor('p', 'mm', 'a4');
        for (var i = 0; i < pages.length; i++) {
          status.textContent = 'Gerando pagina ' + (i + 1) + ' de ' + pages.length + '...';
          var canvas = await window.html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          var imgData = canvas.toDataURL('image/jpeg', 0.92);
          if (i > 0) pdf.addPage();
          var pageW = pdf.internal.pageSize.getWidth();
          var pageH = pdf.internal.pageSize.getHeight();
          var imgH = (canvas.height * pageW) / canvas.width;
          pdf.addImage(imgData, 'JPEG', 0, 0, pageW, Math.min(imgH, pageH));
        }
        pdf.save('${opts.filename}');
        status.textContent = '';
      } catch (e) {
        console.error('Erro ao gerar PDF:', e);
        status.textContent = '';
        alert('Nao foi possivel gerar o PDF agora. Tente novamente ou use a opcao Imprimir.');
      } finally {
        btn.disabled = false;
      }
    }
    document.getElementById('__pd_print').addEventListener('click', function(){ window.print(); });
    document.getElementById('__pd_download').addEventListener('click', __pd_baixarPdf);
    ${opts.extraScripts || ''}
  `;

  win.document.write(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + opts.title + '</title>' +
    '<style>' + toolbarCss + opts.css + '</style></head><body>' +
    toolbarHtml +
    '<div id="__pd_content">' + opts.body + '</div>' +
    '<script>' + script + '<' + '/script>' +
    '</body></html>'
  );
  win.document.close();
  return win;
}
