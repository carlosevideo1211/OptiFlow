const fs = require('fs');

const oldStr = "'class=\"sr2\" style=\"border:none;text-align:center;padding:2px 0;overflow:hidden\"><span style=\"display:block;font-size:11px;font-weight:800;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">'";
const newStr = "'<div class=\"sr2\" style=\"border:none;text-align:center;padding:2px 0;overflow:hidden\"><span style=\"display:block;font-size:11px;font-weight:800;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">'";

const arquivos = [
  'src/pages/CrediarioPage.tsx',
  'src/pages/VendasPage.tsx',
];

for (const path of arquivos) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(oldStr)) {
    content = content.split(oldStr).join(newStr);
    fs.writeFileSync(path, content, 'utf8');
    console.log(path + ': corrigido com sucesso');
  } else {
    console.error(path + ': trecho quebrado nao encontrado (talvez ja esteja certo, ou texto diferente)');
  }
}