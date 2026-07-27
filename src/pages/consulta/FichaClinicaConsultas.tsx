import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  ClipboardList, ChevronUp, ChevronDown, Save,
  Bold, Italic, List as ListIcon, ListOrdered,
} from 'lucide-react';
import toast from 'react-hot-toast';

// Layout salvo em clinic_settings.ficha_layout (jsonb, já existente).
// Isso configura QUAIS seções aparecem e em que ordem na Ficha de
// Atendimento (Fase 5/6, ainda não construída) — não é o formulário
// clínico em si.

const SECOES_PADRAO = [
  'Anamnese', 'Prescrição do Último Exame', 'Acuidade Visual', 'Biomicroscopia',
  'Ceratometria', 'Tonometria', 'Forometria', 'Oftalmoscopia',
  'Retinoscopia Dinâmica', 'Retinoscopia Estática', 'Avaliação Motora', 'RX Final',
  'Amplitude de Acomodação', 'Afinamento', 'DX (Diagnóstico)',
  'Flexibilidade e Facilidade de Acomodação', 'Adição', 'PPC',
  'Reflexos Pupilares', 'Reservas Fusionais', 'Subjetivo', 'Teste Ambulatorial',
].map((nome, i) => ({ key: `secao_${i + 1}`, nome, ativo: true }));

const PLACEHOLDERS_RODAPE = ['{profissional.nome}', '{profissional.conselho}', '{clinica.cidade}', '{dia}', '{mes}', '{ano}'];

interface Secao { key: string; nome: string; ativo: boolean; }
interface FichaLayout { secoes: Secao[]; rodape_ativo: boolean; rodape_html: string; }

const DEFAULT_LAYOUT: FichaLayout = { secoes: SECOES_PADRAO, rodape_ativo: false, rodape_html: '' };

function ToolbarBtn({ onClick, active, children, title }: any) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
      background: active ? 'rgba(99,102,241,.18)' : 'transparent',
      color: active ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center',
    }}>{children}</button>
  );
}

export default function FichaClinicaConsultas() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [layout, setLayout] = useState<FichaLayout>(DEFAULT_LAYOUT);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p></p>',
  });

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('clinic_settings').select('id, ficha_layout').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error('Erro ao carregar: ' + error.message);
        if (data) {
          setSettingsId(data.id);
          const fl = data.ficha_layout;
          if (fl && Array.isArray(fl.secoes) && fl.secoes.length > 0) {
            setLayout(fl);
            editor?.commands.setContent(fl.rodape_html || '<p></p>');
          }
        }
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, editor]);

  const toggleSecao = (key: string) => setLayout(l => ({
    ...l, secoes: l.secoes.map(s => s.key === key ? { ...s, ativo: !s.ativo } : s),
  }));

  const mover = (index: number, dir: -1 | 1) => setLayout(l => {
    const novo = [...l.secoes];
    const alvo = index + dir;
    if (alvo < 0 || alvo >= novo.length) return l;
    [novo[index], novo[alvo]] = [novo[alvo], novo[index]];
    return { ...l, secoes: novo };
  });

  const insertPlaceholder = (ph: string) => editor?.chain().focus().insertContent(ph + ' ').run();

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        ficha_layout: { ...layout, rodape_html: editor?.getHTML() ?? '' },
      };
      const { error } = settingsId
        ? await supabase.from('clinic_settings').update(payload).eq('id', settingsId)
        : await supabase.from('clinic_settings').insert([payload]);
      if (error) throw error;
      toast.success('Layout da Ficha Clínica salvo!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="empty-state"><p>Carregando...</p></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 2px' }}>Ficha Clínica</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Quais seções do exame aparecem e em que ordem (usado pela Ficha de Atendimento)
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={15} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Seções do Exame ({layout.secoes.filter(s => s.ativo).length}/{layout.secoes.length} ativas)</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {layout.secoes.map((s, i) => (
            <div key={s.key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
              borderRadius: 8, background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)',
              opacity: s.ativo ? 1 : 0.5,
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 20, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{s.nome}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                <button onClick={() => mover(i, -1)} disabled={i === 0} style={{
                  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6,
                  padding: '3px 5px', cursor: i === 0 ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', opacity: i === 0 ? 0.4 : 1,
                }}><ChevronUp size={13} /></button>
                <button onClick={() => mover(i, 1)} disabled={i === layout.secoes.length - 1} style={{
                  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6,
                  padding: '3px 5px', cursor: i === layout.secoes.length - 1 ? 'not-allowed' : 'pointer', color: 'var(--text-muted)',
                  opacity: i === layout.secoes.length - 1 ? 0.4 : 1,
                }}><ChevronDown size={13} /></button>
              </div>
              <button onClick={() => toggleSecao(s.key)} style={{
                fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: s.ativo ? 'rgba(34,197,94,.12)' : 'rgba(255,255,255,.06)',
                color: s.ativo ? '#22c55e' : 'var(--text-muted)',
              }}>{s.ativo ? 'Ativa' : 'Inativa'}</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: layout.rodape_ativo ? 14 : 0 }}>
          <div onClick={() => setLayout(l => ({ ...l, rodape_ativo: !l.rodape_ativo }))} style={{
            width: 40, height: 22, borderRadius: 12, background: layout.rodape_ativo ? '#22c55e' : 'var(--border)',
            position: 'relative', transition: 'all .2s',
          }}>
            <div style={{ position: 'absolute', top: 2, left: layout.rodape_ativo ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'all .2s' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Exibir rodapé</span>
        </label>

        {layout.rodape_ativo && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {PLACEHOLDERS_RODAPE.map(ph => (
                <button key={ph} type="button" onClick={() => insertPlaceholder(ph)} style={{
                  fontSize: 11, fontFamily: 'monospace', padding: '4px 8px', borderRadius: 20,
                  border: '1px solid rgba(99,102,241,.3)', background: 'rgba(99,102,241,.1)',
                  color: '#6366f1', cursor: 'pointer',
                }}>{ph}</button>
              ))}
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,.02)' }}>
                <ToolbarBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} title="Negrito"><Bold size={14} /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} title="Itálico"><Italic size={14} /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')} title="Lista"><ListIcon size={14} /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')} title="Lista numerada"><ListOrdered size={14} /></ToolbarBtn>
              </div>
              <div style={{ padding: 14, minHeight: 100 }} className="tiptap-editor-area">
                <style>{`
                  .tiptap-editor-area .ProseMirror { outline: none; color: var(--text); font-size: 13px; line-height: 1.6; }
                  .tiptap-editor-area .ProseMirror p { margin: 0 0 8px; }
                `}</style>
                <EditorContent editor={editor} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
