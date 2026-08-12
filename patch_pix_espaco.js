const fs = require('fs');

const replacements = [
  ['LnNyMntib3JkZXI6MXB4IHNvbGlkICNiYmI7cGFkZGluZzo0cHggNnB4O21pbi1oZWlnaHQ6MzJweH0=', 'LnNyMntib3JkZXI6MXB4IHNvbGlkICNiYmI7cGFkZGluZzoycHggNnB4O21pbi1oZWlnaHQ6MjJweH0='],
  ['LnMye2Rpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2Vlbjtib3JkZXItYm90dG9tOjJweCBzb2xpZCAjMWEzYThmO3BhZGRpbmctYm90dG9tOjRweDttYXJnaW4tYm90dG9tOjNweH0=', 'LnMye2Rpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2Vlbjtib3JkZXItYm90dG9tOjJweCBzb2xpZCAjMWEzYThmO3BhZGRpbmctYm90dG9tOjJweDttYXJnaW4tYm90dG9tOjJweH0='],
  ['LnN0e2ZsZXg6Mztib3JkZXI6MXB4IHNvbGlkICM0NDQ7cGFkZGluZzo2cHggOHB4O2JhY2tncm91bmQ6I2ZhZmFmYTtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDozcHh9', 'LnN0e2ZsZXg6Mztib3JkZXI6MXB4IHNvbGlkICM0NDQ7cGFkZGluZzo0cHggOHB4O2JhY2tncm91bmQ6I2ZhZmFmYTtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2dhcDoycHh9'],
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