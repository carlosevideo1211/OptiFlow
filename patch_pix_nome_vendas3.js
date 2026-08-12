const fs = require('fs');

const path = 'src/pages/VendasPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /<div class="sr2" style="border:none[^>]*>.*?v\.customer_name\+'<\/div>/;

const match = content.match(regex);

if (match) {
  console.log('ENCONTRADO:');
  console.log(JSON.stringify(match[0]));

  const newStr = 'class="sr2" style="border:none;text-align:center;padding:2px 0;overflow:hidden"><span style="display:block;font-size:11px;font-weight:800;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\'+v.customer_name+\'</span></div>';

  content = content.replace(regex, newStr);
  fs.writeFileSync(path, content, 'utf8');
  console.log(path + ': aplicado com sucesso');
} else {
  console.error(path + ': ainda nao encontrado');
}