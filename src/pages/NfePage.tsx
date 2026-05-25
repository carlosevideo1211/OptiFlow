import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  FileText, Plus, Download, Search, X, Save, Eye,
  CheckCircle, Clock, AlertTriangle, Settings, Package
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatBRL } from '../types/index';

interface FiscalConfig {
  id?: string; tenant_id: string; razao_social: string; cnpj: string;
  inscricao_estadual: string; inscricao_municipal: string; regime_tributario: string;
  endereco: string; numero: string; complemento: string; bairro: string;
  municipio: string; uf: string; cep: string; codigo_municipio: string;
  ambiente: string; serie_nfe: string; ultimo_numero: number;
}

interface Nfe {
  id: string; tenant_id: string; numero: number; serie: string;
  status: string; natureza_operacao: string; data_emissao: string;
  cliente_nome: string; cliente_cpf_cnpj: string; cliente_endereco: string;
  total_produtos: number; total_desconto: number; total_nota: number;
  xml_gerado: string; observacoes: string; created_at: string;
  sale_id?: string;
}

interface NfeItem {
  id?: string; nfe_id?: string; numero_item: number; descricao: string;
  ncm: string; cfop: string; unidade: string; quantidade: number;
  valor_unitario: number; valor_total: number; cst_icms: string;
  cst_pis: string; cst_cofins: string;
}

interface Sale {
  id: string; sale_number: number; customer_name: string; total: number;
  created_at: string; payment_method: string;
}

function emptyConfig(tenantId: string): FiscalConfig {
  return {
    tenant_id: tenantId, razao_social: '', cnpj: '', inscricao_estadual: '',
    inscricao_municipal: '', regime_tributario: '1', endereco: '', numero: '',
    complemento: '', bairro: '', municipio: 'Castanho', uf: 'AM', cep: '',
    codigo_municipio: '1300805', ambiente: '2', serie_nfe: '1', ultimo_numero: 0
  };
}

function emptyItem(): NfeItem {
  return {
    numero_item: 1, descricao: '', ncm: '90049000', cfop: '5102',
    unidade: 'UN', quantidade: 1, valor_unitario: 0, valor_total: 0,
    cst_icms: '400', cst_pis: '07', cst_cofins: '07'
  };
}

const STATUS_NFE: Record<string, { label: string; color: string; bg: string }> = {
  rascunho:   { label: 'Rascunho',   color: '#94a3b8', bg: 'rgba(148,163,184,.15)' },
  gerado:     { label: 'XML Gerado', color: '#f59e0b', bg: 'rgba(245,158,11,.15)'  },
  autorizado: { label: 'Autorizado', color: '#22c55e', bg: 'rgba(34,197,94,.15)'   },
  cancelado:  { label: 'Cancelado',  color: '#f87171', bg: 'rgba(248,113,113,.15)' },
};

const REGIMES = [
  { value: '1', label: 'Simples Nacional' },
  { value: '2', label: 'Simples Nacional — Excesso' },
  { value: '3', label: 'Regime Normal' },
];

export default function NfePage() {
  const { tenantId } = useAuth();
  const [tab, setTab] = useState<'nfes'|'config'>('nfes');
  const [nfes, setNfes] = useState<Nfe[]>([]);
  const [config, setConfig] = useState<FiscalConfig>(emptyConfig(tenantId||''));
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showXml, setShowXml] = useState<Nfe | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Form NF-e
  const [nfeForm, setNfeForm] = useState({
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: new Date().toISOString().split('T')[0],
    cliente_nome: '', cliente_cpf_cnpj: '', cliente_endereco: '',
    observacoes: '', sale_id: ''
  });
  const [itens, setItens] = useState<NfeItem[]>([emptyItem()]);

  const load = async () => {
    setLoading(true);
    const [{ data: n }, { data: fc }, { data: s }] = await Promise.all([
      supabase.from('nfe').select('*').eq('tenant_id', tenantId).order('numero', { ascending: false }),
      supabase.from('fiscal_config').select('*').eq('tenant_id', tenantId).single(),
      supabase.from('sales').select('id,sale_number,customer_name,total,created_at,payment_method').eq('tenant_id', tenantId).eq('status','concluida').order('created_at', { ascending: false }).limit(50),
    ]);
    setNfes((n as Nfe[]) || []);
    if (fc) setConfig(fc as FiscalConfig);
    setSales((s as Sale[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return nfes;
    const s = search.toLowerCase();
    return nfes.filter(n => n.cliente_nome?.toLowerCase().includes(s) || String(n.numero).includes(s));
  }, [nfes, search]);

  const setConf = (k: string, v: string) => setConfig(p => ({...p,[k]:v}));
  const setNf = (k: string, v: string) => setNfeForm(p => ({...p,[k]:v}));

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const { error } = config.id
        ? await supabase.from('fiscal_config').update(config).eq('id', config.id)
        : await supabase.from('fiscal_config').insert([{...config, tenant_id: tenantId}]);
      if (error) throw error;
      toast.success('Configuração fiscal salva!');
      load();
    } catch (err: any) { toast.error(err.message || 'Erro'); }
    finally { setSavingConfig(false); }
  };

  const addItem = () => setItens(p => [...p, { ...emptyItem(), numero_item: p.length + 1 }]);
  const removeItem = (i: number) => setItens(p => p.filter((_,idx) => idx !== i));
  const setItem = (i: number, k: string, v: any) => setItens(p => p.map((item,idx) => {
    if (idx !== i) return item;
    const updated = { ...item, [k]: v };
    if (k === 'quantidade' || k === 'valor_unitario') {
      updated.valor_total = (parseFloat(k === 'quantidade' ? v : updated.quantidade) || 0) *
                            (parseFloat(k === 'valor_unitario' ? v : updated.valor_unitario) || 0);
    }
    return updated;
  }));

  const importarVenda = (saleId: string) => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    setNf('cliente_nome', sale.customer_name);
    setNf('sale_id', saleId);
    setItens([{
      numero_item: 1, descricao: 'Venda #' + String(sale.sale_number).padStart(4,'0') + ' — ' + sale.customer_name,
      ncm: '90049000', cfop: '5102', unidade: 'UN', quantidade: 1,
      valor_unitario: sale.total, valor_total: sale.total,
      cst_icms: '400', cst_pis: '07', cst_cofins: '07'
    }]);
  };

  const totalNota = itens.reduce((s,i) => s + (i.valor_total||0), 0);

  const gerarXML = async () => {
    if (!config.cnpj) { toast.error('Configure os dados fiscais primeiro!'); setTab('config'); return; }
    if (!nfeForm.cliente_nome) { toast.error('Informe o nome do cliente'); return; }
    if (itens.length === 0 || !itens[0].descricao) { toast.error('Adicione pelo menos um item'); return; }

    setSaving(true);
    try {
      const novoNumero = (config.ultimo_numero || 0) + 1;
      const cUF = '13';
      const cNF = String(novoNumero).padStart(8, '0');
      const nNF = String(novoNumero).padStart(9, '0');
      const dhEmi = new Date(nfeForm.data_emissao + 'T12:00:00-04:00').toISOString().replace('.000Z', '-04:00').substring(0, 25);

      const itensXml = itens.map((item, i) => `
    <det nItem="${i+1}">
      <prod>
        <cProd>${String(i+1).padStart(6,'0')}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>${item.descricao}</xProd>
        <NCM>${item.ncm}</NCM>
        <CFOP>${item.cfop}</CFOP>
        <uCom>${item.unidade}</uCom>
        <qCom>${item.quantidade.toFixed(4)}</qCom>
        <vUnCom>${item.valor_unitario.toFixed(10)}</vUnCom>
        <vProd>${item.valor_total.toFixed(2)}</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>${item.unidade}</uTrib>
        <qTrib>${item.quantidade.toFixed(4)}</qTrib>
        <vUnTrib>${item.valor_unitario.toFixed(10)}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <ICMS>
          <ICMS40>
            <orig>0</orig>
            <CST>${item.cst_icms}</CST>
          </ICMS40>
        </ICMS>
        <PIS>
          <PISAliq>
            <CST>${item.cst_pis}</CST>
            <vBC>0.00</vBC>
            <pPIS>0.00</pPIS>
            <vPIS>0.00</vPIS>
          </PISAliq>
        </PIS>
        <COFINS>
          <COFINSAliq>
            <CST>${item.cst_cofins}</CST>
            <vBC>0.00</vBC>
            <pCOFINS>0.00</pCOFINS>
            <vCOFINS>0.00</vCOFINS>
          </COFINSAliq>
        </COFINS>
      </imposto>
    </det>`).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe versao="4.00" Id="NFe${cUF}${nfeForm.data_emissao.replace(/-/g,'').substring(0,6)}${config.cnpj.replace(/\D/g,'')}${config.serie_nfe.padStart(3,'0')}${nNF}1${cNF}0">
      <ide>
        <cUF>${cUF}</cUF>
        <cNF>${cNF}</cNF>
        <natOp>${nfeForm.natureza_operacao}</natOp>
        <mod>55</mod>
        <serie>${config.serie_nfe}</serie>
        <nNF>${novoNumero}</nNF>
        <dhEmi>${dhEmi}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>${config.codigo_municipio}</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>0</cDV>
        <tpAmb>${config.ambiente}</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
        <verProc>OptiFlow 1.0</verProc>
      </ide>
      <emit>
        <CNPJ>${config.cnpj.replace(/\D/g,'')}</CNPJ>
        <xNome>${config.razao_social}</xNome>
        <enderEmit>
          <xLgr>${config.endereco}</xLgr>
          <nro>${config.numero}</nro>
          <xBairro>${config.bairro}</xBairro>
          <cMun>${config.codigo_municipio}</cMun>
          <xMun>${config.municipio}</xMun>
          <UF>${config.uf}</UF>
          <CEP>${config.cep.replace(/\D/g,'')}</CEP>
          <cPais>1058</cPais>
          <xPais>Brasil</xPais>
        </enderEmit>
        <IE>${config.inscricao_estadual.replace(/\D/g,'')}</IE>
        <CRT>${config.regime_tributario}</CRT>
      </emit>
      <dest>
        <CPF>${(nfeForm.cliente_cpf_cnpj||'').replace(/\D/g,'').substring(0,11)||'00000000000'}</CPF>
        <xNome>${nfeForm.cliente_nome}</xNome>
        <indIEDest>9</indIEDest>
      </dest>
      ${itensXml}
      <total>
        <ICMSTot>
          <vBC>0.00</vBC>
          <vICMS>0.00</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>${totalNota.toFixed(2)}</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>0.00</vPIS>
          <vCOFINS>0.00</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>${totalNota.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>9</modFrete>
      </transp>
      <pag>
        <detPag>
          <tPag>01</tPag>
          <vPag>${totalNota.toFixed(2)}</vPag>
        </detPag>
      </pag>
      ${nfeForm.observacoes ? `<infAdic><infCpl>${nfeForm.observacoes}</infCpl></infAdic>` : ''}
    </infNFe>
  </NFe>
</nfeProc>`;

      const { data: nfeData, error } = await supabase.from('nfe').insert([{
        tenant_id: tenantId, numero: novoNumero, serie: config.serie_nfe,
        status: 'gerado', natureza_operacao: nfeForm.natureza_operacao,
        data_emissao: nfeForm.data_emissao, sale_id: nfeForm.sale_id || null,
        cliente_nome: nfeForm.cliente_nome, cliente_cpf_cnpj: nfeForm.cliente_cpf_cnpj,
        cliente_endereco: nfeForm.cliente_endereco,
        total_produtos: totalNota, total_desconto: 0, total_nota: totalNota,
        xml_gerado: xml, observacoes: nfeForm.observacoes,
      }]).select().single();
      if (error) throw error;

      await supabase.from('fiscal_config').update({ ultimo_numero: novoNumero })
        .eq('tenant_id', tenantId);

      toast.success('NF-e #' + novoNumero + ' gerada com sucesso!');
      setShowModal(false);
      setNfeForm({ natureza_operacao:'Venda de mercadoria', data_emissao: new Date().toISOString().split('T')[0], cliente_nome:'', cliente_cpf_cnpj:'', cliente_endereco:'', observacoes:'', sale_id:'' });
      setItens([emptyItem()]);
      load();
      setShowXml(nfeData as Nfe);
    } catch (err: any) { toast.error(err.message || 'Erro ao gerar NF-e'); }
    finally { setSaving(false); }
  };

  const downloadXML = (nfe: Nfe) => {
    const blob = new Blob([nfe.xml_gerado], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `NFe_${String(nfe.numero).padStart(9,'0')}.xml`;
    a.click();
    toast.success('XML baixado!');
  };

  const updateStatus = async (nfe: Nfe, status: string) => {
    await supabase.from('nfe').update({ status }).eq('id', nfe.id);
    toast.success('Status atualizado!'); load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <FileText size={22}/> Nota Fiscal Eletrônica
          </h1>
          <p className="page-sub">Geração de NF-e — Emissão manual com XML para envio à SEFAZ</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={() => setTab('config')}>
            <Settings size={15}/> Configuração Fiscal
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16}/> Nova NF-e
          </button>
        </div>
      </div>

      {/* Alerta ambiente homologação */}
      {config.ambiente === '2' && (
        <div style={{ padding:'10px 16px', borderRadius:8, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)', fontSize:13, color:'#f59e0b', marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
          <AlertTriangle size={16}/> <strong>Ambiente de Homologação</strong> — NF-e geradas não têm valor fiscal. Altere para Produção nas configurações quando estiver pronto.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {[{k:'nfes',l:'📄 NF-e Emitidas'},{k:'config',l:'⚙️ Configuração Fiscal'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer',
              fontSize:14, fontWeight:600,
              color: tab===t.k ? '#6366f1' : 'var(--text-muted)',
              borderBottom: tab===t.k ? '2px solid #6366f1' : '2px solid transparent' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── LISTA NF-e ── */}
      {tab === 'nfes' && (<>
        <div style={{ display:'flex', gap:10, marginBottom:20 }}>
          <div className="search-bar" style={{ flex:1 }}>
            <Search size={15}/>
            <input className="form-input" placeholder="Buscar por cliente ou número..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
          {[
            { label:'Total Emitidas', val: nfes.length, color:'#6366f1' },
            { label:'XML Gerado', val: nfes.filter(n=>n.status==='gerado').length, color:'#f59e0b' },
            { label:'Autorizadas', val: nfes.filter(n=>n.status==='autorizado').length, color:'#22c55e' },
            { label:'Canceladas', val: nfes.filter(n=>n.status==='cancelado').length, color:'#f87171' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:16, borderTop:'3px solid '+s.color }}>
              <div style={{ fontSize:24, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {loading ? <div className="empty-state"><p>Carregando...</p></div> :
         filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><FileText size={40}/></div>
            <h3>Nenhuma NF-e emitida ainda.</h3>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={15}/> Nova NF-e</button>
          </div>
         ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Nº NF-e</th><th>Data</th><th>Cliente</th><th>Total</th><th>Status</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {filtered.map(nfe => {
                    const st = STATUS_NFE[nfe.status] || STATUS_NFE.rascunho;
                    return (
                      <tr key={nfe.id}>
                        <td style={{ fontWeight:700, color:'#6366f1' }}>#{String(nfe.numero).padStart(9,'0')}</td>
                        <td style={{ fontSize:13 }}>{new Date(nfe.data_emissao+'T00:00:00').toLocaleDateString('pt-BR')}</td>
                        <td style={{ fontWeight:500 }}>{nfe.cliente_nome}</td>
                        <td style={{ fontWeight:700, color:'#22c55e' }}>{formatBRL(nfe.total_nota)}</td>
                        <td>
                          <span style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20, background:st.bg, color:st.color }}>
                            {st.label}
                          </span>
                        </td>
                        <td>
                          <div style={{ display:'flex', gap:5 }}>
                            {nfe.xml_gerado && (
                              <button onClick={() => downloadXML(nfe)} title="Baixar XML"
                                style={{ padding:'5px 8px', borderRadius:7, border:'none', cursor:'pointer', background:'rgba(99,102,241,.12)', color:'#6366f1', display:'flex', alignItems:'center' }}>
                                <Download size={14}/>
                              </button>
                            )}
                            <button onClick={() => setShowXml(nfe)} title="Ver XML"
                              style={{ padding:'5px 8px', borderRadius:7, border:'none', cursor:'pointer', background:'rgba(255,255,255,.06)', color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
                              <Eye size={14}/>
                            </button>
                            {nfe.status === 'gerado' && (
                              <button onClick={() => updateStatus(nfe,'autorizado')} title="Marcar como Autorizado"
                                style={{ padding:'5px 8px', borderRadius:7, border:'none', cursor:'pointer', background:'rgba(34,197,94,.12)', color:'#22c55e', display:'flex', alignItems:'center' }}>
                                <CheckCircle size={14}/>
                              </button>
                            )}
                            {nfe.status !== 'cancelado' && (
                              <button onClick={() => updateStatus(nfe,'cancelado')} title="Cancelar"
                                style={{ padding:'5px 8px', borderRadius:7, border:'none', cursor:'pointer', background:'rgba(248,113,113,.12)', color:'#f87171', display:'flex', alignItems:'center' }}>
                                <X size={14}/>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
         )}
      </>)}

      {/* ── CONFIGURAÇÃO FISCAL ── */}
      {tab === 'config' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20 }}>🏢 Dados do Emitente</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div><label className="form-label">Razão Social *</label>
                <input className="form-input" value={config.razao_social} onChange={e=>setConf('razao_social',e.target.value)}/></div>
              <div><label className="form-label">CNPJ *</label>
                <input className="form-input" value={config.cnpj} onChange={e=>setConf('cnpj',e.target.value)} placeholder="00.000.000/0000-00"/></div>
              <div><label className="form-label">Inscrição Estadual</label>
                <input className="form-input" value={config.inscricao_estadual} onChange={e=>setConf('inscricao_estadual',e.target.value)}/></div>
              <div><label className="form-label">Inscrição Municipal</label>
                <input className="form-input" value={config.inscricao_municipal} onChange={e=>setConf('inscricao_municipal',e.target.value)}/></div>
              <div><label className="form-label">Regime Tributário</label>
                <select className="form-input" value={config.regime_tributario} onChange={e=>setConf('regime_tributario',e.target.value)}>
                  {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select></div>
            </div>
          </div>

          <div className="card" style={{ padding:24 }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:20 }}>📍 Endereço e Emissão</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10 }}>
                <div><label className="form-label">Endereço</label>
                  <input className="form-input" value={config.endereco} onChange={e=>setConf('endereco',e.target.value)}/></div>
                <div><label className="form-label">Número</label>
                  <input className="form-input" style={{ width:80 }} value={config.numero} onChange={e=>setConf('numero',e.target.value)}/></div>
              </div>
              <div><label className="form-label">Bairro</label>
                <input className="form-input" value={config.bairro} onChange={e=>setConf('bairro',e.target.value)}/></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 80px', gap:10 }}>
                <div><label className="form-label">Município</label>
                  <input className="form-input" value={config.municipio} onChange={e=>setConf('municipio',e.target.value)}/></div>
                <div><label className="form-label">UF</label>
                  <input className="form-input" value={config.uf} onChange={e=>setConf('uf',e.target.value)}/></div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div><label className="form-label">CEP</label>
                  <input className="form-input" value={config.cep} onChange={e=>setConf('cep',e.target.value)}/></div>
                <div><label className="form-label">Cód. Município IBGE</label>
                  <input className="form-input" value={config.codigo_municipio} onChange={e=>setConf('codigo_municipio',e.target.value)}/></div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div><label className="form-label">Série NF-e</label>
                  <input className="form-input" value={config.serie_nfe} onChange={e=>setConf('serie_nfe',e.target.value)}/></div>
                <div><label className="form-label">Ambiente</label>
                  <select className="form-input" value={config.ambiente} onChange={e=>setConf('ambiente',e.target.value)}>
                    <option value="2">2 — Homologação (Teste)</option>
                    <option value="1">1 — Produção</option>
                  </select></div>
              </div>
            </div>
          </div>

          <div style={{ gridColumn:'1/-1', display:'flex', justifyContent:'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSaveConfig} disabled={savingConfig}>
              <Save size={15}/> {savingConfig ? 'Salvando...' : 'Salvar Configuração Fiscal'}
            </button>
          </div>
        </div>
      )}

      {/* Modal Nova NF-e */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth:700, width:'95%', maxHeight:'90vh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📄 Nova NF-e</h2>
              <button onClick={() => setShowModal(false)}><X size={18}/></button>
            </div>
            <div className="modal-body">
              {/* Importar venda */}
              <div style={{ marginBottom:16, padding:'12px 16px', borderRadius:8, background:'rgba(99,102,241,.08)', border:'1px solid rgba(99,102,241,.2)' }}>
                <label className="form-label">Importar de uma Venda (opcional)</label>
                <select className="form-input" value={nfeForm.sale_id} onChange={e => { setNf('sale_id', e.target.value); if (e.target.value) importarVenda(e.target.value); }}>
                  <option value="">— Selecione uma venda para importar —</option>
                  {sales.map(s => <option key={s.id} value={s.id}>Venda #{String(s.sale_number).padStart(4,'0')} — {s.customer_name} — {formatBRL(s.total)}</option>)}
                </select>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Natureza da Operação</label>
                  <input className="form-input" value={nfeForm.natureza_operacao} onChange={e=>setNf('natureza_operacao',e.target.value)}/>
                </div>
                <div>
                  <label className="form-label">Data de Emissão</label>
                  <input className="form-input" type="date" value={nfeForm.data_emissao} onChange={e=>setNf('data_emissao',e.target.value)}/>
                </div>
                <div>
                  <label className="form-label">CPF/CNPJ do Cliente</label>
                  <input className="form-input" value={nfeForm.cliente_cpf_cnpj} onChange={e=>setNf('cliente_cpf_cnpj',e.target.value)} placeholder="000.000.000-00"/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Nome do Cliente *</label>
                  <input className="form-input" value={nfeForm.cliente_nome} onChange={e=>setNf('cliente_nome',e.target.value)} required/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label className="form-label">Endereço do Cliente</label>
                  <input className="form-input" value={nfeForm.cliente_endereco} onChange={e=>setNf('cliente_endereco',e.target.value)}/>
                </div>
              </div>

              {/* Itens */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <label className="form-label" style={{ margin:0 }}>Itens da NF-e *</label>
                  <button type="button" onClick={addItem}
                    style={{ padding:'4px 12px', borderRadius:6, border:'none', background:'rgba(99,102,241,.15)', color:'#6366f1', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    + Item
                  </button>
                </div>
                {itens.map((item, i) => (
                  <div key={i} style={{ border:'1px solid var(--border)', borderRadius:8, padding:12, marginBottom:8 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 100px auto', gap:8, alignItems:'end' }}>
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>Descrição *</label>
                        <input className="form-input" value={item.descricao} onChange={e=>setItem(i,'descricao',e.target.value)}/>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>Qtde</label>
                        <input className="form-input" type="number" min="1" step="0.01" value={item.quantidade} onChange={e=>setItem(i,'quantidade',parseFloat(e.target.value)||0)}/>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>Val. Unit.</label>
                        <input className="form-input" type="number" min="0" step="0.01" value={item.valor_unitario} onChange={e=>setItem(i,'valor_unitario',parseFloat(e.target.value)||0)}/>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>Total</label>
                        <input className="form-input" readOnly value={item.valor_total.toFixed(2)} style={{ background:'rgba(255,255,255,.04)' }}/>
                      </div>
                      <button type="button" onClick={() => removeItem(i)} disabled={itens.length===1}
                        style={{ padding:'8px', borderRadius:6, border:'none', cursor:'pointer', background:'rgba(248,113,113,.12)', color:'#f87171' }}>
                        <X size={14}/>
                      </button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginTop:8 }}>
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>NCM</label>
                        <input className="form-input" style={{ fontSize:12 }} value={item.ncm} onChange={e=>setItem(i,'ncm',e.target.value)}/>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>CFOP</label>
                        <input className="form-input" style={{ fontSize:12 }} value={item.cfop} onChange={e=>setItem(i,'cfop',e.target.value)}/>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>CST ICMS</label>
                        <input className="form-input" style={{ fontSize:12 }} value={item.cst_icms} onChange={e=>setItem(i,'cst_icms',e.target.value)}/>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize:11 }}>Unidade</label>
                        <input className="form-input" style={{ fontSize:12 }} value={item.unidade} onChange={e=>setItem(i,'unidade',e.target.value)}/>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ textAlign:'right', fontSize:14, fontWeight:700, color:'#22c55e', marginTop:8 }}>
                  Total: {formatBRL(totalNota)}
                </div>
              </div>

              <div>
                <label className="form-label">Informações Adicionais</label>
                <textarea className="form-input" rows={2} value={nfeForm.observacoes} onChange={e=>setNf('observacoes',e.target.value)}/>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={gerarXML} disabled={saving}>
                <FileText size={15}/> {saving ? 'Gerando...' : 'Gerar XML da NF-e'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver XML */}
      {showXml && (
        <div className="modal-overlay" onClick={() => setShowXml(null)}>
          <div className="modal" style={{ maxWidth:800, width:'95%', maxHeight:'90vh' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📄 XML — NF-e #{String(showXml.numero).padStart(9,'0')}</h2>
              <button onClick={() => setShowXml(null)}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <pre style={{ fontSize:11, background:'rgba(0,0,0,.3)', padding:16, borderRadius:8, overflow:'auto', maxHeight:400, whiteSpace:'pre-wrap', wordBreak:'break-all', color:'#22c55e' }}>
                {showXml.xml_gerado}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowXml(null)}>Fechar</button>
              <button className="btn btn-primary" onClick={() => downloadXML(showXml)}>
                <Download size={15}/> Baixar XML
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
