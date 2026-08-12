const fs = require('fs');

const oldStr = '.st{flex:3;border:1px solid #444;padding:4px 8px;background:#fafafa;display:flex;flex-direction:column;gap:2px;overflow:hidden}';
const newStr = '.st{flex:3;min-width:0;border:1px solid #444;padding:4px 8px;background:#fafafa;display:flex;flex-direction:column;gap:2px;overflow:hidden}';

const arquivos = ['src/pages/CrediarioPage.tsx', 'src/pages/VendasPage.tsx'];
for (const path of arquivos) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(oldStr)) {
    content = content.split(oldStr).join(newStr);
    fs.writeFileSync(path, content, 'utf8');
    console.log(path + ': min-width corrigido com sucesso');
  } else {
    console.error(path + ': trecho nao encontrado');
  }
}