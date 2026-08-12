const fs = require('fs');

// Reverte CrediarioPage.tsx
const path1 = 'src/pages/CrediarioPage.tsx';
let c1 = fs.readFileSync(path1, 'utf8');
const new1 = 'text-overflow:ellipsis">\'+(custName.length>26?custName.slice(0,26)+\'\u2026\':custName)+\'</span></div>';
const old1 = 'text-overflow:ellipsis">\'+custName+\'</span></div>';
if (c1.includes(new1)) {
  c1 = c1.split(new1).join(old1);
  fs.writeFileSync(path1, c1, 'utf8');
  console.log(path1 + ': revertido com sucesso');
} else {
  console.error(path1 + ': trecho nao encontrado para reverter');
}

// Reverte VendasPage.tsx
const path2 = 'src/pages/VendasPage.tsx';
let c2 = fs.readFileSync(path2, 'utf8');
const new2 = 'text-overflow:ellipsis">\'+(v.customer_name.length>26?v.customer_name.slice(0,26)+\'\u2026\':v.customer_name)+\'</span></div>';
const old2 = 'text-overflow:ellipsis">\'+v.customer_name+\'</span></div>';
if (c2.includes(new2)) {
  c2 = c2.split(new2).join(old2);
  fs.writeFileSync(path2, c2, 'utf8');
  console.log(path2 + ': revertido com sucesso');
} else {
  console.error(path2 + ': trecho nao encontrado para reverter');
}