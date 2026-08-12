const fs = require('fs');

const path = 'src/pages/VendasPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldStr = "'</span></div>class=\"sr2\" style=\"border:none;text-align:center;padding:2px 0;overflow:hidden\">";
const newStr = "'</span></div><div class=\"sr2\" style=\"border:none;text-align:center;padding:2px 0;overflow:hidden\">";

if (content.includes(oldStr)) {
  content = content.split(oldStr).join(newStr);
  fs.writeFileSync(path, content, 'utf8');
  console.log(path + ': corrigido com sucesso');
} else {
  console.error(path + ': trecho nao encontrado');
}