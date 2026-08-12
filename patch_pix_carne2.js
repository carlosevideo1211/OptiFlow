const fs = require('fs');

const oldB64 = 'PGRpdiBpZD0iJytxaSsnIiBkYXRhLXBpeD0iJytwcCsnIiBzdHlsZT0id2lkdGg6OTBweDtoZWlnaHQ6OTBweDttYXJnaW46MnB4IGF1dG8iPjwvZGl2PjxkaXYgc3R5bGU9ImZvbnQtc2l6ZTo4cHg7dGV4dC1hbGlnbjpjZW50ZXI7Y29sb3I6IzMzMztsaW5lLWhlaWdodDoxLjM7cGFkZGluZzowIDRweDttYXJnaW4tdG9wOjJweDt3b3JkLWJyZWFrOmJyZWFrLWFsbCI+UGl4OiA8Yj4nK3NQaXgrJzwvYj48L2Rpdj4=';
const newB64 = 'PGRpdiBpZD0iJytxaSsnIiBkYXRhLXBpeD0iJytwcCsnIiBzdHlsZT0id2lkdGg6NjRweDtoZWlnaHQ6NjRweDttYXJnaW46MnB4IGF1dG8iPjwvZGl2PjxkaXYgc3R5bGU9InRleHQtYWxpZ246Y2VudGVyO21hcmdpbi10b3A6MnB4Ij48c3BhbiBzdHlsZT0iZGlzcGxheTpibG9jaztmb250LXNpemU6OHB4O2NvbG9yOiMxYTNhOGY7Zm9udC13ZWlnaHQ6NzAwO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzowLjVweCI+UGFndWUgcGVsbyBQaXg8L3NwYW4+PHNwYW4gc3R5bGU9ImRpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEycHg7Zm9udC13ZWlnaHQ6ODAwO2NvbG9yOiMwMDA7d29yZC1icmVhazpicmVhay1hbGw7bGluZS1oZWlnaHQ6MS4yO3BhZGRpbmc6MCAycHgiPicrc1BpeCsnPC9zcGFuPjwvZGl2Pg==';

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