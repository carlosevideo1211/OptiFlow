const fs = require('fs');

const oldB64 = 'PGRpdiBpZD0iJytxaSsnIiBkYXRhLXBpeD0iJytwcCsnIiBzdHlsZT0id2lkdGg6OTBweDtoZWlnaHQ6OTBweDttYXJnaW46MnB4IGF1dG8iPjwvZGl2Pg==';
const newB64 = 'PGRpdiBpZD0iJytxaSsnIiBkYXRhLXBpeD0iJytwcCsnIiBzdHlsZT0id2lkdGg6OTBweDtoZWlnaHQ6OTBweDttYXJnaW46MnB4IGF1dG8iPjwvZGl2PjxkaXYgc3R5bGU9ImZvbnQtc2l6ZTo4cHg7dGV4dC1hbGlnbjpjZW50ZXI7Y29sb3I6IzMzMztsaW5lLWhlaWdodDoxLjM7cGFkZGluZzowIDRweDttYXJnaW4tdG9wOjJweDt3b3JkLWJyZWFrOmJyZWFrLWFsbCI+UGl4OiA8Yj4nK3NQaXgrJzwvYj48L2Rpdj4=';

const oldStr = Buffer.from(oldB64, 'base64').toString('utf8');
const newStr = Buffer.from(newB64, 'base64').toString('utf8');

const arquivos = [
  'src/pages/CrediarioPage.tsx',
  'src/pages/VendasPage.tsx',
];

for (const path of arquivos) {
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes(oldStr)) {
    content = content.split(oldStr).join(newStr);
    fs.writeFileSync(path, content, 'utf8');
    console.log('OK: ' + path);
  } else {
    console.error('AVISO: trecho nao encontrado em ' + path);
  }
}