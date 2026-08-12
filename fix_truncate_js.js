const fs = require('fs');

// CrediarioPage.tsx usa custName
const path1 = 'src/pages/CrediarioPage.tsx';
let c1 = fs.readFileSync(path1, 'utf8');
const old1 = 'text-overflow:ellipsis">\'+custName+\'</span></div>';
const new1 = 'text-overflow:ellipsis">\'+(custName.length>26?custName.slice(0,26)+\'\u2026\':custName)+\'</span></div>';
if (c1.includes(old1)) {
  c1 = c1.split(old1).join(new1);
  fs.writeFileSync(path1, c1, 'utf8');
  console.log(path1 + ': truncamento JS aplicado com sucesso');
} else {
  console.error(path1 + ': trecho nao encontrado');
}

// VendasPage.tsx usa v.customer_name
const path2 = 'src/pages/VendasPage.tsx';
let c2 = fs.readFileSync(path2, 'utf8');
const old2 = 'text-overflow:ellipsis">\'+v.customer_name+\'</span></div>';
const new2 = 'text-overflow:ellipsis">\'+(v.customer_name.length>26?v.customer_name.slice(0,26)+\'\u2026\':v.customer_name)+\'</span></div>';
if (c2.includes(old2)) {
  c2 = c2.split(old2).join(new2);
  fs.writeFileSync(path2, c2, 'utf8');
  console.log(path2 + ': truncamento JS aplicado com sucesso');
} else {
  console.error(path2 + ': trecho nao encontrado');
}