import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  FileText, Plus, Search, Edit2, Trash2, X,
  Bold, Italic, List, ListOrdered,
} from 'lucide-react';
import toast from 'react-hot-toast';

// NOTA: esta tela usa a tabela `document_templates`, que já existia antes
// desta sessão e já é referenciada via FK por `patient_documents.template_id`.
// Não usar `clinic_document_templates` (tabela criada por engano nesta
// sessão, isolada, sem nenhuma conexão — será removida). Colunas em inglês
// (name/type/content/active) por serem as que já existiam na tabela original.

const CATEGORIAS = [
  { value: 'atestado', label: 'Atestado' },
  { value: 'declaracao', label: 'Declaração' },
  { value: 'encaminhamento', label: 'Encaminhamento' },
  { value: 'laudo_optometrico', label: 'Laudo Optométrico' },
  { value: 'prescricao_lente', label: 'Prescrição Lente' },
  { value: 'prescricao_oculos', label: 'Prescrição Óculos' },
  { value: 'prescricao_oculos_longe_perto', label: 'Prescrição Óculos Longe/Perto' },
  { value: 'termo_autorizacao', label: 'Termo de Autorização' },
];

const PLACEHOLDERS = [
  { grupo: 'Clínica', itens: ['{clinica.nome}', '{clinica.cnpj}', '{clinica.endereco}', '{clinica.logo}'] },
  { grupo: 'Paciente', itens: ['{paciente.nome}', '{paciente.cpf}', '{paciente.data_nascimento}'] },
  { grupo: 'Profissional', itens: ['{profissional.nome}', '{profissional.conselho}'] },
  { grupo: 'Data', itens: ['{data_atual}', '{dia}', '{mes}', '{ano}'] },
];

interface Modelo {
  id?: string;
  tenant_id?: string;
  name: string;
  type: string;
  content: string;
  active: boolean;
}

const EMPTY: Modelo = { name: '', type: CATEGORIAS[0].value, content: '', active: true };

function ToolbarBtn({ onClick, active, children, title }: any) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
      background: active ? 'rgba(99,102,241,.18)' : 'transparent',
      color: active ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    }}>{children}</button>
  );
}

function ModeloModal({ initial, onClose, onSave }: { initial: Modelo; onClose: () => void; onSave: (m: Modelo) => void }) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState(initial.type);
  const [active, setActive] = useState(initial.active);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initial.content || '<p></p>',
  });

  const insertPlaceholder = (ph: string) => editor?.chain().focus().insertContent(ph + ' ').run();

  const handleSave = () => {
    if (!name.trim()) return toast.error('Título é obrigatório');
    onSave({ ...initial, name: name.trim(), type, active, content: editor?.getHTML() ?? '' });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="card" style={{ padding: 24, width: 720, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={17} style={{ color: '#6366f1' }} /> {initial.id ? 'Editar Modelo' : 'Novo Modelo'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label className="form-label">Título *</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Atestado de Comparecimento" />
          </div>
          <div>
            <label className="form-label">Categoria</label>
            <select className="form-input" value={type} onChange={e => setType(e.target.value)}>
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <label className="form-label">Placeholders (clique para inserir)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {PLACEHOLDERS.map(grupo => (
            <div key={grupo.grupo} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              {grupo.itens.map(ph => (
                <button key={ph} type="button" onClick={() => insertPlaceholder(ph)} style={{
                  fontSize: 11, fontFamily: 'monospace', padding: '4px 8px', borderRadius: 20,
                  border: '1px solid rgba(99,102,241,.3)', background: 'rgba(99,102,241,.1)',
                  color: '#6366f1', cursor: 'pointer',
                }}>{ph}</button>
              ))}
            </div>
          ))}
        </div>

        <label className="form-label">Corpo do documento</label>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,.02)' }}>
            <ToolbarBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} title="Negrito"><Bold size={14} /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} title="Itálico"><Italic size={14} /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')} title="Lista"><List size={14} /></ToolbarBtn>
            <ToolbarBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')} title="Lista numerada"><ListOrdered size={14} /></ToolbarBtn>
          </div>
          <div style={{ padding: 14, minHeight: 220, maxHeight: 320, overflowY: 'auto' }} className="tiptap-editor-area">
            <style>{`
              .tiptap-editor-area .ProseMirror { outline: none; color: var(--text); font-size: 13px; line-height: 1.6; }
              .tiptap-editor-area .ProseMirror p { margin: 0 0 8px; }
              .tiptap-editor-area .ProseMirror ul, .tiptap-editor-area .ProseMirror ol { padding-left: 20px; margin: 0 0 8px; }
            `}</style>
            <EditorContent editor={editor} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 14 }}>
          <div onClick={() => setActive(!active)} style={{
            width: 40, height: 22, borderRadius: 12, background: active ? '#22c55e' : 'var(--border)',
            position: 'relative', transition: 'all .2s',
          }}>
            <div style={{ position: 'absolute', top: 2, left: active ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'all .2s' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Ativo</span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

export default function ModelosConsultas() {
  const { tenantId } = useAuth();
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Modelo | null>(null);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase.from('document_templates').select('*').eq('tenant_id', tenantId).order('name');
    if (error) toast.error('Erro ao carregar modelos: ' + error.message);
    setModelos(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const filtered = modelos.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  const labelCategoria = (v: string) => CATEGORIAS.find(c => c.value === v)?.label ?? v;

  const save = async (m: Modelo) => {
    const payload = { ...m, tenant_id: tenantId, updated_at: new Date().toISOString() };
    const { error } = m.id
      ? await supabase.from('document_templates').update(payload).eq('id', m.id)
      : await supabase.from('document_templates').insert([payload]);
    if (error) return toast.error(error.message);
    toast.success('Modelo salvo!');
    setModal(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este modelo?')) return;
    const { error } = await supabase.from('document_templates').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Excluído!');
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>Modelos</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Templates de documentos com placeholders dinâmicos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ ...EMPTY })}>
          <Plus size={15} /> Novo Modelo
        </button>
      </div>

      <div className="search-bar" style={{ maxWidth: 320, marginBottom: 16 }}>
        <Search size={14} />
        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo..." />
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum modelo cadastrado.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Título</th><th>Categoria</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id} style={{ opacity: m.active ? 1 : .5 }}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'rgba(99,102,241,.14)', color: '#6366f1' }}>
                        {labelCategoria(m.type)}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                        background: m.active ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.06)',
                        color: m.active ? '#22c55e' : 'var(--text-muted)',
                      }}>{m.active ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => setModal(m)} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#6366f1' }}><Edit2 size={13} /></button>
                        <button onClick={() => remove(m.id!)} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#f87171' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && <ModeloModal initial={modal} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}
