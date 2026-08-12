const fs = require('fs');

const replacements = [
  [
    'LnN0e2ZsZXg6Mztib3JkZXI6MXB4IHNvbGlkICM0NDQ7cGFkZGluZzo0cHggOHB4O2JhY2tncm91bmQ6I2ZhZmFmYTtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHh9',
    'LnN0e2ZsZXg6Mztib3JkZXI6MXB4IHNvbGlkICM0NDQ7cGFkZGluZzo0cHggOHB4O2JhY2tncm91bmQ6I2ZhZmFmYTtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHg7b3ZlcmZsb3c6aGlkZGVufQ=='
  ],
  [
    'PGRpdiBjbGFzcz0ic3IyIiBzdHlsZT0iYm9yZGVyOm5vbmU7dGV4dC1hbGlnbjpjZW50ZXI7cGFkZGluZzo0cHggMCI+PHNwYW4gc3R5bGU9ImZvbnQtc2l6ZToxMnB4O2ZvbnQtd2VpZ2h0OjgwMDtjb2xvcjojMDAwIj4nK2N1c3ROYW1lKycePC9kaXY+',
    'PGRpdiBjbGFzcz0ic3IyIiBzdHlsZT0iYm9yZGVyOm5vbmU7dGV4dC1hbGlnbjpjZW50ZXI7cGFkZGluZzoycHggMDtvdmVyZmxvdzpoaWRkZW4iPjxzcGFuIHN0eWxlPSJkaXNwbGF5OmJsb2NrO2ZvbnQtc2l6ZToxMXB4O2ZvbnQtd2VpZ2h0OjgwMDtjb2xvcjojMDAwO3doaXRlLXNwYWNlOm5vd3JhcDtvdmVyZmxvdzpoaWRkZW47dGV4dC1vdmVyZmxvdzplbGxpcHNpcyI+JytjdXN0TmFtZSsnPC9zcGFuPjwvZGl2Pg=='
  ],
];

const arquivos = [
  'src/pages/CrediarioPage.tsx',
  'src/pages/VendasPage.tsx',
];

for (const path of arquivos) {
  let content = fs.readFileSync(path, 'utf8');
  let changed = 0;
  for (const [oldB64, newB64] of replacements) {
    const oldStr = Buffer.from(oldB64, 'base64').toString('utf8');
    const newStr = Buffer.from(newB64, 'base64').toString('utf8');
    if (content.includes(oldStr)) {
      content = content.split(oldStr).join(newStr);
      changed++;
    } else {
      console.error('AVISO: trecho nao encontrado em ' + path + ' (' + oldStr.slice(0, 40) + ')');
    }
  }
  fs.writeFileSync(path, content, 'utf8');
  console.log(path + ': ' + changed + ' de ' + replacements.length + ' aplicadas');
}