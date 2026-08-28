// Baixa uma lista de objetos como arquivo CSV (Excel abre direto, com
// acentuação certa). Usado nos relatórios/extratos que precisam de
// "Exportar CSV" (mesmo recurso que o sistema anterior da Samara,
// OptoVision, oferece em todos os relatórios).
export function exportarCSV(nomeArquivo: string, colunas: { chave: string; titulo: string }[], linhas: any[]) {
  const cab = colunas.map(c => `"${c.titulo}"`).join(';');
  const corpo = linhas.map(l => colunas.map(c => `"${String(l[c.chave] ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const csv = '﻿' + cab + '\n' + corpo; // BOM: acentos abrem certo no Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo; a.click();
  URL.revokeObjectURL(url);
}
