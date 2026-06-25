import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { formatCPF } from '../utils/format';
import toast from 'react-hot-toast';
import {
  Upload, Download, CheckCircle, XCircle, AlertTriangle,
  Users, Eye, FileText, CreditCard, ShoppingBag, RefreshCw
} from 'lucide-react';

type Tab = 'clientes' | 'consultas' | 'vendas' | 'crediario' | 'os' | 'produtos';

interface ImportResult {
  success: number;
  errors: number;
  messages: string[];
}

const TABS = [
  { id: 'clientes',  label: 'Clientes',   icon: '👥', desc: 'Dados cadastrais' },
  { id: 'consultas', label: 'Consultas',  icon: '👁️', desc: 'Histórico de receitas' },
  { id: 'vendas',    label: 'Vendas',     icon: '🛒', desc: 'Histórico de compras' },
  { id: 'crediario', label: 'Crediário',  icon: '💳', desc: 'Histórico de débitos' },

  { id: 'os', label: 'OS', icon: '🛠️', desc: 'Ordens de servico' },
  { id: 'produtos', label: 'Produtos', icon: '📦', desc: 'Estoque' },
];

const MODELS: Record<Tab, { headers: string[]; example: any[] }> = {
  clientes: {
    headers: ['Nome', 'CPF', 'Telefone', 'WhatsApp', 'Email', 'Data_Nascimento', 'Endereco', 'Cidade', 'Estado', 'Observacoes'],
    example: [['João da Silva', '123.456.789-00', '(92) 99999-0000', '(92) 99999-0000', 'joao@email.com', '1985-03-15', 'Rua das Flores, 123', 'Manaus', 'AM', 'Cliente fiel']]
  },
  consultas: {
    headers: ['Nome_Cliente', 'CPF_Cliente', 'Data_Consulta', 'Medico', 'OD_ESF', 'OD_CIL', 'OD_EIXO', 'OE_ESF', 'OE_CIL', 'OE_EIXO', 'ADD', 'DP', 'Observacoes'],
    example: [['João da Silva', '123.456.789-00', '2024-01-15', 'Dr. Carlos', '-2.00', '-0.50', '180', '-1.75', '-0.25', '175', '+2.00', '62', 'Uso contínuo']]
  },
  vendas: {
    headers: ['Nome_Cliente', 'CPF_Cliente', 'Data_Venda', 'Descricao_Produto', 'Quantidade', 'Valor_Unitario', 'Desconto', 'Forma_Pagamento', 'Observacoes'],
    example: [['João da Silva', '123.456.789-00', '2024-02-10', 'Armação Ray-Ban + Lentes', '1', '850.00', '50.00', 'cartao', 'Entregue']]
  },
  crediario: {
    headers: ['Nome_Cliente', 'CPF_Cliente', 'Data_Venda', 'Valor_Total', 'Num_Parcelas', 'Valor_Parcela', 'Data_Vencimento_1a', 'Status', 'Observacoes'],
    example: [['João da Silva', '123.456.789-00', '2024-03-01', '600.00', '3', '200.00', '2024-04-01', 'aberto', 'Crediário loja anterior']]
  },
  os: {
    headers: ['Nome_Cliente', 'CPF_Cliente', 'Status', 'Descricao', 'Valor_Total', 'Desconto', 'Entrada', 'Data_Entrega', 'Medico', 'Observacoes'],
    example: [['Joao da Silva', '123.456.789-00', 'entregue', 'Armacao Ray-Ban + Lentes Transitions', '980.00', '100.00', '180.00', '2024-03-20', 'Dr. Carlos', 'OS loja anterior']]
  },
  produtos: {
    headers: ['Nome', 'Codigo', 'Categoria', 'Marca', 'Descricao', 'Preco_Custo', 'Preco_Venda', 'Estoque', 'Estoque_Minimo'],
    example: [['Armacao Ray-Ban RB5228', 'RB5228', 'Armacao', 'Ray-Ban', 'Armacao acetato preta', '150.00', '350.00', '10', '2']]
  }
};

export default function ImportacaoPage() {
  const { tenantId } = useAuth();
  console.log('TENANT ID NA IMPORTACAO:', tenantId);
  const [tab, setTab] = useState<Tab>('clientes');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadModel = () => {
    const model = MODELS[tab];
    const ws = XLSX.utils.aoa_to_sheet([model.headers, ...model.example]);
    // Estilizar cabeçalho
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, `modelo_importacao_${tab}.xlsx`);
    toast.success('Modelo baixado!');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      if (data.length < 2) { toast.error('Planilha vazia!'); return; }
      setPreview(data.slice(0, 6));
      setShowPreview(true);
      setResult(null);
    };
    reader.readAsBinaryString(file);
  };

  const processImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error('Selecione um arquivo'); return; }
    if (!tenantId) { toast.error('Erro: tenant não identificado. Faça logout e login novamente.'); return; }
    setImporting(true);
    setResult(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws) as any[];
        if (rows.length === 0) { toast.error('Nenhum dado encontrado'); setImporting(false); return; }

        let success = 0, errors = 0;
        const messages: string[] = [];

        if (tab === 'clientes') {
          for (const row of rows) {
            try {
              const nome = String(row['Nome'] || row['nome'] || '').trim();
              // Normalizar CPF - Excel converte para numero, recolocar zeros
              const cpfRaw = String(row['CPF'] || row['cpf'] || '').replace(/[^0-9]/g,'');
              const cpfFmt = cpfRaw.length > 0 ? formatCPF(cpfRaw) : '';
              // Verificar se CPF ja existe para evitar duplicata
              if (cpfFmt && cpfFmt.replace(/0/g,'').length > 0) {
                const { data: existe } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).eq('cpf', cpfFmt).maybeSingle();
                if (existe) { errors++; messages.push('Pulado - CPF ja existe: ' + nome); continue; }
              }
              const { error: insErr } = await supabase.from('customers').insert([{
                tenant_id: tenantId,
                name: nome.trim(),
                cpf: cpfFmt,
                phone: row['Telefone'] || row['telefone'] || '',
                whatsapp: row['WhatsApp'] || row['whatsapp'] || '',
                email: row['Email'] || row['email'] || '',
                birth_date: null,
                address: row['Endereco'] || row['endereço'] || '',
                city: row['Cidade'] || row['cidade'] || '',
                state: row['Estado'] || row['estado'] || '',
                notes: row['Observacoes'] || row['observações'] || '',
                active: true,
              }]);



              success++;
            } catch (e: any) { errors++; messages.push(`Erro em ${row['Nome']}: ${e.message}`); }
          }
        }

        else if (tab === 'consultas') {
          for (const row of rows) {
            try {
              const nomeCliente = row['Nome_Cliente'] || '';
              const cpf = row['CPF_Cliente'] || '';
              // Buscar ou criar cliente
              let customerId = null;
              if (cpf) {
                const { data: cust } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).eq('cpf', cpf).maybeSingle();
                customerId = cust?.id;
              }
              if (!customerId && nomeCliente) {
                const { data: cust } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).ilike('name', nomeCliente.trim()).maybeSingle();
                customerId = cust?.id;
              }
              const { error: consErr } = await supabase.from('consultations').insert([{
                tenant_id: tenantId,
                customer_id: customerId,
                customer_name: (nomeCliente.trim() || cpf || 'Importado'),
                professional_name: row['Medico'] || row['medico'] || 'Importado',
                procedure_type: 'Consulta',
                date: (() => { const d = row['Data_Consulta']; if (!d) return new Date().toISOString().split('T')[0]; const s = String(d).trim(); if (s.includes('/')) { const p = s.split('/'); return p.length===3 ? p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0') : s; } if (typeof d === 'number') { const dt = new Date(Math.round((d-25569)*86400*1000)); return dt.toISOString().split('T')[0]; } return s; })(),
                time: '08:00',
                time_end: '08:30',
                status: 'concluida',
                rx_re_esf: parseFloat(row['OD_ESF']) || null,
                rx_re_cil: parseFloat(row['OD_CIL']) || null,
                rx_re_eixo: parseInt(row['OD_EIXO']) || null,
                rx_re_dnp: parseFloat(row['OD_DNP']) || null,
                rx_le_esf: parseFloat(row['OE_ESF']) || null,
                rx_le_cil: parseFloat(row['OE_CIL']) || null,
                rx_le_eixo: parseInt(row['OE_EIXO']) || null,
                rx_le_dnp: parseFloat(row['OE_DNP']) || null,
                rx_adicao: parseFloat(row['ADD'] || row['Adicao'] || row['adicao']) || null,
                notes: row['Observacoes'] || row['observações'] || null,
              }]);
              console.log("CONS ERR:", consErr, "tenant:", tenantId);
              success++;
            } catch (e: any) { errors++; messages.push(`Erro: ${e.message}`); }
          }
        }

        else if (tab === 'vendas') {
          type VendaGrupo = { nome: string; cpf: string; data: any; pagamento: string; obs: string; itens: {desc:string;qty:number;preco:number;desc_val:number}[] };
          const grupos: VendaGrupo[] = [];
          let grupoAtual: VendaGrupo | null = null;
          for (const row of rows) {
            const nome = String(row['Nome_Cliente'] || '').trim();
            if (nome) {
              grupoAtual = { nome, cpf: String(row['CPF_Cliente'] || '').replace(/[^0-9]/g,''), data: row['Data_Venda'], pagamento: row['Forma_Pagamento'] || 'dinheiro', obs: row['Observacoes'] || 'Importado de sistema anterior', itens: [] };
              grupos.push(grupoAtual);
            } else if (grupoAtual && row['Descricao_Produto']) {
              grupoAtual.itens.push({ desc: String(row['Descricao_Produto']), qty: parseFloat(row['Quantidade'] || 1), preco: parseFloat(row['Valor_Unitario'] || 0), desc_val: Math.abs(parseFloat(row['Desconto'] || 0)) });
            }
          }
          for (const g of grupos) {
            try {
              let customerId = null;
              const cpf = formatCPF(g.cpf);
              if (cpf) {
                const { data: cust } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).eq('cpf', cpf).maybeSingle();
                customerId = cust?.id;
              }
              if (!customerId && g.nome) {
                const { data: cust } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).ilike('name', g.nome).maybeSingle();
                customerId = cust?.id;
              }
              const subtotal = g.itens.reduce((s, it) => s + it.qty * it.preco, 0);
              const descTotal = g.itens.reduce((s, it) => s + it.desc_val, 0);
              const total = Math.max(0, subtotal - descTotal);
              const dateISO = (() => { const d = g.data; if (!d) return new Date().toISOString(); const s = String(d).trim(); if (s.includes('/')) { const p = s.split('/'); return new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0])).toISOString(); } if (typeof d === 'number') { return new Date(Math.round((Number(d)-25569)*86400*1000)).toISOString(); } return new Date(s).toISOString(); })();
              const { data: saleData } = await supabase.from('sales').insert([{
                tenant_id: tenantId, customer_id: customerId, customer_name: g.nome,
                payment_method: g.pagamento, installments: 1, subtotal, discount: descTotal,
                total, status: 'concluida', notes: g.obs, created_at: dateISO,
              }]).select().single();
              if (saleData && g.itens.length > 0) {
                await supabase.from('sale_items').insert(g.itens.map(it => ({
                  sale_id: saleData.id, tenant_id: tenantId,
                  description: it.desc, quantity: it.qty, unit_price: it.preco,
                  total: it.qty * it.preco,
                })));
              }
              success++;
            } catch (e: any) { errors++; messages.push(`Erro: ${e.message}`); }
          }
        }
        else if (tab === 'crediario') {
          const BATCH = 30;
          for (let bi = 0; bi < rows.length; bi++) {
            const row = rows[bi];
            if (bi > 0 && bi % BATCH === 0) { await new Promise(r => setTimeout(r, 2000)); }
            try {
              const nomeCliente = row['Nome_Cliente'] || '';
              let customerId = null;
              const cpf = formatCPF(String(row['CPF_Cliente'] || '').replace(/[^0-9]/g,''));
              if (cpf) {
                const { data: cust } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).eq('cpf', cpf).maybeSingle();
                customerId = cust?.id;
              }
              const totalAmount = parseFloat(row['Valor_Total'] || 0);
              const numParcelas = parseInt(row['Num_Parcelas'] || 1);
              const valorParcela = parseFloat(row['Valor_Parcela'] || totalAmount / numParcelas);
              console.log('crediario cpf:', cpf, 'customerId:', customerId, 'total:', totalAmount, 'parcelas:', numParcelas);
              const { data: credData, error: credErr } = await supabase.from('crediario').insert([{
                tenant_id: tenantId,
                customer_id: customerId,
                customer_name: nomeCliente.trim(),
                total_amount: totalAmount,
                installments: numParcelas,
                status: row['Status'] === 'quitado' ? 'quitado' : 'ativo',
                notes: row['Observacoes'] || 'Importado de sistema anterior',
              }]).select().single();
              console.log('credData:', credData, 'credErr:', credErr);
              if (credErr) throw new Error(credErr.message);
              if (credData) {
                const parcelas = [];
                for (let i = 0; i < numParcelas; i++) {
                  const rawDate = row['Data_Vencimento_1a'];
                  let venc = new Date();
                  if (rawDate) {
                    const s = String(rawDate).trim();
                    if (s.includes('/')) {
                      const p = s.split('/');
                      venc = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
                    } else if (typeof rawDate === 'number') {
                      venc = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
                    } else {
                      venc = new Date(s);
                    }
                  }
                  venc = new Date(venc);
                  venc.setMonth(venc.getMonth() + i);
                  parcelas.push({
                    crediario_id: credData.id,
                    tenant_id: tenantId,
                    installment_number: i + 1,
                    due_date: venc.toISOString().split('T')[0],
                    amount: valorParcela,
                    status: row['Status'] === 'quitado' ? 'pago' : 'pendente',
                  });
                }
                await supabase.from('crediario_parcelas').insert(parcelas);
              }
              success++;
            } catch (e: any) { errors++; messages.push(`Erro: ${e.message}`); }
          }
        }

        else if (tab === 'produtos') {
          for (const row of rows) {
            try {
              const nome = String(row['Nome'] || row['nome'] || '').trim();
              if (!nome) { errors++; messages.push('Produto sem nome ignorado'); continue; }
              const { error: insErr } = await supabase.from('products').insert([{
                tenant_id: tenantId,
                name: nome,
                code: String(row['Codigo'] || row['codigo'] || ''),
                category: row['Categoria'] || row['categoria'] || 'Outros',
                brand: row['Marca'] || row['marca'] || '',
                description: row['Descricao'] || row['descricao'] || '',
                cost_price: parseFloat(row['Preco_Custo'] || row['preco_custo'] || 0) || 0,
                sale_price: parseFloat(row['Preco_Venda'] || row['preco_venda'] || 0) || 0,
                stock: parseInt(row['Estoque'] || row['estoque'] || 0) || 0,
                min_stock: parseInt(row['Estoque_Minimo'] || row['estoque_minimo'] || 5) || 5,
                active: true,
              }]);
              if (insErr) { errors++; messages.push('Erro ao inserir ' + nome + ': ' + insErr.message); continue; }
              success++;
            } catch (e: any) { errors++; messages.push(`Erro: ${e.message}`); }
          }
        }

        else if (tab === 'os') {
          for (const row of rows) {
            try {
              const nomeCliente = String(row['Nome_Cliente'] || '').trim();
              const cpf = formatCPF(String(row['CPF_Cliente'] || '').replace(/[^0-9]/g,''));
              let customerId = null;
              if (cpf) {
                const { data: cust } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).eq('cpf', cpf).maybeSingle();
                customerId = cust?.id;
              }
              if (!customerId && nomeCliente) {
                const { data: cust } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).ilike('name', nomeCliente).maybeSingle();
                customerId = cust?.id;
              }
              const total = parseFloat(row['Valor_Total'] || 0) || 0;
              const discount = parseFloat(row['Desconto'] || 0) || 0;
              const entrada = parseFloat(row['Entrada'] || 0) || 0;
              const rawDate = row['Data_Entrega'];
              let deliveryDate: string | null = null;
              if (rawDate) {
                if (typeof rawDate === 'number') {
                  deliveryDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000)).toISOString().split('T')[0];
                } else {
                  const s = String(rawDate).trim();
                  if (s.includes('/')) {
                    const p = s.split('/');
                    deliveryDate = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0])).toISOString().split('T')[0];
                  } else {
                    deliveryDate = s;
                  }
                }
              }
              const { error: osErr } = await supabase.from('service_orders').insert([{
                tenant_id: tenantId,
                customer_id: customerId,
                customer_name: nomeCliente || cpf || 'Importado',
                medico: row['Medico'] || row['medico'] || null,
                total, discount, entrada,
                status: row['Status'] || row['status'] || 'aprovada',
                delivery_date: deliveryDate,
                notes: row['Descricao'] || row['Observacoes'] || 'Importado de sistema anterior',
                obs_cliente: row['Observacoes'] || null,
              }]);
              if (osErr) { errors++; messages.push('Erro OS ' + nomeCliente + ': ' + osErr.message); continue; }
              success++;
            } catch (e: any) { errors++; messages.push(`Erro: ${e.message}`); }
          }
        }

        setResult({ success, errors, messages });
        if (success > 0) toast.success(`${success} registros importados com sucesso!`);
        if (errors > 0) toast.error(`${errors} registros com erro`);
      } catch (e: any) {
        toast.error('Erro ao processar arquivo: ' + e.message);
      } finally {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
        setShowPreview(false);
        setPreview([]);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Upload size={22} style={{ color: 'var(--primary)' }} /> Importar Dados
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Importe dados do seu sistema anterior usando planilhas Excel
        </p>
      </div>

      {/* Como funciona */}
      <div className="card" style={{ padding: 20, marginBottom: 24, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--primary)' }}>📋 Como importar em 3 passos:</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {['1. Baixe o modelo Excel da aba desejada', '2. Preencha com seus dados (ou cole de outro sistema)', '3. Faça upload e clique em Importar'].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i+1}</div>
              {s.slice(3)}
            </div>
          ))}
        </div>
      </div>


      {/* Instrucoes de vinculo */}
      <div className="card" style={{ padding: 24, marginBottom: 24, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🔗</span> Como os dados são vinculados entre as planilhas
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
          O sistema vincula automaticamente as planilhas pelo <strong style={{ color: 'var(--warning)' }}>CPF</strong> ou <strong style={{ color: 'var(--warning)' }}>Nome</strong> do cliente.
          Importe sempre na ordem abaixo e coloque apenas os clientes que têm aquele tipo de registro.
        </p>
        {/* Ordem de importacao */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { num: '1', label: 'Clientes', desc: 'Todos os clientes', color: '#6366f1', icon: '👥' },
            { num: '2', label: 'Consultas', desc: 'Só quem fez consulta', color: '#06b6d4', icon: '👁️' },
            { num: '3', label: 'Vendas', desc: 'Só quem comprou', color: '#22c55e', icon: '🛒' },
            { num: '4', label: 'Crediário', desc: 'Só quem tem débito', color: '#f59e0b', icon: '💳' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ textAlign: 'center', padding: '10px 16px', background: `rgba(${s.color === '#6366f1' ? '99,102,241' : s.color === '#06b6d4' ? '6,182,212' : s.color === '#22c55e' ? '34,197,94' : '245,158,11'},0.15)`, borderRadius: 10, border: `1px solid ${s.color}40`, minWidth: 110 }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.num}. {s.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.desc}</div>
              </div>
              {i < 3 && <div style={{ fontSize: 20, color: 'var(--text-muted)' }}>→</div>}
            </div>
          ))}
        </div>
        {/* Exemplos */}
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)' }}>📋 Exemplos práticos:</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          {[
            { cliente: 'Maria Silva', situacao: 'Faz consulta e compra', planilhas: ['Clientes ✅', 'Consultas ✅', 'Vendas ✅', 'Crediário ❌'] },
            { cliente: 'João Souza', situacao: 'Só faz consulta', planilhas: ['Clientes ✅', 'Consultas ✅', 'Vendas ❌', 'Crediário ❌'] },
            { cliente: 'Ana Costa', situacao: 'Tem crediário em aberto', planilhas: ['Clientes ✅', 'Consultas ❌', 'Vendas ❌', 'Crediário ✅'] },
            { cliente: 'Pedro Lima', situacao: 'Compra à vista', planilhas: ['Clientes ✅', 'Consultas ❌', 'Vendas ✅', 'Crediário ❌'] },
          ].map((ex, i) => (
            <div key={i} style={{ padding: 12, background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{ex.cliente}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{ex.situacao}</div>
              {ex.planilhas.map((p, j) => (
                <div key={j} style={{ fontSize: 11, color: p.includes('✅') ? '#22c55e' : '#94a3b8', marginBottom: 2 }}>{p}</div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: 12, background: 'rgba(99,102,241,0.1)', borderRadius: 8, fontSize: 13 }}>
          <strong style={{ color: 'var(--primary)' }}>💡 Dica importante:</strong> Use o <strong>CPF</strong> como coluna de vínculo sempre que possível. Se o cliente não tiver CPF, o sistema usa o nome — mas o nome precisa ser <strong>idêntico</strong> em todas as planilhas.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id as Tab); setResult(null); setShowPreview(false); setPreview([]); if(fileRef.current) fileRef.current.value=''; }}
            style={{ padding: '10px 18px', borderRadius: 10, border: '2px solid', borderColor: tab === t.id ? 'var(--primary)' : 'var(--border)', background: tab === t.id ? 'rgba(99,102,241,0.1)' : 'var(--bg2)', color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {t.icon} {t.label}
            <span style={{ fontSize: 11, opacity: 0.7 }}>— {t.desc}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Baixar modelo */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Download size={16} style={{ color: 'var(--primary)' }} /> Modelo de Planilha
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Baixe o modelo Excel com as colunas corretas para importar <strong>{TABS.find(t=>t.id===tab)?.label}</strong>.
          </p>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Colunas incluídas:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {MODELS[tab].headers.map(h => (
                <span key={h} style={{ fontSize: 11, background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', padding: '3px 8px', borderRadius: 6, fontWeight: 500 }}>{h}</span>
              ))}
            </div>
          </div>
          <button onClick={downloadModel} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Download size={16} /> Baixar Modelo Excel
          </button>
        </div>

        {/* Upload */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={16} style={{ color: 'var(--primary)' }} /> Importar Planilha
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            Selecione o arquivo Excel preenchido com os dados para importar.
          </p>
          <div style={{marginBottom:12}}>
            <label onClick={()=>fileRef.current?.click()} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'var(--bg3)',border:'2px dashed var(--border2)',borderRadius:10,cursor:'pointer',transition:'all 0.2s'}}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--primary)')}
              onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border2)')}>
              <Upload size={20} style={{color:'var(--primary)',flexShrink:0}}/>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>
                  {fileRef.current?.files?.[0]?.name || 'Clique para selecionar o arquivo'}
                </div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Excel (.xlsx, .xls) ou CSV</div>
              </div>
            </label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{display:'none'}}/>
          </div>
          {showPreview && preview.length > 0 && (
            <div style={{ marginBottom: 12, padding: 12, background: 'var(--bg3)', borderRadius: 8, overflowX: 'auto' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>👁️ Preview ({preview.length - 1} linhas de dados):</div>
              <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>{(preview[0] || []).map((h: any, i: number) => (
                    <th key={i} style={{ padding: '4px 8px', background: 'rgba(99,102,241,0.2)', color: 'var(--primary)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {preview.slice(1).map((row: any[], i: number) => (
                    <tr key={i}>{row.map((cell, j) => (
                      <td key={j} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button onClick={processImport} disabled={importing || !showPreview}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: showPreview ? '#22c55e' : 'rgba(34,197,94,0.3)', color: 'white', fontWeight: 600, fontSize: 14, cursor: showPreview ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {importing ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Importando...</> : <><CheckCircle size={16} /> Importar Dados</>}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {result && (
        <div className="card" style={{ padding: 24, marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📊 Resultado da Importação</h3>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1, padding: 16, background: 'rgba(34,197,94,0.1)', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#22c55e' }}>{result.success}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Importados com sucesso</div>
            </div>
            <div style={{ flex: 1, padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#ef4444' }}>{result.errors}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Erros</div>
            </div>
          </div>
          {result.messages.length > 0 && (
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, maxHeight: 200, overflowY: 'auto' }}>
              {result.messages.map((m, i) => (
                <div key={i} style={{ fontSize: 12, color: '#f87171', padding: '2px 0' }}>⚠️ {m}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
