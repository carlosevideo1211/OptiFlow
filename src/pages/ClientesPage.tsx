import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Search, Edit2, Phone } from 'lucide-react';
import type { Customer } from '../types/index';
import toast from 'react-hot-toast';

const emptyForm = () => ({
  name:'', cpf:'', phone:'', whatsapp:'', email:'', birth_date:'',
  address:'', city:'', state:'', notes:'', active:true
});

export default function ClientesPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (tenantId) loadCustomers(); }, [tenantId]);

  const loadCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    if (error) console.error('Load error:', error);
    setCustomers((data as Customer[]) ?? []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const s = search.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.cpf?.includes(s) ||
      c.phone?.includes(s)
    );
  }, [customers, search]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name:c.name, cpf:c.cpf||'', phone:c.phone||'', whatsapp:c.whatsapp||'', email:c.email||'', birth_date:c.birth_date||'', address:c.address||'', city:c.city||'', state:c.state||'', notes:c.notes||'', active:c.active });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!tenantId) { toast.error('Sessão expirada. Faça login novamente.'); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('customers').update(form).eq('id', editing.id);
        if (error) throw error;
        toast.success('Cliente atualizado!');
      } else {
        const payload = {
          ...form,
          tenant_id: tenantId,
          birth_date: form.birth_date || null,
          email: form.email || null,
          cpf: form.cpf || null,
          phone: form.phone || null,
          whatsapp: form.whatsapp || null,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          notes: form.notes || null,
        };
        const { error } = await supabase.from('customers').insert([payload]);
        if (error) throw error;
        toast.success('Cliente cadastrado!');
      }
      setShowModal(false);
      loadCustomers();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(err.message ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Clientes</h1><p className="page-sub">{customers.length} cadastrados</p></div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo Cliente</button>
      </div>

      <div className="search-bar" style={{ marginBottom:20 }}>
        <Search size={15} />
        <input className="form-input" placeholder="Buscar por nome, CPF ou telefone..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="empty-state"><p>Carregando...</p></div> :
       filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <h3>Nenhum cliente encontrado</h3>
          <p>Cadastre o primeiro cliente clicando em "Novo Cliente"</p>
        </div>
       ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>Cidade</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td style={{ color:'var(--text2)' }}>{c.cpf || '—'}</td>
                    <td style={{ color:'var(--text2)' }}>{c.phone || '—'}</td>
                    <td style={{ color:'var(--text2)' }}>{c.city || '—'}</td>
                    <td><span className={`badge ${c.active ? 'badge-success' : 'badge-gray'}`}>{c.active ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        {c.whatsapp && <a href={`https://wa.me/55${c.whatsapp.replace(/\D/g,'')}`} target="_blank" className="btn-icon" style={{ color:'var(--success)' }}><Phone size={14} /></a>}
                        <button className="btn-icon" onClick={() => openEdit(c)}><Edit2 size={14} /></button>
                      </div>
                    </td>
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
              <h3>{editing ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Nome completo *</label><input className="form-input" value={form.name} onChange={e => set('name',e.target.value)} required /></div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">CPF</label><input className="form-input" value={form.cpf} onChange={e => set('cpf',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Nascimento</label><input className="form-input" type="date" value={form.birth_date} onChange={e => set('birth_date',e.target.value)} /></div>
                </div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Telefone</label><input className="form-input" value={form.phone} onChange={e => set('phone',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">WhatsApp</label><input className="form-input" value={form.whatsapp} onChange={e => set('whatsapp',e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" type="email" value={form.email} onChange={e => set('email',e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Endereço</label><input className="form-input" value={form.address} onChange={e => set('address',e.target.value)} /></div>
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Cidade</label><input className="form-input" value={form.city} onChange={e => set('city',e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Estado</label><input className="form-input" value={form.state} onChange={e => set('state',e.target.value)} maxLength={2} /></div>
                </div>
                <div className="form-group"><label className="form-label">Observações</label><textarea className="form-textarea" value={form.notes} onChange={e => set('notes',e.target.value)} /></div>
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