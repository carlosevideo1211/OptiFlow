const fs = require('fs');

function patch(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  let ok = 0;
  for (const [oldStr, newStr] of replacements) {
    if (content.includes(oldStr)) {
      content = content.split(oldStr).join(newStr);
      ok++;
    } else {
      console.error('AVISO: trecho nao encontrado em ' + path);
      console.error(JSON.stringify(oldStr.slice(0, 80)));
    }
  }
  fs.writeFileSync(path, content, 'utf8');
  console.log(path + ': ' + ok + '/' + replacements.length + ' aplicadas');
}

// ── 1) FichaPaciente.tsx: corrige colunas erradas + adiciona AV ──
patch('src/pages/consulta/FichaPaciente.tsx', [
  [
    "re_esf_longe?: number; re_cil_longe?: number; re_eixo_longe?: number;\n  le_esf_longe?: number; le_cil_longe?: number; le_eixo_longe?: number;",
    "rx_re_esf?: number; rx_re_cil?: number; rx_re_eixo?: number; rx_re_av?: string;\n  rx_le_esf?: number; rx_le_cil?: number; rx_le_eixo?: number; rx_le_av?: string;"
  ],
  [
    "'id,date,professional_name,status,re_esf_longe,re_cil_longe,re_eixo_longe,le_esf_longe,le_cil_longe,le_eixo_longe,ult_lente'",
    "'id,date,professional_name,status,rx_re_esf,rx_re_cil,rx_re_eixo,rx_re_av,rx_le_esf,rx_le_cil,rx_le_eixo,rx_le_av,ult_lente'"
  ],
  [
    "OD: {fmtRxOlho(c.re_esf_longe, c.re_cil_longe, c.re_eixo_longe)} / OE: {fmtRxOlho(c.le_esf_longe, c.le_cil_longe, c.le_eixo_longe)}",
    "OD: {fmtRxOlho(c.rx_re_esf, c.rx_re_cil, c.rx_re_eixo)}{c.rx_re_av ? ` AV ${c.rx_re_av}` : ''} / OE: {fmtRxOlho(c.rx_le_esf, c.rx_le_cil, c.rx_le_eixo)}{c.rx_le_av ? ` AV ${c.rx_le_av}` : ''}"
  ],
]);

// ── 2) AtendimentoPage.tsx: aumenta a caixa "Observações Gerais" ──
patch('src/pages/consulta/AtendimentoPage.tsx', [
  [
    '<Field label="Observações Gerais"><FTextarea value={anamneseObs} onChange={setAnamneseObs} rows={3} /></Field>',
    '<Field label="Observações Gerais"><FTextarea value={anamneseObs} onChange={setAnamneseObs} rows={6} /></Field>'
  ],
]);