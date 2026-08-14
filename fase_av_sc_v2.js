const fs = require('fs');
const path = 'src/pages/consulta/FichaPaciente.tsx';
fs.copyFileSync(path, path + '.backup_fase_av_sc');
console.log('Backup criado: ' + path + '.backup_fase_av_sc');

let raw = fs.readFileSync(path, 'utf8');
const usaCRLF = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n');
let ok = 0;

function ap(oldStr, newStr, label) {
  if (content.includes(oldStr)) {
    content = content.split(oldStr).join(newStr);
    ok++;
    console.log('OK: ' + label);
  } else {
    console.error('AVISO - nao encontrado: ' + label);
  }
}

ap(
  "  ppc_or?: string; ppc_luz?: string; ppc_fv?: string;\n  ampl_od?: string; ampl_oe?: string;\n}",
  "  ppc_or?: string; ppc_luz?: string; ppc_fv?: string;\n  ampl_od?: string; ampl_oe?: string;\n  av_sc_od_vl?: string; av_sc_oe_vl?: string;\n}",
  "1) campo av_sc na interface Consultation"
);

ap(
  "'id,date,professional_name,status,rx_re_esf,rx_re_cil,rx_re_eixo,rx_re_av,rx_le_esf,rx_le_cil,rx_le_eixo,rx_le_av,rx_tipo_lente,ultimo_exame_data,ppc_or,ppc_luz,ppc_fv,ampl_od,ampl_oe'",
  "'id,date,professional_name,status,rx_re_esf,rx_re_cil,rx_re_eixo,rx_re_av,rx_le_esf,rx_le_cil,rx_le_eixo,rx_le_av,rx_tipo_lente,ultimo_exame_data,ppc_or,ppc_luz,ppc_fv,ampl_od,ampl_oe,av_sc_od_vl,av_sc_oe_vl'",
  "2) av_sc na query select"
);

ap(
  "            const detalhes: string[] = [];\n            if (ppcValor) detalhes.push(`PPC: ${ppcValor}cm`);",
  "            const detalhes: string[] = [];\n            if (c.av_sc_od_vl || c.av_sc_oe_vl) detalhes.push(`AV S/C: ${c.av_sc_od_vl ? `OD ${c.av_sc_od_vl}` : ''}${c.av_sc_od_vl && c.av_sc_oe_vl ? ' / ' : ''}${c.av_sc_oe_vl ? `OE ${c.av_sc_oe_vl}` : ''}`);\n            if (ppcValor) detalhes.push(`PPC: ${ppcValor}cm`);",
  "3) av_sc na linha de detalhes exibida"
);

if (usaCRLF) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(path, content, 'utf8');
console.log(ok + '/3 aplicadas');