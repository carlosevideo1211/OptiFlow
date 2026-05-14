import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Search, Edit2, Package, AlertTriangle } from 'lucide-react';
import { formatBRL } from '../types/index';
import type { Product } from '../types/index';
import toast from 'react-hot-toast';

const CATEGORIES = ['Armações','Lentes','Óculos Solar','Acessórios','Lentes de Contato','Serviços','Outros'];

const emptyForm = () => ({
  name:'', code:'', category:'Armações', brand:'', description:'',
  cost_price:'', sale_price:'', stock:'', min_stock:'5', active:true
});

export default function ProdutosPage() {
  const { tenantId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').eq('tenant_id', tenantId).order('name');
    setProducts(data as Product[] ?? []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let p = products;
    if (search) p = p.filter(x => x.name.toLowerCase().includes(search.toLowerCase()) || x.code?.includes(search));
    if (catFilter) p = p.filter(x => x.category === catFilter);
    return p;
  }, [products, search, catFilter]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name:p.name, code:p.code||'', category:p.category, brand:p.brand||'', description:p.description||'', cost_price:String(p.cost_price), sale_price:String(p.sale_price), stock:String(p.stock), min_stock:String(p.min_stock||5), active:p.active });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, cost_price:parseFloat(form.cost_price)||0, sale_price:parseFloat(form.sale_price)||0, stock:parseInt(form.stock)||0, min_stock:parseInt(form.min_stock)||5 };
      if (editing) {
        await supabase.from('products').update(payload).eq('id', editing.id);
        toast.success('Produto atualizado!');
      } else {
        await supabase.from('products').insert([{ ...payload, tenant_id: tenantId }]);
        toast.success('Produto cadastrado!');
      }
      setShowModal(false);
      load();
    } catch { toast.error('Erro ao salvar'); } finally { setSaving(false); }
  };

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const lowStock = products.filter(p => p.active && p.stock <= (p.min_stock || 5));

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Produtos</h1><p className="page-sub">{products.length} cadastrados</p></div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo Produto</button>
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom:20 }}>
          <AlertTriangle size={16} style={{ flexShrink:0 }} />
          <span><strong>{lowStock.length} produto(s) com estoque baixo:</strong> {lowStock.map(p => p.name).join(', ')}</span>
        </div>
      )}

      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:200 }}>
          <Search size={15} />
          <input className="form-input" placeholder="Buscar por nome ou código..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width:180 }}>
          <option value="">Todas categorias</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">📦</div><h3>Nenhum produto encontrado</h3><p>Cadastre produtos para usar no PDV e OS</p></div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Produto</th><th>Categoria</th><th>Código</th><th>Custo</th><th>Venda</th><th>Estoque</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight:600 }}>{p.name}</div>
                      {p.brand && <div style={{ fontSize:11, color:'var(--text2)' }}>{p.brand}</div>}
                    </td>
                    <td><span className="badge badge-primary" style={{ fontSize:11 }}>{p.category}</span></td>
                    <td style={{ color:'var(--text2)', fontSize:12 }}>{p.code || '—'}</td>
                    <td style={{ color:'var(--text2)' }}>{formatBRL(p.cost_price)}</td>
                    <td style={{ color:'var(--success)', fontWeight:700 }}>{formatBRL(p.sale_price)}</td>
                    <td>
                      <span style={{ color: p.stock <= (p.min_stock||5) ? 'var(--danger)' : 'var(--text)', fontWeight:600 }}>
                        {p.stock} {p.stock <= (p.min_stock||5) && '⚠️'}
                      </span>
                    </td>
                    <td><span className={`badge ${p.active ? 'badge-success' : 'badge-gray'}`}>{p.active ? 'Ativo' : 'Inativo'}</span></td>
                    <td><button className="btn-icon" onClick={() => openEdit(p)}><Edit2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
       )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editing ? 'Editar Produto' : 'Novo Produto'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Nome *</label><input className="form-input" value={form.name} onChange={e => set('name',e.target.value)} required /></div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Código</label><input className="form-input" value={form.code} onChange={e => set('code',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Marca</label><input className="form-input" value={form.brand} onChange={e => set('brand',e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">Categoria</label>
                  <select className="form-select" value={form.category} onChange={e => set('category',e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Preço de custo</label><input className="form-input" type="number" step="0.01" value={form.cost_price} onChange={e => set('cost_price',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Preço de venda</label><input className="form-input" type="number" step="0.01" value={form.sale_price} onChange={e => set('sale_price',e.target.value)} /></div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Estoque atual</label><input className="form-input" type="number" value={form.stock} onChange={e => set('stock',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Estoque mínimo</label><input className="form-input" type="number" value={form.min_stock} onChange={e => set('min_stock',e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">Descrição</label><textarea className="form-textarea" value={form.description} onChange={e => set('description',e.target.value)} rows={3} /></div>
                <div className="form-group">
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                    <input type="checkbox" checked={form.active} onChange={e => set('active',e.target.checked)} />
                    <span className="form-label" style={{ margin:0 }}>Produto ativo</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar' : 'Cadastrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
