import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BookUser, Plus, Search, Edit2, Trash2, X, Save, Users, Package } from 'lucide-react';
import toast from 'react-hot-toast';

interface Supplier {
  id: string; tenant_id: string; name: string; cnpj?: string; category: string;
  email?: string; phone?: string; address?: string; city?: string; state?: string;
  notes?: string; active: boolean; created_at: string;
}

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const CATS = ['Lentes','Armações','Laboratório','Acessórios','Equipamentos','Serviços','Outros'];

function emptyForm() {
  return { name:'', cnpj:'', category:'Outros', email:'', phone:'', address:'', city:'', state:'', notes:'', active:true };
}

export default function CadastrosPage() {
  const { tenantId } = useAuth();
  const [tab, setTab]             = useState<'fornecedores'|'funcionarios'>('fornecedores');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<Supplier | null>(null);
  const [form, setForm]           = useState(emptyForm());
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*')
      .eq('tenant_id', tenantId).order('name');
    setSuppliers((data as Supplier[]) || []);
    setLoading(false);
  };

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const s = search.toLowerCase();
    return suppliers.filter(f => f.name.toLowerCase().includes(s) || f.category.toLowerCase().includes(s) || f.city?.toLowerCase().includes(s));
  }, [suppliers, search]);

  const openNew  = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name:s.name, cnpj:s.cnpj||'', category:s.category, email:s.email||'',
      phone:s.phone||'', address:s.address||'', city:s.city||'', state:s.state||'',
      notes:s.notes||'', active:s.active });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try {
      const payload = { ...form, tenant_id: tenantId };
      if (editing) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id);
        if (error) throw error; toast.success('Fornecedor atualizado!');
      } else {
        const { error } = await supabase.from('suppliers').insert([payload]);
        if (error) throw error; toast.success('Fornecedor cadastrado!');
      }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.message||'Erro'); }
    finally { setSaving(false); }
  };

  const deleteSupplier = async (s: Supplier) => {
    if (!confirm('Excluir "'+s.name+'"?')) return;
    await supabase.from('suppliers').update({ active: false }).eq('id', s.id);
    toast.success('Removido'); load();
  };

  const set = (k: string, v: any) => setForm(p => ({...p,[k]:v}));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <BookUser size={22}/> Cadastros
          </h1>
          <p className="page-sub">Fornecedores e funcionários</p>
        </div>
        {tab === 'fornecedores' && (
          <button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Novo Fornecedor</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--border)' }}>
        {[{k:'fornecedores',l:'🏭 Fornecedores'},{k:'funcionarios',l:'👥 Funcionários'}].map(t => (
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            style={{ padding:'10px 20px', background:'none', border:'none', cursor:'pointer',
              fontSize:14, fontWeight:600,
              color: tab===t.k ? '#6366f1' : 'var(--text-muted)',
              borderBottom: tab===t.k ? '2px solid #6366f1' : '2px solid transparent' }}>
            {t.l}
          </button>
        ))}
      </div>

      {/* ── FORNECEDORES ── */}
      {tab === 'fornecedores' && (<>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
          {[
            { val: suppliers.filter(s=>s.active).length, label:'Total Fornecedores', color:'#6366f1' },
            { val: [...new Set(suppliers.map(s=>s.category))].length, label:'Categorias', color:'#06b6d4' },
            { val: suppliers.filter(s=>s.city).length, label:'Com Endereço', color:'#22c55e' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
              <div style={{ fontSize:28, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="search-bar" style={{ marginBottom:16 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Pesquisar fornecedor..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        {loading ? <div className="empty-state"><p>Carregando...</p></div> :
         filtered.filter(s=>s.active).length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Package size={40}/></div>
            <h3>Nenhum fornecedor cadastrado.</h3>
            <button className="btn btn-primary" onClick={openNew}><Plus size={15}/> Cadastrar fornecedor</button>
          </div>
         ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fornecedor</th><th>Categoria</th><th>Telefone</th><th>Cidade</th><th>Ações</th></tr></thead>
                <tbody>
                  {filtered.filter(s=>s.active).map(s => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:8, flexShrink:0,
                            background:'rgba(99,102,241,.15)', display:'flex',
                            alignItems:'center', justifyContent:'center',
                            fontSize:13, fontWeight:700, color:'#6366f1' }}>
                            {s.name.slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight:500 }}>{s.name}</div>
                            {s.email && <div style={{ fontSize:12, color:'var(--text-muted)' }}>{s.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td><span style={{ fontSize:12, padding:'2px 8px', borderRadius:12, background:'rgba(99,102,241,.15)', color:'#6366f1' }}>{s.category}</span></td>
                      <td style={{ fontSize:13 }}>{s.phone||'—'}</td>
                      <td style={{ fontSize:13 }}>{s.city ? s.city+'/'+s.state : '—'}</td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={()=>openEdit(s)} style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#6366f1', display:'flex', alignItems:'center' }}><Edit2 size={14}/></button>
                          <button onClick={()=>deleteSupplier(s)} style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
         )}
      </>)}

      {/* ── FUNCIONÁRIOS ── */}
      {tab === 'funcionarios' && (
        <div className="empty-state">
          <div className="empty-icon"><Users size={40}/></div>
          <h3>Módulo de Funcionários</h3>
          <p>Cadastro de funcionários e controle de acesso — em breve.</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={()=>setShowModal(false)}>
          <div className="modal" style={{ maxWidth:560, width:'95%' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing?'Editar Fornecedor':'Novo Fornecedor'}</h2>
              <button onClick={()=>setShowModal(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div style={{ gridColumn:'1/-1' }}><label className="form-label">Nome *</label><input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} required/></div>
                  <div><label className="form-label">CNPJ</label><input className="form-input" value={form.cnpj} onChange={e=>set('cnpj',e.target.value)} placeholder="00.000.000/0000-00"/></div>
                  <div><label className="form-label">Categoria</label>
                    <select className="form-input" value={form.category} onChange={e=>set('category',e.target.value)}>
                      {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className="form-label">Telefone</label><input className="form-input" value={form.phone} onChange={e=>set('phone',e.target.value)}/></div>
                  <div><label className="form-label">E-mail</label><input className="form-input" value={form.email} onChange={e=>set('email',e.target.value)}/></div>
                  <div style={{ gridColumn:'1/-1' }}><label className="form-label">Endereço</label><input className="form-input" value={form.address} onChange={e=>set('address',e.target.value)}/></div>
                  <div><label className="form-label">Cidade</label><input className="form-input" value={form.city} onChange={e=>set('city',e.target.value)}/></div>
                  <div><label className="form-label">Estado</label>
                    <select className="form-input" value={form.state} onChange={e=>set('state',e.target.value)}>
                      <option value="">Selecione...</option>
                      {ESTADOS.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn:'1/-1' }}><label className="form-label">Observações</label><textarea className="form-input" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)}/></div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={()=>setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}><Save size={15}/> {saving?'Salvando...':'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
