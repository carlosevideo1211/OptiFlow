import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatBRL } from '../types/index';
import { AlertTriangle, TrendingDown, Package } from 'lucide-react';
import type { Product } from '../types/index';
import toast from 'react-hot-toast';

export default function EstoquePage() {
  const { tenantId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'add'|'remove'>('add');

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').eq('tenant_id', tenantId).eq('active', true).order('name');
    setProducts(data as Product[] ?? []);
    setLoading(false);
  };

  const handleAdjust = async (product: Product) => {
    const qty = parseInt(adjustQty);
    if (!qty || qty <= 0) return;
    const newStock = adjustType === 'add' ? product.stock + qty : Math.max(0, product.stock - qty);
    await supabase.from('products').update({ stock: newStock }).eq('id', product.id);
    toast.success(`Estoque de "${product.name}" atualizado!`);
    setAdjusting(null);
    setAdjustQty('');
    load();
  };

  const lowStock = products.filter(p => p.stock <= (p.min_stock || 5));
  const totalValue = products.reduce((s, p) => s + (p.stock * p.cost_price), 0);

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Estoque</h1><p className="page-sub">{products.length} produtos ativos</p></div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
        <div className="stat-card primary"><div className="stat-label"><Package size={13} style={{ display:'inline', marginRight:4 }} />Total de produtos</div><div className="stat-value">{products.length}</div></div>
        <div className="stat-card danger"><div className="stat-label"><AlertTriangle size={13} style={{ display:'inline', marginRight:4 }} />Estoque baixo</div><div className="stat-value">{lowStock.length}</div></div>
        <div className="stat-card success"><div className="stat-label"><TrendingDown size={13} style={{ display:'inline', marginRight:4 }} />Valor em estoque</div><div className="stat-value" style={{ fontSize:18 }}>{formatBRL(totalValue)}</div></div>
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom:20 }}>
          <AlertTriangle size={16} style={{ flexShrink:0 }} />
          <span><strong>Produtos com estoque baixo:</strong> {lowStock.map(p => `${p.name} (${p.stock})`).join(', ')}</span>
        </div>
      )}

      {loading ? <div className="empty-state"><p>Carregando...</p></div> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th>Valor unit.</th><th>Valor total</th><th>Ajuste</th></tr></thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong>{p.brand && <div style={{ fontSize:11, color:'var(--text2)' }}>{p.brand}</div>}</td>
                    <td><span className="badge badge-primary" style={{ fontSize:11 }}>{p.category}</span></td>
                    <td><span style={{ fontWeight:700, color: p.stock <= (p.min_stock||5) ? 'var(--danger)' : 'var(--success)' }}>{p.stock} {p.stock <= (p.min_stock||5) && '⚠️'}</span></td>
                    <td style={{ color:'var(--text2)' }}>{p.min_stock || 5}</td>
                    <td style={{ color:'var(--text2)' }}>{formatBRL(p.cost_price)}</td>
                    <td style={{ fontWeight:600 }}>{formatBRL(p.stock * p.cost_price)}</td>
                    <td>
                      {adjusting === p.id ? (
                        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                          <select className="form-select" value={adjustType} onChange={e => setAdjustType(e.target.value as any)} style={{ width:80, padding:'5px 8px', fontSize:12 }}>
                            <option value="add">+ Entrada</option>
                            <option value="remove">- Saída</option>
                          </select>
                          <input className="form-input" type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} style={{ width:60, padding:'5px 8px' }} placeholder="Qtd" />
                          <button className="btn btn-success btn-sm" onClick={() => handleAdjust(p)}>OK</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setAdjusting(null)}>✕</button>
                        </div>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => { setAdjusting(p.id); setAdjustQty(''); }}>Ajustar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
