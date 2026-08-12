const fs = require('fs');

const path = 'src/pages/VendasPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// Regex flexível: pega o bloco inteiro do "sr2" que contém custName, sem exigir texto exato
const regex = /<div class="sr2" style="border:none[^>]*>.*?custName\+'<\/div>/;

const match = content.match(regex);

if (match) {
  console.log('ENCONTRADO:');
  console.log(JSON.stringify(match[0]));

  const newStr = 'class="sr2" style="border:none;text-align:center;padding:2px 0;overflow:hidden"><span style="display:block;font-size:11px;font-weight:800;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\'+custName+\'</span></div>';

  content = content.replace(regex, newStr);
  fs.writeFileSync(path, content, 'utf8');
  console.log(path + ': aplicado com sucesso');
} else {
  console.error(path + ': regex nao encontrou nada. Procurando so por custName...');
  const idx = content.indexOf("custName+'</div>");
  if (idx >= 0) {
    console.log('Trecho ao redor (200 chars antes):');
    console.log(JSON.stringify(content.slice(idx - 200, idx + 30)));
  } else {
    console.error('Nem "custName+\'</div>" foi encontrado no arquivo.');
  }
}