const fs = require('fs');

// 1) Corrige o tamanho do QR gerado via JS (90 -> 70) pra bater com o container
const oldQR = "new QRCode(el, { text: px, width: 90, height: 90, colorDark: '#000', colorLight: '#fff' });";
const newQR = "new QRCode(el, { text: px, width: 70, height: 70, colorDark: '#000', colorLight: '#fff' });";

// 2) Corrige o container e o espaçamento do texto abaixo
const oldBlock = '\'<div id="\'+qi+\'" data-pix="\'+pp+\'" style="width:64px;height:64px;margin:2px auto"></div><div style="text-align:center;margin-top:2px"><span style="display:block;font-size:8px;color:#1a3a8f;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Pague pelo Pix</span><span style="display:block;font-size:12px;font-weight:800;color:#000;word-break:break-all;line-height:1.2;padding:0 2px">\'+sPix+\'</span></div>\'';
const newBlock = '\'<div id="\'+qi+\'" data-pix="\'+pp+\'" style="width:70px;height:70px;margin:4px auto 0"></div><div style="text-align:center;margin-top:6px"><span style="display:block;font-size:8px;color:#1a3a8f;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Pague pelo Pix</span><span style="display:block;font-size:11px;font-weight:800;color:#000;word-break:break-all;line-height:1.2;padding:0 2px">\'+sPix+\'</span></div>\'';

// Arquivo com o QRCode JS
const pathQR = 'src/pages/CrediarioPage.tsx';
let contentQR = fs.readFileSync(pathQR, 'utf8');
if (contentQR.includes(oldQR)) {
  contentQR = contentQR.split(oldQR).join(newQR);
  fs.writeFileSync(pathQR, contentQR, 'utf8');
  console.log(pathQR + ': tamanho do QR corrigido');
} else {
  console.error(pathQR + ': linha do QRCode JS nao encontrada');
}

// Arquivos com o bloco de layout (QR container + texto Pix)
const arquivos = ['src/pages/CrediarioPage.tsx', 'src/pages/VendasPage.tsx'];
for (const path of arquivos) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(oldBlock)) {
    content = content.split(oldBlock).join(newBlock);
    fs.writeFileSync(path, content, 'utf8');
    console.log(path + ': espacamento do bloco Pix corrigido');
  } else {
    console.error(path + ': bloco Pix nao encontrado (pode ter texto ligeiramente diferente)');
  }
}