const fs = require('fs');

const oldStr = '"width:70px;height:70px;margin:4px auto 12px"></div><div style="text-align:center;margin-top:0">';
const newStr = '"width:70px;height:70px;margin:4px auto 18px"></div><div style="text-align:center;margin-top:0">';

const arquivos = ['src/pages/CrediarioPage.tsx', 'src/pages/VendasPage.tsx'];
for (const path of arquivos) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(oldStr)) {
    content = content.split(oldStr).join(newStr);
    fs.writeFileSync(path, content, 'utf8');
    console.log(path + ': margem ajustada com sucesso');
  } else {
    console.error(path + ': trecho nao encontrado');
  }
}