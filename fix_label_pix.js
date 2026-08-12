const fs = require('fs');

const oldBlock = '\'<div id="\'+qi+\'" data-pix="\'+pp+\'" style="width:70px;height:70px;margin:4px auto 0"></div><div style="text-align:center;margin-top:6px"><span style="display:block;font-size:8px;color:#1a3a8f;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Pague pelo Pix</span><span style="display:block;font-size:11px;font-weight:800;color:#000;word-break:break-all;line-height:1.2;padding:0 2px">\'+sPix+\'</span></div>\'';

const newBlock = '\'<div id="\'+qi+\'" data-pix="\'+pp+\'" style="width:70px;height:70px;margin:4px auto 0"></div><div style="text-align:center;margin-top:8px"><span style="display:block;font-size:11px;font-weight:800;color:#000;word-break:break-all;line-height:1.3;padding:0 2px">Pix: \'+sPix+\'</span></div>\'';

const arquivos = ['src/pages/CrediarioPage.tsx', 'src/pages/VendasPage.tsx'];
for (const path of arquivos) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(oldBlock)) {
    content = content.split(oldBlock).join(newBlock);
    fs.writeFileSync(path, content, 'utf8');
    console.log(path + ': label Pix simplificada com sucesso');
  } else {
    console.error(path + ': bloco nao encontrado');
  }
}