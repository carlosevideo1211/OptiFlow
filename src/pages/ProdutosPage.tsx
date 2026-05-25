import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Plus, Search, Edit2, Package, AlertTriangle,
  Download, Upload, Trash2, Layers, DollarSign, X, Save, CheckCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { formatBRL } from '../types/index';

const CATEGORIAS = ['Armação','Lente Solar','Lente de Grau','Lente de Contato','Acessório','Estojo','Cordão','Solução','Outro'];

interface Product {
  id: string; tenant_id: string; name: string; code?: string;
  category: string; brand?: string; description?: string;
  cost_price: number; sale_price: number; stock: number; min_stock: number; active: boolean;
  created_at: string;
}

function emptyForm() {
  return { name:'', code:'', category:'Armação', brand:'', description:'', cost_price:0, sale_price:0, stock:0, min_stock:5, active:true };
}

export default function ProdutosPage() {
  const { tenantId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState<Product | null>(null);
  const [form, setForm]         = useState(emptyForm());
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').eq('tenant_id', tenantId).order('name');
    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const ativos    = products.filter(p => p.active);
  const totalVal  = ativos.reduce((s,p) => s + p.sale_price * p.stock, 0);
  const criticos  = ativos.filter(p => p.stock > 0 && p.stock <= p.min_stock).length;
  const zerados   = ativos.filter(p => p.stock === 0).length;
  const categorias = [...new Set(products.map(p => p.category))].length;

  const filtered = useMemo(() => {
    let list = products.filter(p => p.active);
    if (catFilter) list = list.filter(p => p.category === catFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s) || p.brand?.toLowerCase().includes(s));
    }
    return list;
  }, [products, search, catFilter]);

  const openNew  = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name:p.name, code:p.code||'', category:p.category, brand:p.brand||'',
              description:p.description||'', cost_price:p.cost_price, sale_price:p.sale_price,
              stock:p.stock, min_stock:p.min_stock, active:p.active });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try {
      const payload = { ...form, tenant_id: tenantId };
      if (editing) {
        const { error } = await supabase.from('products').update(payload).eq('id', editing.id);
        if (error) throw error; toast.success('Produto atualizado!');
      } else {
        const { error } = await supabase.from('products').insert([payload]);
        if (error) throw error; toast.success('Produto cadastrado!');
      }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message||'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm('Excluir produto "'+p.name+'"?')) return;
    await supabase.from('products').update({ active: false }).eq('id', p.id);
    toast.success('Produto removido'); load();
  };

  const exportCSV = () => {
    const wb = XLSX.utils.book_new();
    const dados = [
      ['Nome','Codigo','Categoria','Marca','Preco Custo','Preco Venda','Estoque','Estoque Minimo'],
      ...filtered.map(p => [p.name||'',p.code||'',p.category||'',p.brand||'',p.cost_price,p.sale_price,p.stock,p.min_stock])
    ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [{wch:35},{wch:14},{wch:20},{wch:18},{wch:14},{wch:14},{wch:12},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    XLSX.writeFile(wb, 'produtos.xlsx');
    toast.success('Exportado!');
  };

  const downloadModelo = () => {
    const wb = XLSX.utils.book_new();
    const dados = [
      ['Nome','Codigo','Categoria','Marca','Preco Custo','Preco Venda','Estoque','Estoque Minimo'],
      ['Exemplo Armacao Ray-Ban','RB-001','Armacao','Ray-Ban','150','450','10','3'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [{wch:35},{wch:14},{wch:20},{wch:18},{wch:14},{wch:14},{wch:12},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, 'modelo_produtos.xlsx');
    toast.success('Modelo baixado!');
  };

  const importCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      let ok = 0, fail = 0;
      for (const row of rows.slice(1)) {
        if (!row[0]) continue;
        const { error } = await supabase.from('products').insert([{
          tenant_id: tenantId, name: row[0], code: row[1]||null,
          category: row[2]||'Outro', brand: row[3]||null,
          cost_price: parseFloat(row[4])||0, sale_price: parseFloat(row[5])||0,
          stock: parseInt(row[6])||0, min_stock: parseInt(row[7])||5, active: true
        }]);
        error ? fail++ : ok++;
      }
      toast.success('Importados: '+ok+' | Erros: '+fail); load();
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const zerarEstoque = async () => {
    if (!confirm('Zerar o estoque de TODOS os produtos?')) return;
    await supabase.from('products').update({ stock: 0 }).eq('tenant_id', tenantId);
    toast.success('Estoque zerado!'); load();
  };

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const margem = form.cost_price > 0 ? (((form.sale_price - form.cost_price)/form.cost_price)*100).toFixed(1) : '—';

  const IconBtn = ({ onClick, title, color, children }: any) => (
    <button onClick={onClick} title={title}
      style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)',
        borderRadius:7, padding:'5px 8px', cursor:'pointer', color: color||'var(--text-muted)',
        display:'flex', alignItems:'center', transition:'all .15s' }}
      onMouseEnter={e => (e.currentTarget.style.background='rgba(255,255,255,.12)')}
      onMouseLeave={e => (e.currentTarget.style.background='rgba(255,255,255,.06)')}>
      {children}
    </button>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Package size={22}/> Gestão de Produtos
          </h1>
          <p className="page-sub">Estoque sincronizado com o Supabase Cloud</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={15}/> Exportar</button>
          <button className="btn btn-secondary" onClick={downloadModelo}><Download size={15}/> Modelo</button>
          <label className="btn btn-secondary" style={{ cursor:'pointer' }}>
            <Upload size={15}/> Importar
            <input type="file" accept=".csv,.xlsx" style={{ display:'none' }} onChange={importCSV}/>
          </label>
          <button className="btn btn-secondary" onClick={zerarEstoque} style={{ color:'#f87171' }}>
            <Trash2 size={15}/> Zerar
          </button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Novo Produto</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        {[
          { icon:<Package size={20}/>,      val: ativos.length,       label:'Total de Produtos', color:'#6366f1' },
          { icon:<DollarSign size={20}/>,   val: formatBRL(totalVal), label:'Valor em Estoque',  color:'#22c55e' },
          { icon:<AlertTriangle size={20}/>,val: criticos,            label:'Estoque Crítico',   color:'#f59e0b' },
          { icon:<Layers size={20}/>,       val: categorias,          label:'Categorias',        color:'#06b6d4' },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:18, borderTop:'3px solid '+s.color }}>
            <div style={{ color:s.color, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:typeof s.val==='number'?24:16, fontWeight:700, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Pesquisar por nome, código ou código de barras..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="form-input" style={{ width:180 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Todas as Categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Tabela */}
      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Package size={40}/></div>
          <h3>Nenhum produto cadastrado ainda.</h3>
          <button className="btn btn-primary" onClick={openNew}><Plus size={15}/> Cadastrar primeiro produto</button>
        </div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Produto</th><th>Código</th><th>Categoria</th><th>Preço de Venda</th><th>Estoque</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const zerado  = p.stock === 0;
                  const critico = !zerado && p.stock <= p.min_stock;
                  const mg = p.cost_price > 0 ? (((p.sale_price - p.cost_price)/p.cost_price)*100).toFixed(0) : null;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:'rgba(99,102,241,.15)',
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <Package size={16} style={{ color:'#6366f1' }}/>
                          </div>
                          <div>
                            <div style={{ fontWeight:500 }}>{p.name}</div>
                            {p.brand && <div style={{ fontSize:12, color:'var(--text-muted)' }}>{p.brand}{mg ? ' — '+mg+'% margem' : ''}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize:13, color:'var(--text-muted)' }}>{p.code||'—'}</td>
                      <td><span style={{ fontSize:12, padding:'2px 8px', borderRadius:12, background:'rgba(99,102,241,.15)', color:'#6366f1' }}>{p.category}</span></td>
                      <td style={{ fontWeight:600 }}>{formatBRL(p.sale_price)}</td>
                      <td>
                        <div style={{ fontSize:13 }}>
                          <span style={{ fontWeight:700, color: zerado?'#f87171':critico?'#f59e0b':'var(--text)' }}>{p.stock} un</span>
                          <div style={{ fontSize:11, color:'var(--text-muted)' }}>Min {p.min_stock}</div>
                        </div>
                      </td>
                      <td>
                        {zerado ? (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
                            padding:'3px 10px', borderRadius:20, background:'rgba(248,113,113,.15)', color:'#f87171' }}>
                            <X size={12}/> Zerado
                          </span>
                        ) : critico ? (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
                            padding:'3px 10px', borderRadius:20, background:'rgba(245,158,11,.15)', color:'#f59e0b' }}>
                            <AlertTriangle size={12}/> Crítico
                          </span>
                        ) : (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
                            padding:'3px 10px', borderRadius:20, background:'rgba(34,197,94,.15)', color:'#22c55e' }}>
                            <CheckCircle size={12}/> Normal
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <IconBtn onClick={() => openEdit(p)} title="Editar" color="#6366f1"><Edit2 size={14}/></IconBtn>
                          <IconBtn onClick={() => deleteProduct(p)} title="Excluir" color="#f87171"><Trash2 size={14}/></IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
            <span>{filtered.length} produto(s)</span>
            <span>Valor total: <strong style={{color:'#22c55e'}}>{formatBRL(totalVal)}</strong></span>
          </div>
        </div>
       )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth:560, width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="form-label">Nome *</label>
                    <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} required/>
                  </div>
                  <div>
                    <label className="form-label">Código / Referência</label>
                    <input className="form-input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="Ex: RB-001"/>
                  </div>
                  <div>
                    <label className="form-label">Categoria</label>
                    <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Marca</label>
                    <input className="form-input" value={form.brand} onChange={e => set('brand', e.target.value)}/>
                  </div>
                  <div>
                    <label className="form-label">Preço de Custo (R$)</label>
                    <input className="form-input" type="number" step="0.01" min="0"
                      value={form.cost_price||''} onChange={e => set('cost_price', parseFloat(e.target.value)||0)}/>
                  </div>
                  <div>
                    <label className="form-label">Preço de Venda (R$) *</label>
                    <input className="form-input" type="number" step="0.01" min="0"
                      value={form.sale_price||''} onChange={e => set('sale_price', parseFloat(e.target.value)||0)} required/>
                  </div>
                  {form.cost_price > 0 && form.sale_price > 0 && (
                    <div style={{ gridColumn:'1/-1', padding:'8px 12px', borderRadius:8,
                      background:'rgba(99,102,241,.08)', fontSize:13, color:'#6366f1' }}>
                      Margem de lucro: <strong>{margem}%</strong>
                    </div>
                  )}
                  <div>
                    <label className="form-label">Estoque Inicial</label>
                    <input className="form-input" type="number" min="0"
                      value={form.stock||''} onChange={e => set('stock', parseInt(e.target.value)||0)}/>
                  </div>
                  <div>
                    <label className="form-label">Estoque Mínimo</label>
                    <input className="form-input" type="number" min="0"
                      value={form.min_stock||''} onChange={e => set('min_stock', parseInt(e.target.value)||0)}/>
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="form-label">Descrição</label>
                    <textarea className="form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)}/>
                  </div>
                  <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:8 }}>
                    <input type="checkbox" id="active" checked={form.active} onChange={e => set('active', e.target.checked)}/>
                    <label htmlFor="active" style={{ fontSize:14 }}>Produto ativo</label>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Save size={15}/> {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
