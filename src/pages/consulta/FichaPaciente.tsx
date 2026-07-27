import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatBRL } from '../../types/index';
import {
  ArrowLeft, Edit2, Plus, ShoppingBag, FileText, Paperclip,
  Eye, Phone, Calendar, MapPin, AlertTriangle, X, Save, Upload
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface Props {
  customerId: string;
  onBack: () => void;
}

interface Customer {
  id: string; name: string; cpf?: string; phone?: string; whatsapp?: string;
  email?: string; birth_date?: string; address?: string; city?: string; state?: string;
  created_at: string; origin_id?: string; photo_url?: string;
}
interface Consultation {
  id: string; date: string; professional_name?: string; status: string;
  re_esf_longe?: number; re_cil_longe?: number; re_eixo_longe?: number;
  le_esf_longe?: number; le_cil_longe?: number; le_eixo_longe?: number;
  ult_lente?: string;
}
interface OS { id: string; os_number: number; total: number; status: string; created_at: string; }
interface Sale { id: string; sale_number: number; total: number; payment_method: string; installments: number; created_at: string; }
interface Attachment { id: string; file_name: string; file_path: string; created_at: string; }

const STATUS_CONSULTA: Record<string, { label: string; color: string; bg: string }> = {
  agendada:  { label:'Agendada',  color:'#6366f1', bg:'rgba(99,102,241,.15)' },
  realizada: { label:'Realizada', color:'#22c55e', bg:'rgba(34,197,94,.15)' },
  cancelada: { label:'Cancelada', color:'#f87171', bg:'rgba(248,113,113,.15)' },
};

function fmtRxNum(v?: number | null) {
  if (v == null) return '';
  return (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',');
}
function fmtRxOlho(esf?: number|null, cil?: number|null, eixo?: number|null) {
  const e = fmtRxNum(esf);
  if (!e) return '—';
  const c = fmtRxNum(cil);
  const ax = eixo ? ` x${Math.round(eixo)}` : '';
  return c ? `${e} ${c}${ax}` : e;
}
function fmtData(d?: string) {
  if (!d) return '--';
  const dt = d.includes('T') ? new Date(d) : new Date(d + 'T00:00:00');
  return isNaN(dt.getTime()) ? '--' : dt.toLocaleDateString('pt-BR');
}

export default function FichaPaciente({ customerId, onBack }: Props) {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [consultas, setConsultas] = useState<Consultation[]>([]);
  const [ordens, setOrdens] = useState<OS[]>([]);
  const [vendas, setVendas] = useState<Sale[]>([]);
  const [anexos, setAnexos] = useState<Attachment[]>([]);
  const [parcelasAtraso, setParcelasAtraso] = useState(0);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().split('T')[0];

    const [cust, cons, os, sal, anx] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).single(),
      supabase.from('consultations')
        .select('id,date,professional_name,status,re_esf_longe,re_cil_longe,re_eixo_longe,le_esf_longe,le_cil_longe,le_eixo_longe,ult_lente')
        .eq('tenant_id', tenantId).eq('customer_id', customerId)
        .order('date', { ascending: false }),
      supabase.from('service_orders')
        .select('id,os_number,total,status,created_at')
        .eq('tenant_id', tenantId).eq('customer_id', customerId)
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('sales')
        .select('id,sale_number,total,payment_method,installments,created_at')
        .eq('tenant_id', tenantId).eq('customer_id', customerId)
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('customer_attachments')
        .select('id,file_name,file_path,created_at')
        .eq('tenant_id', tenantId).eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
    ]);

    setCustomer(cust.data as Customer);
    setConsultas((cons.data as Consultation[]) || []);
    setOrdens((os.data as OS[]) || []);
    setVendas((sal.data as Sale[]) || []);
    setAnexos((anx.data as Attachment[]) || []);

    // parcelas em atraso: crediario deste cliente -> crediario_parcelas pendente e vencida
    const { data: creds } = await supabase.from('crediario').select('id').eq('tenant_id', tenantId).eq('customer_id', customerId);
    const credIds = (creds || []).map((c: any) => c.id);
    if (credIds.length > 0) {
      const { count } = await supabase.from('crediario_parcelas').select('id', { count: 'exact', head: true })
        .in('crediario_id', credIds).eq('status', 'pendente').lt('due_date', hoje);
      setParcelasAtraso(count || 0);
    } else {
      setParcelasAtraso(0);
    }

    setLoading(false);
  };

  useEffect(() => { if (tenantId && customerId) load(); }, [tenantId, customerId]);

  const openEditModal = () => {
    if (!customer) return;
    setEditForm({ ...customer });
    setShowEdit(true);
  };

  const salvarEdicao = async () => {
    if (!customer) return;
    setSaving(true);
    const { error } = await supabase.from('customers').update({
      name: editForm.name, cpf: editForm.cpf, phone: editForm.phone, whatsapp: editForm.whatsapp,
      email: editForm.email, birth_date: editForm.birth_date || null,
      address: editForm.address, city: editForm.city, state: editForm.state,
    }).eq('id', customer.id);
    setSaving(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
    toast.success('Dados atualizados!');
    setShowEdit(false);
    load();
  };

  const handleUpload = async (file: File) => {
    if (!tenantId) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `receitas/${customerId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('customer_attachments').insert([{
        tenant_id: tenantId, customer_id: customerId, file_name: file.name, file_path: path,
      }]);
      if (insErr) throw insErr;
      toast.success('Arquivo anexado!');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao anexar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const abrirAnexo = async (a: Attachment) => {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(a.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    else toast.error('Não foi possível abrir o arquivo');
  };

  if (loading) return <div className="empty-state"><p>Carregando...</p></div>;
  if (!customer) return <div className="empty-state"><p>Paciente não encontrado.</p></div>;

  const idade = customer.birth_date
    ? Math.floor((Date.now() - new Date(customer.birth_date + 'T00:00:00').getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:13 }}>
          <ArrowLeft size={15}/> Pacientes
        </button>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/consulta')}><Eye size={15}/> Nova consulta</button>
          <button className="btn btn-primary" onClick={() => navigate('/vendas')}><ShoppingBag size={15}/> Nova OS / Venda</button>
        </div>
      </div>

      <div className="card" style={{ padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'white', flexShrink:0 }}>
            {(customer.name || '?').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:700, marginBottom:2 }}>{customer.name}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>
              Paciente desde {fmtData(customer.created_at)}{idade !== null ? ` · ${idade} anos` : ''}
            </div>
          </div>
          <button onClick={openEditModal} style={{ background:'none', border:'1px solid var(--border)', color:'var(--text-muted)', borderRadius:6, padding:'5px 10px', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            <Edit2 size={12}/> Editar dados
          </button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:16, paddingTop:16, borderTop:'1px solid var(--border)' }}>
          <div><div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:3 }}>CPF</div><div style={{ fontSize:13 }}>{customer.cpf || '—'}</div></div>
          <div><div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:3 }}>WhatsApp</div><div style={{ fontSize:13 }}>{customer.whatsapp || customer.phone || '—'}</div></div>
          <div><div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:3 }}>Nascimento</div><div style={{ fontSize:13 }}>{customer.birth_date ? fmtData(customer.birth_date) : '—'}</div></div>
          <div><div style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:3 }}>Cidade</div><div style={{ fontSize:13 }}>{customer.city ? `${customer.city}${customer.state ? ' - ' + customer.state : ''}` : '—'}</div></div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        <div className="card" style={{ padding:14, borderTop:'3px solid #6366f1' }}>
          <div style={{ fontSize:20, fontWeight:800, color:'#6366f1' }}>{consultas.length}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>Consultas realizadas</div>
        </div>
        <div className="card" style={{ padding:14, borderTop:'3px solid #22c55e' }}>
          <div style={{ fontSize:20, fontWeight:800, color:'#22c55e' }}>{ordens.length + vendas.length}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>Compras (OS + Vendas)</div>
        </div>
        <div className="card" style={{ padding:14, borderTop:'3px solid #f59e0b' }}>
          <div style={{ fontSize:20, fontWeight:800, color:'#f59e0b' }}>{anexos.length}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>Documentos anexados</div>
        </div>
        <div className="card" style={{ padding:14, borderTop: parcelasAtraso > 0 ? '3px solid #f87171' : '3px solid #22c55e' }}>
          <div style={{ fontSize:20, fontWeight:800, color: parcelasAtraso > 0 ? '#f87171' : '#22c55e' }}>
            {parcelasAtraso > 0 ? `${parcelasAtraso} parcela${parcelasAtraso > 1 ? 's' : ''}` : 'Em dia'}
          </div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
            {parcelasAtraso > 0 ? 'Em atraso no crediário' : 'Situação no crediário'}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding:18, marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:12 }}>
          Histórico de consultas / RX
        </div>
        {consultas.length === 0 ? (
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>Nenhuma consulta registrada ainda.</p>
        ) : (
          consultas.slice(0, 5).map(c => {
            const st = STATUS_CONSULTA[c.status] || STATUS_CONSULTA.agendada;
            return (
              <div key={c.id} onClick={() => navigate('/consulta/atendimento/' + c.id)}
                style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{fmtData(c.date)}{c.professional_name ? ` — ${c.professional_name}` : ''}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, fontFamily:'monospace' }}>
                    OD: {fmtRxOlho(c.re_esf_longe, c.re_cil_longe, c.re_eixo_longe)} / OE: {fmtRxOlho(c.le_esf_longe, c.le_cil_longe, c.le_eixo_longe)}
                  </div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:st.bg, color:st.color }}>{st.label}</span>
              </div>
            );
          })
        )}
        {consultas.length > 5 && (
          <button onClick={() => navigate('/consulta')} style={{ width:'100%', marginTop:10, background:'none', border:'1px dashed var(--border)', color:'#818cf8', borderRadius:8, padding:8, fontSize:12, cursor:'pointer' }}>
            Ver todas as {consultas.length} consultas
          </button>
        )}
      </div>

      <div className="card" style={{ padding:18, marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:12 }}>
          Histórico de compras
        </div>
        {ordens.length === 0 && vendas.length === 0 ? (
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>Nenhuma compra registrada ainda.</p>
        ) : (
          <>
            {ordens.map(o => (
              <div key={o.id} onClick={() => navigate('/os')} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>OS #{String(o.os_number).padStart(4, '0')}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{fmtData(o.created_at)}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#22c55e' }}>{formatBRL(o.total)}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{o.status}</div>
                </div>
              </div>
            ))}
            {vendas.map(v => (
              <div key={v.id} onClick={() => navigate('/vendas')} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>Venda #{String(v.sale_number).padStart(4, '0')}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{fmtData(v.created_at)}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#22c55e' }}>{formatBRL(v.total)}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{v.payment_method}{v.installments > 1 ? ` ${v.installments}x` : ''}</div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card" style={{ padding:18 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:12 }}>
          Documentos
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {anexos.map(a => (
            <div key={a.id} onClick={() => abrirAnexo(a)} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,.04)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, cursor:'pointer' }}>
              <Paperclip size={13}/> {a.file_name}
            </div>
          ))}
          <label style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'1px dashed var(--border)', color:'#818cf8', borderRadius:8, padding:'8px 12px', fontSize:12, cursor:'pointer' }}>
            <Upload size={13}/> {uploading ? 'Enviando...' : 'Anexar'}
            <input type="file" accept="image/*,.pdf" style={{ display:'none' }} disabled={uploading}
              onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}/>
          </label>
        </div>
      </div>

      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal" style={{ maxWidth:520, width:'95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Editar dados do paciente</h2>
              <button onClick={() => setShowEdit(false)}><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Nome</label>
                <input className="form-input" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}/>
              </div>
              <div>
                <label className="form-label">CPF</label>
                <input className="form-input" value={editForm.cpf || ''} onChange={e => setEditForm(f => ({ ...f, cpf: e.target.value }))}/>
              </div>
              <div>
                <label className="form-label">Nascimento</label>
                <input className="form-input" type="date" value={editForm.birth_date || ''} onChange={e => setEditForm(f => ({ ...f, birth_date: e.target.value }))}/>
              </div>
              <div>
                <label className="form-label">Telefone</label>
                <input className="form-input" value={editForm.phone || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}/>
              </div>
              <div>
                <label className="form-label">WhatsApp</label>
                <input className="form-input" value={editForm.whatsapp || ''} onChange={e => setEditForm(f => ({ ...f, whatsapp: e.target.value }))}/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Email</label>
                <input className="form-input" value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}/>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Endereço</label>
                <input className="form-input" value={editForm.address || ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}/>
              </div>
              <div>
                <label className="form-label">Cidade</label>
                <input className="form-input" value={editForm.city || ''} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}/>
              </div>
              <div>
                <label className="form-label">Estado (UF)</label>
                <input className="form-input" value={editForm.state || ''} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvarEdicao} disabled={saving}><Save size={14}/> {saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
