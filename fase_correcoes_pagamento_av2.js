const fs = require('fs');
const path = 'src/pages/consulta/AtendimentoPage.tsx';
fs.copyFileSync(path, path + '.backup_fase_correcoes3');
console.log('Backup criado: ' + path + '.backup_fase_correcoes3');

let raw = fs.readFileSync(path, 'utf8');
const usaCRLF = raw.includes('\r\n');
let content = raw.replace(/\r\n/g, '\n'); // normaliza pra LF só durante o patch
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
  "const [partnerships, setPartnerships] = useState<any[]>([]);\n  const [partnershipId, setPartnershipId] = useState('');\n  const [anexos, setAnexos] = useState<any[]>([]);",
  "const [partnerships, setPartnerships] = useState<any[]>([]);\n  const [partnershipId, setPartnershipId] = useState('');\n  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);\n  const [paymentMethod, setPaymentMethod] = useState('');\n  const [anexos, setAnexos] = useState<any[]>([]);",
  "1) states do formulario"
);

ap(
  "if (data.partnership_id) setPartnershipId(data.partnership_id);",
  "if (data.partnership_id) setPartnershipId(data.partnership_id);\n      if (data.payment_method) setPaymentMethod(data.payment_method);",
  "2) carregar payment_method salvo"
);

ap(
  "  useEffect(() => {\n    if (!tenantId) return;\n    supabase.from('partnerships').select('id,name,commission_percent').eq('tenant_id', tenantId).eq('active', true).order('name')\n      .then(({ data }) => setPartnerships(data || []));\n  }, [tenantId]);\n\n",
  "  useEffect(() => {\n    if (!tenantId) return;\n    supabase.from('partnerships').select('id,name,commission_percent').eq('tenant_id', tenantId).eq('active', true).order('name')\n      .then(({ data }) => setPartnerships(data || []));\n  }, [tenantId]);\n\n  useEffect(() => {\n    if (!tenantId) return;\n    supabase.from('clinic_payment_methods').select('id,nome').eq('tenant_id', tenantId).eq('ativo', true).order('nome')\n      .then(({ data }) => setPaymentMethods(data || []));\n  }, [tenantId]);\n\n",
  "3) buscar lista de formas de pagamento"
);

ap(
  "    const entries: any[] = [{\n      tenant_id: tenantId, type: 'receita', category: 'consulta',\n      description: 'Receita de atendimento', amount: valor,\n      due_date: date || null, status: 'pendente',\n      consultation_id: consultationId, partnership_id: partnershipId || null,\n      procedure_id: consultation?.procedure_id || null,\n      professional_id: consultation?.professional_id || null,\n    }];",
  "    const entries: any[] = [{\n      tenant_id: tenantId, type: 'receita', category: 'consulta',\n      description: 'Receita de atendimento', amount: valor,\n      due_date: date || null, status: 'pendente',\n      consultation_id: consultationId, partnership_id: partnershipId || null,\n      payment_method: paymentMethod || null,\n      procedure_id: consultation?.procedure_id || null,\n      professional_id: consultation?.professional_id || null,\n    }];",
  "4) forma de pagamento no lancamento financeiro"
);

ap(
  "    partnership_id: partnershipId || null,\n    valor_cobrado: num(docValorExame),\n  });",
  "    partnership_id: partnershipId || null,\n    payment_method: paymentMethod || null,\n    valor_cobrado: num(docValorExame),\n  });",
  "5) forma de pagamento salva na consulta"
);

ap(
  "                  <Field label=\"Convênio (opcional)\">\n                    <select className=\"form-input\" value={partnershipId} onChange={e => setPartnershipId(e.target.value)}>\n                      <option value=\"\">Particular</option>\n                      {partnerships.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}\n                    </select>\n                  </Field>\n                  <Field label=\"Cidade\">",
  "                  <Field label=\"Convênio (opcional)\">\n                    <select className=\"form-input\" value={partnershipId} onChange={e => setPartnershipId(e.target.value)}>\n                      <option value=\"\">Particular</option>\n                      {partnerships.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}\n                    </select>\n                  </Field>\n                  <Field label=\"Forma de pagamento\">\n                    <select className=\"form-input\" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>\n                      <option value=\"\">Selecione...</option>\n                      {paymentMethods.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}\n                    </select>\n                  </Field>\n                  <Field label=\"Cidade\">",
  "6) dropdown de forma de pagamento na tela"
);

if (usaCRLF) content = content.replace(/\n/g, '\r\n'); // devolve pro formato original
fs.writeFileSync(path, content, 'utf8');
console.log(ok + '/6 aplicadas');