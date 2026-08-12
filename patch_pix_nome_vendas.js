const fs = require('fs');

const oldStr = fs.readFileSync('trecho2.txt', 'utf8').replace(/\r?\n$/, '');
const newStr = 'class="sr2" style="border:none;text-align:center;padding:2px 0;overflow:hidden"><span style="display:block;font-size:11px;font-weight:800;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\'+custName+\'</span></div>';

const path = 'src/pages/VendasPage.tsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes(oldStr)) {
  content = content.split(oldStr).join(newStr);
  fs.writeFileSync(path, content, 'utf8');
  console.log(path + ': aplicado com sucesso');
} else {
  console.error(path + ': ainda nao encontrado. Tamanho do oldStr: ' + oldStr.length);
  console.error(JSON.stringify(oldStr));
}