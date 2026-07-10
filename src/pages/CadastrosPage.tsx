import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BookUser, Plus, Search, Edit2, Trash2, X, Save, Users, Package, Stethoscope, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { norm } from '../utils/normalize';

async function hashPassword(password: string): Promise<string> {
  if (!password) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface Supplier {
  id: string; tenant_id: string; name: string; cnpj?: string; category: string;
  email?: string; phone?: string; address?: string; city?: string; state?: string;
  notes?: string; active: boolean; created_at: string;
}
interface Professional {
  id: string; tenant_id: string; name: string; cro?: string;
  specialty?: string; phone?: string; email?: string; active: boolean; created_at: string;
}
interface Funcionario {
  id: string; tenant_id: string; name: string; cargo?: string;
  cpf?: string; phone?: string; email?: string; access_password?: string; comissao?: number; active: boolean; created_at: string;
}

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const CATS = ['Lentes','Armações','Laboratório','Acessórios','Equipamentos','Serviços','Outros'];
const ESPECIALIDADES = ['Optometria','Oftalmologia','Optometrista','Oftalmologista','Outro'];
const CARGOS = ['Vendedor(a)','Gerente','Caixa','Recepcionista','Atendente','Estoquista','Outro'];

function emptyForm() {
  return { name:'', cnpj:'', category:'Outros', email:'', phone:'', address:'', city:'', state:'', notes:'', active:true };
}
function emptyProfForm() {
  return { name:'', cro:'', specialty:'Optometria', phone:'', email:'' };
}
function emptyFuncForm() {
  return { name:'', cargo:'Vendedor(a)', cpf:'', phone:'', email:'', access_password:'', comissao:0 };
}

export default function CadastrosPage() {
  const { tenantId } = useAuth();
  const [tab, setTab] = useState<'fornecedores'|'profissionais'|'funcionarios'>('fornecedores');

  // Fornecedores
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  // Profissionais
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loadingProf, setLoadingProf] = useState(false);
  const [searchProf, setSearchProf] = useState('');
  const [showProfModal, setShowProfModal] = useState(false);
  const [editingProf, setEditingProf] = useState<Professional | null>(null);
  const [profForm, setProfForm] = useState(emptyProfForm());
  const [savingProf, setSavingProf] = useState(false);

  // Funcionários
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loadingFunc, setLoadingFunc] = useState(false);
  const [searchFunc, setSearchFunc] = useState('');
  const [showFuncModal, setShowFuncModal] = useState(false);
  const [editingFunc, setEditingFunc] = useState<Funcionario | null>(null);
  const [funcForm, setFuncForm] = useState(emptyFuncForm());
  const [savingFunc, setSavingFunc] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').eq('tenant_id', tenantId).order('name');
    setSuppliers((data as Supplier[]) || []);
    setLoading(false);
  };
  const loadProfessionals = async () => {
    setLoadingProf(true);
    const { data } = await supabase.from('professionals').select('*').eq('tenant_id', tenantId).order('name');
    setProfessionals((data as Professional[]) || []);
    setLoadingProf(false);
  };
  const loadFuncionarios = async () => {
    setLoadingFunc(true);
    const { data } = await supabase.from('funcionarios').select('*').eq('tenant_id', tenantId).order('name');
    setFuncionarios((data as Funcionario[]) || []);
    setLoadingFunc(false);
  };

  useEffect(() => { if (tenantId) { load(); loadProfessionals(); loadFuncionarios(); } }, [tenantId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const s = norm(search);
    return suppliers.filter(f => norm(f.name).includes(s) || norm(f.category).includes(s));
  }, [suppliers, search]);

  const filteredProf = useMemo(() => {
    if (!searchProf.trim()) return professionals.filter(p => p.active);
    const s = norm(searchProf);
    return professionals.filter(p => p.active && (norm(p.name).includes(s) || norm(p.specialty).includes(s)));
  }, [professionals, searchProf]);

  const filteredFunc = useMemo(() => {
    if (!searchFunc.trim()) return funcionarios.filter(f => f.active);
    const s = norm(searchFunc);
    return funcionarios.filter(f => f.active && (norm(f.name).includes(s) || norm(f.cargo).includes(s)));
  }, [funcionarios, searchFunc]);

  // ── Fornecedores ──
  const openNew = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name:s.name, cnpj:s.cnpj||'', category:s.category, email:s.email||'',
      phone:s.phone||'', address:s.address||'', city:s.city||'', state:s.state||'',
      notes:s.notes||'', active:s.active });
    setShowModal(true);
  };
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
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

  // ── Profissionais ──
  const openNewProf = () => { setEditingProf(null); setProfForm(emptyProfForm()); setShowProfModal(true); };
  const openEditProf = (p: Professional) => {
    setEditingProf(p);
    setProfForm({ name:p.name, cro:p.cro||'', specialty:p.specialty||'Optometria', phone:p.phone||'', email:p.email||'' });
    setShowProfModal(true);
  };
  const handleSaveProf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProf) return;
      if (!profForm.name.trim()) { toast.error('Nome obrigatório'); return; }
    setSavingProf(true);
    try {
      const payload = { ...profForm, tenant_id: tenantId, active: true };
      if (editingProf) {
        const { error } = await supabase.from('professionals').update(payload).eq('id', editingProf.id);
        if (error) throw error; toast.success('Profissional atualizado!');
      } else {
        const { error } = await supabase.from('professionals').insert([payload]);
        if (error) throw error; toast.success('Profissional cadastrado!');
      }
      setShowProfModal(false); loadProfessionals();
    } catch (err: any) { toast.error(err.message||'Erro'); }
    finally { setSavingProf(false); }
  };
  const deleteProf = async (p: Professional) => {
    if (!confirm('Excluir "'+p.name+'"?')) return;
    await supabase.from('professionals').update({ active: false }).eq('id', p.id);
    toast.success('Removido'); loadProfessionals();
  };

  // ── Funcionários ──
  const openNewFunc = () => { setEditingFunc(null); setFuncForm(emptyFuncForm()); setShowFuncModal(true); };
  const openEditFunc = (f: Funcionario) => {
    setEditingFunc(f);
    setFuncForm({ name:f.name, cargo:f.cargo||'Vendedor(a)', cpf:f.cpf||'', phone:f.phone||'', email:f.email||'', access_password:f.access_password||'', comissao:f.comissao||0 });
    setShowFuncModal(true);
  };
  const handleSaveFunc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingFunc) return;
      if (!funcForm.name.trim()) { toast.error('Nome obrigatório'); return; }
    setSavingFunc(true);
    try {
      const payload = { name: funcForm.name, cargo: funcForm.cargo, cpf: funcForm.cpf, phone: funcForm.phone, email: funcForm.email, access_password: funcForm.access_password, tenant_id: tenantId, active: true };
      if (editingFunc) {
        const { error } = await supabase.from('funcionarios').update(payload).eq('id', editingFunc.id);
        if (error) throw error; toast.success('Funcionário atualizado!');
      } else {
        const { error } = await supabase.from('funcionarios').insert([payload]);
        if (error) throw error; toast.success('Funcionário cadastrado!');
      }
      setShowFuncModal(false); loadFuncionarios();
    } catch (err: any) { toast.error(err.message||'Erro'); }
    finally { setSavingFunc(false); }
  };
  const deleteFunc = async (f: Funcionario) => {
    if (!confirm('Excluir "'+f.name+'"?')) return;
    await supabase.from('funcionarios').update({ active: false }).eq('id', f.id);
    toast.success('Removido'); loadFuncionarios();
  };

  const set = (k: string, v: any) => setForm(p => ({...p,[k]:v}));
  const setP = (k: string, v: any) => setProfForm(p => ({...p,[k]:v}));
  const setF = (k: string, v: any) => setFuncForm(p => ({...p,[k]:v}));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <BookUser size={22}/> Cadastros
          </h1>
          <p className="page-sub">Fornecedores, profissionais e funcionários</p>
        </div>
        {tab === 'fornecedores' && (
          <button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Novo Fornecedor</button>
        )}
        {tab === 'profissionais' && (
          <button className="btn btn-primary" onClick={openNewProf}><Plus size={16}/> Novo Profissional</button>
        )}
        {tab === 'funcionarios' && (
          <button className="btn btn-primary" onClick={openNewFunc}><Plus size={16}/> Novo Funcionário</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--border)' }}>
        {[
          {k:'fornecedores', l:'🏭 Fornecedores'},
          {k:'profissionais', l:'👨‍⚕️ Profissionais'},
          {k:'funcionarios', l:'👔 Funcionários'},
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
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
                          <div style={{ width:34, height:34, borderRadius:8, flexShrink:0, background:'rgba(99,102,241,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#6366f1' }}>
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

      {/* ── PROFISSIONAIS ── */}
      {tab === 'profissionais' && (<>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
          {[
            { val: professionals.filter(p=>p.active).length, label:'Total Profissionais', color:'#6366f1' },
            { val: professionals.filter(p=>p.active && p.specialty?.toLowerCase().includes('optom')).length, label:'Optometristas', color:'#06b6d4' },
            { val: professionals.filter(p=>p.active && p.specialty?.toLowerCase().includes('oftal')).length, label:'Oftalmologistas', color:'#22c55e' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
              <div style={{ fontSize:28, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div className="search-bar" style={{ marginBottom:16 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Pesquisar profissional..." value={searchProf} onChange={e=>setSearchProf(e.target.value)}/>
        </div>
        {loadingProf ? <div className="empty-state"><p>Carregando...</p></div> :
         filteredProf.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Users size={40}/></div>
            <h3>Nenhum profissional cadastrado.</h3>
            <button className="btn btn-primary" onClick={openNewProf}><Plus size={15}/> Cadastrar profissional</button>
          </div>
         ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Profissional</th><th>Especialidade</th><th>CRO/CRM</th><th>Telefone</th><th>Ações</th></tr></thead>
                <tbody>
                  {filteredProf.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'white' }}>
                            {p.name.slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight:500 }}>{p.name}</div>
                            {p.email && <div style={{ fontSize:12, color:'var(--text-muted)' }}>{p.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td><span style={{ fontSize:12, padding:'2px 8px', borderRadius:12, background:'rgba(6,182,212,.15)', color:'#06b6d4' }}>{p.specialty||'—'}</span></td>
                      <td style={{ fontSize:13, fontFamily:'monospace' }}>{p.cro||'—'}</td>
                      <td style={{ fontSize:13 }}>{p.phone||'—'}</td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={()=>openEditProf(p)} style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#6366f1', display:'flex', alignItems:'center' }}><Edit2 size={14}/></button>
                          <button onClick={()=>deleteProf(p)} style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
              {filteredProf.length} profissional(is) cadastrado(s)
            </div>
          </div>
         )}
      </>)}

      {/* ── FUNCIONÁRIOS ── */}
      {tab === 'funcionarios' && (<>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:24 }}>
          {[
            { val: funcionarios.filter(f=>f.active).length, label:'Total Funcionários', color:'#6366f1' },
            { val: funcionarios.filter(f=>f.active && f.cargo === 'Vendedor(a)').length, label:'Vendedores', color:'#22c55e' },
            { val: funcionarios.filter(f=>f.active && f.cargo === 'Gerente').length, label:'Gerentes', color:'#f59e0b' },
          ].map((s,i) => (
            <div key={i} className="card" style={{ padding:20, borderTop:'3px solid '+s.color }}>
              <div style={{ fontSize:28, fontWeight:700, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div className="search-bar" style={{ marginBottom:16 }}>
          <Search size={15}/>
          <input className="form-input" placeholder="Pesquisar funcionário..." value={searchFunc} onChange={e=>setSearchFunc(e.target.value)}/>
        </div>
        {loadingFunc ? <div className="empty-state"><p>Carregando...</p></div> :
         filteredFunc.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><UserCheck size={40}/></div>
            <h3>Nenhum funcionário cadastrado.</h3>
            <p>Cadastre os vendedores e funcionários da loja.</p>
            <button className="btn btn-primary" onClick={openNewFunc}><Plus size={15}/> Cadastrar funcionário</button>
          </div>
         ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Funcionário</th><th>Cargo</th><th>CPF</th><th>Telefone</th><th>Comissão</th><th>Ações</th></tr></thead>
                <tbody>
                  {filteredFunc.map(f => (
                    <tr key={f.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,#22c55e,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'white' }}>
                            {f.name.slice(0,2).toUpperCase()}
                          </div>
                          <div style={{ fontWeight:500 }}>{f.name}</div>
                        </div>
                      </td>
                      <td><span style={{ fontSize:12, padding:'2px 8px', borderRadius:12, background:'rgba(34,197,94,.15)', color:'#22c55e' }}>{f.cargo||'—'}</span></td>
                      <td style={{ fontSize:13, fontFamily:'monospace' }}>{f.cpf||'—'}</td>
                      <td style={{ fontSize:13 }}>{f.phone||'—'}</td>
                      <td style={{ fontSize:13, color:'#f59e0b', fontWeight:600 }}>{f.comissao ? f.comissao+'%' : '—'}</td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={()=>openEditFunc(f)} style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#6366f1', display:'flex', alignItems:'center' }}><Edit2 size={14}/></button>
                          <button onClick={()=>deleteFunc(f)} style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:7, padding:'5px 8px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'10px 16px', fontSize:13, color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
              {filteredFunc.length} funcionário(s) cadastrado(s)
            </div>
          </div>
         )}
      </>)}

      {/* Modal Fornecedor */}
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

      {/* Modal Profissional */}
      {showProfModal && (
        <div className="modal-overlay" onClick={()=>setShowProfModal(false)}>
          <div className="modal" style={{ maxWidth:480, width:'95%' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingProf?'Editar Profissional':'Novo Profissional'}</h2>
              <button onClick={()=>setShowProfModal(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleSaveProf}>
              <div className="modal-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="form-label">Nome completo *</label>
                    <input className="form-input" value={profForm.name} onChange={e=>setP('name',e.target.value)} placeholder="Dr. João Silva" required/>
                  </div>
                  <div>
                    <label className="form-label">Especialidade</label>
                    <select className="form-input" value={profForm.specialty} onChange={e=>setP('specialty',e.target.value)}>
                      {ESPECIALIDADES.map(e=><option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">CRO / CRM</label>
                    <input className="form-input" value={profForm.cro} onChange={e=>setP('cro',e.target.value)} placeholder="CBOO 04 00000-0"/>
                  </div>
                  <div>
                    <label className="form-label">Telefone</label>
                    <input className="form-input" value={profForm.phone} onChange={e=>setP('phone',e.target.value)}/>
                  </div>
                  <div>
                    <label className="form-label">E-mail</label>
                    <input className="form-input" value={profForm.email} onChange={e=>setP('email',e.target.value)}/>
                  </div>
                </div>
                <div style={{borderTop:'1px solid var(--border)',paddingTop:14,marginTop:4}}>
                  <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>Acesso ao sistema (login)</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div>
                      <label className="form-label">E-mail de acesso</label>
                      <input className="form-input" type="email" value={funcForm.email||''} onChange={e=>setF('email',e.target.value)} placeholder="email@exemplo.com"/>
                    </div>
                    <div>
                      <label className="form-label">Senha de acesso</label>
                      <input className="form-input" type="password" value={funcForm.access_password||''} onChange={e=>setF('access_password',e.target.value)} placeholder="Senha para login"/>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={()=>setShowProfModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={savingProf}><Save size={15}/> {savingProf?'Salvando...':'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Funcionário */}
      {showFuncModal && (
        <div className="modal-overlay" onClick={()=>setShowFuncModal(false)}>
          <div className="modal" style={{ maxWidth:480, width:'95%' }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingFunc?'Editar Funcionário':'Novo Funcionário'}</h2>
              <button onClick={()=>setShowFuncModal(false)}><X size={18}/></button>
            </div>
            <form onSubmit={handleSaveFunc}>
              <div className="modal-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="form-label">Nome completo *</label>
                    <input className="form-input" value={funcForm.name} onChange={e=>setF('name',e.target.value)} placeholder="Nome do funcionário" required/>
                  </div>
                  <div>
                    <label className="form-label">Cargo</label>
                    <select className="form-input" value={funcForm.cargo} onChange={e=>setF('cargo',e.target.value)}>
                      {CARGOS.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">CPF</label>
                    <input className="form-input" value={funcForm.cpf} onChange={e=>setF('cpf',e.target.value)} placeholder="000.000.000-00"/>
                  </div>
                  <div>
                    <label className="form-label">Telefone</label>
                    <input className="form-input" value={funcForm.phone} onChange={e=>setF('phone',e.target.value)}/>
                  </div>
                  <div>
                    <label className="form-label">Comissão (%)</label>
                    <input className="form-input" type="number" min="0" max="100" step="0.5" value={funcForm.comissao} onChange={e=>setF('comissao',parseFloat(e.target.value)||0)}/>
                  </div>
                  <label className="form-label">E-mail de acesso</label>
                  <input className="form-input" type="email" value={funcForm.email||''} onChange={e=>setF('email',e.target.value)} placeholder="email@exemplo.com"/>
                </div>
                <div>
                  <label className="form-label">Senha de acesso</label>
                  <input className="form-input" type="password" value={funcForm.access_password||''} onChange={e=>setF('access_password',e.target.value)} placeholder="Senha para login"/>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={()=>setShowFuncModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={savingFunc}><Save size={15}/> {savingFunc?'Salvando...':'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
