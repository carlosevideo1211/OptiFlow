import { useState, useEffect, useMemo, useRef } from 'react';
import { MessageCircle, Send, Search, ArrowLeft, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';

// Caixa de mensagens do WhatsApp oficial (Meta): mostra o que os clientes
// respondem as mensagens automaticas e deixa a loja responder por aqui.
// As mensagens chegam pelo webhook (supabase/functions/whatsapp-webhook) e
// ficam em whatsapp_mensagens. No canal oficial, a resposta livre so e
// aceita ate 24h depois da ultima mensagem do cliente.

type Msg = {
  id: string; phone: string; nome_contato?: string | null; direcao: 'in' | 'out';
  tipo: string; texto?: string | null; status?: string | null; erro?: string | null;
  lida: boolean; enviado_por?: string | null; created_at: string;
  media_id?: string | null; media_mime?: string | null;
};

const VINTE_QUATRO_H = 24 * 60 * 60 * 1000;
const so8 = (t?: string | null) => (t || '').replace(/\D/g, '').slice(-8);
const fmtFone = (p: string) => {
  const d = p.replace(/\D/g, '').replace(/^55/, '');
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : p;
};
const fmtHora = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const STATUS_LABEL: Record<string, string> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'não entregue' };

export default function MensagensPage() {
  const { tenantId } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  // Audios/imagens ja baixados nesta sessao: id da mensagem -> endereco local do arquivo.
  const [midias, setMidias] = useState<Record<string, { url: string; mime: string }>>({});
  const [baixando, setBaixando] = useState<string | null>(null);
  // Numero que recebe o aviso no WhatsApp quando um cliente responde (store_settings.wa_alerta_numero).
  const [alerta, setAlerta] = useState('');
  const [alertaSalvo, setAlertaSalvo] = useState('');

  const salvarAlerta = async () => {
    const num = alerta.replace(/\D/g, '');
    if (num && num.length < 10) { toast.error('Informe o número com DDD (ex.: 92 99999-9999)'); return; }
    const { error } = await supabase.from('store_settings').update({ wa_alerta_numero: num || null }).eq('tenant_id', tenantId);
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return; }
    setAlertaSalvo(num);
    toast.success(num ? 'Aviso ligado para este número' : 'Aviso desligado');
  };

  const abrirMidia = async (m: Msg) => {
    if (midias[m.id] || baixando) return;
    setBaixando(m.id);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-manage', { body: { action: 'get_media', id: m.id } });
      let msgErro = (data as any)?.error || '';
      if (error && !msgErro) { try { msgErro = (await (error as any).context?.json())?.error || error.message; } catch { msgErro = error.message; } }
      if (msgErro || !(data as any)?.base64) { toast.error(msgErro || 'Não foi possível abrir o arquivo'); return; }
      const bin = atob((data as any).base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mime = (data as any).mime || m.media_mime || 'application/octet-stream';
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      setMidias(x => ({ ...x, [m.id]: { url, mime } }));
    } catch (e: any) {
      toast.error(e.message || 'Erro ao abrir o arquivo');
    } finally {
      setBaixando(null);
    }
  };

  const carregar = async (primeira = false) => {
    if (!tenantId) return;
    try {
      const desde = new Date(Date.now() - 90 * 86400000).toISOString();
      const lista = await fetchAllRows<Msg>((from, to) => supabase
        .from('whatsapp_mensagens')
        .select('id, phone, nome_contato, direcao, tipo, texto, status, erro, lida, enviado_por, created_at, media_id, media_mime')
        .eq('tenant_id', tenantId)
        .gte('created_at', desde)
        .order('created_at', { ascending: true })
        .range(from, to));
      setMsgs(lista || []);
      if (primeira) {
        const custs = await fetchAllRows<any>((from, to) => supabase
          .from('customers')
          .select('id, name, phone, whatsapp')
          .eq('tenant_id', tenantId)
          .order('id')
          .range(from, to));
        const m: Record<string, string> = {};
        (custs || []).forEach((c: any) => {
          [c.whatsapp, c.phone].forEach((t: string) => { const k = so8(t); if (k.length === 8 && !m[k]) m[k] = c.name; });
        });
        setNomes(m);
        const { data: ss } = await supabase.from('store_settings').select('wa_alerta_numero').eq('tenant_id', tenantId).maybeSingle();
        const n = ((ss as any)?.wa_alerta_numero || '') as string;
        setAlerta(n.replace(/^55/, '')); setAlertaSalvo(n);
      }
    } catch (e) {
      console.error('MensagensPage: falha ao carregar', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tenantId) return;
    carregar(true);
    const t = setInterval(() => carregar(false), 20000);
    return () => clearInterval(t);
  }, [tenantId]);

  // Uma conversa por numero de telefone.
  const conversas = useMemo(() => {
    const porFone: Record<string, Msg[]> = {};
    msgs.forEach(m => { (porFone[m.phone] = porFone[m.phone] || []).push(m); });
    const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const s = norm(busca.trim());
    return Object.entries(porFone).map(([phone, lista]) => {
      const ultima = lista[lista.length - 1];
      const contato = [...lista].reverse().find(m => m.nome_contato)?.nome_contato || '';
      const nome = nomes[so8(phone)] || contato || fmtFone(phone);
      return { phone, nome, cadastrado: !!nomes[so8(phone)], lista, ultima, naoLidas: lista.filter(m => m.direcao === 'in' && !m.lida).length };
    })
      .filter(c => !s || norm(c.nome).includes(s) || c.phone.includes(s.replace(/\D/g, '') || '___'))
      .sort((a, b) => b.ultima.created_at.localeCompare(a.ultima.created_at));
  }, [msgs, nomes, busca]);

  const conversa = conversas.find(c => c.phone === sel) || null;
  const ultimaDoCliente = conversa ? [...conversa.lista].reverse().find(m => m.direcao === 'in') : null;
  const dentroDas24h = !!ultimaDoCliente && (Date.now() - new Date(ultimaDoCliente.created_at).getTime()) < VINTE_QUATRO_H;

  // Ao abrir a conversa: marca como lidas e rola para o fim.
  useEffect(() => {
    if (!conversa || !tenantId) return;
    if (conversa.naoLidas > 0) {
      supabase.from('whatsapp_mensagens').update({ lida: true })
        .eq('tenant_id', tenantId).eq('phone', conversa.phone).eq('direcao', 'in').eq('lida', false)
        .then(() => { setMsgs(l => l.map(m => m.phone === conversa.phone ? { ...m, lida: true } : m)); window.dispatchEvent(new Event('optiflow:mensagens-lidas')); });
    }
    setTimeout(() => fimRef.current?.scrollIntoView({ block: 'end' }), 50);
  }, [sel, conversa?.lista.length]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !conversa || enviando) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-manage', { body: { action: 'send_reply', phone: conversa.phone, text: t } });
      // Erro vindo da function (ex.: fora da janela de 24h) chega no corpo da resposta.
      let msgErro = (data as any)?.error || '';
      if (error && !msgErro) {
        try { msgErro = (await (error as any).context?.json())?.error || error.message; } catch { msgErro = error.message; }
      }
      if (msgErro || (data as any)?.ok === false) { toast.error(msgErro || 'Não foi possível enviar'); }
      else { setTexto(''); toast.success('Mensagem enviada'); }
      await carregar(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar');
    } finally {
      setEnviando(false);
    }
  };

  const mobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const totalNaoLidas = conversas.reduce((s, c) => s + c.naoLidas, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageCircle size={22} style={{ color: '#25D366' }} /> Mensagens
          </h1>
          <p className="page-sub">Respostas dos clientes às mensagens do WhatsApp{totalNaoLidas > 0 ? ` — ${totalNaoLidas} não lida(s)` : ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>🔔 Avisar no WhatsApp:</span>
          <input className="form-input" style={{ width: 170 }} inputMode="tel" placeholder="(92) 99999-9999" value={alerta} onChange={e => setAlerta(e.target.value)} />
          <button className="btn btn-secondary" onClick={salvarAlerta} disabled={alerta.replace(/\D/g, '') === alertaSalvo.replace(/^55/, '')}>Salvar</button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text3)', margin: '-8px 0 14px' }}>
        Quando um cliente responder, o sistema manda um aviso para o número acima, pelo WhatsApp da loja conectado por QR Code (no máximo um aviso por cliente a cada 10 minutos). Deixe em branco para desligar.
      </p>

      {loading ? <div className="empty-state"><p>Carregando...</p></div> : conversas.length === 0 && !busca ? (
        <div className="empty-state">
          <div className="empty-icon"><MessageCircle size={40} /></div>
          <h3>Nenhuma mensagem ainda.</h3>
          <p style={{ maxWidth: 460, margin: '8px auto 0', color: 'var(--text3)', fontSize: 13 }}>
            Quando um cliente responder a um lembrete ou cobrança do WhatsApp oficial, a resposta aparece aqui
            e você pode responder por esta tela.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '320px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Lista de conversas */}
          {(!mobile || !conversa) && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: 12, borderBottom: '1px solid var(--border)', position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 22, top: 22, color: 'var(--text3)' }} />
                <input className="form-input" style={{ paddingLeft: 30 }} placeholder="Buscar por nome ou telefone" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                {conversas.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)' }}>Nenhuma conversa encontrada.</div>}
                {conversas.map(c => (
                  <button key={c.phone} onClick={() => setSel(c.phone)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)', background: sel === c.phone ? 'rgba(99,102,241,.12)' : 'none', color: 'var(--text)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: c.naoLidas ? 800 : 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{fmtHora(c.ultima.created_at)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.ultima.direcao === 'out' ? 'Você: ' : ''}{c.ultima.texto || `[${c.ultima.tipo}]`}
                      </span>
                      {c.naoLidas > 0 && <span style={{ background: '#25D366', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px', flexShrink: 0 }}>{c.naoLidas}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversa aberta */}
          {(!mobile || conversa) && (
            <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 360 }}>
              {!conversa ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>Escolha uma conversa ao lado.</div>
              ) : (
                <>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {mobile && <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 0 }}><ArrowLeft size={18} /></button>}
                    <User size={18} style={{ color: 'var(--text3)' }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{conversa.nome}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{fmtFone(conversa.phone)}{conversa.cadastrado ? '' : ' · não encontrado no cadastro de clientes'}</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: 16, maxHeight: '52vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {conversa.lista.map(m => (
                      <div key={m.id} style={{ alignSelf: m.direcao === 'out' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                        <div style={{ padding: '8px 12px', borderRadius: 12, fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          background: m.direcao === 'out' ? 'rgba(37,211,102,.18)' : 'var(--bg3)', border: '1px solid var(--border)' }}>
                          {m.texto || `[${m.tipo}]`}
                          {m.media_id && (midias[m.id] ? (
                            midias[m.id].mime.startsWith('audio') ? <audio controls autoPlay src={midias[m.id].url} style={{ display: 'block', marginTop: 6, maxWidth: '100%' }} />
                            : midias[m.id].mime.startsWith('image') ? <a href={midias[m.id].url} target="_blank" rel="noreferrer"><img src={midias[m.id].url} alt="imagem recebida" style={{ display: 'block', marginTop: 6, maxWidth: 260, borderRadius: 8 }} /></a>
                            : midias[m.id].mime.startsWith('video') ? <video controls src={midias[m.id].url} style={{ display: 'block', marginTop: 6, maxWidth: 280, borderRadius: 8 }} />
                            : <a href={midias[m.id].url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 6, color: '#6366f1', fontWeight: 600 }}>Abrir arquivo</a>
                          ) : (
                            <button onClick={() => abrirMidia(m)} disabled={baixando === m.id}
                              style={{ display: 'block', marginTop: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                              {baixando === m.id ? 'Abrindo...' : m.tipo === 'audio' ? '▶ Ouvir áudio' : m.tipo === 'image' || m.tipo === 'sticker' ? 'Ver imagem' : m.tipo === 'video' ? '▶ Ver vídeo' : 'Abrir arquivo'}
                            </button>
                          ))}
                          {!m.media_id && m.direcao === 'in' && ['audio', 'image', 'video', 'document'].includes(m.tipo) && (
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Recebido antes de o sistema guardar arquivos — peça ao cliente para reenviar.</div>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: m.status === 'failed' ? '#ef4444' : 'var(--text3)', marginTop: 2, textAlign: m.direcao === 'out' ? 'right' : 'left' }}>
                          {fmtHora(m.created_at)}
                          {m.direcao === 'out' && m.enviado_por ? ` · ${m.enviado_por}` : ''}
                          {m.direcao === 'out' && m.status ? ` · ${STATUS_LABEL[m.status] || m.status}` : ''}
                          {m.status === 'failed' && m.erro ? ` — ${m.erro}` : ''}
                        </div>
                      </div>
                    ))}
                    <div ref={fimRef} />
                  </div>
                  <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
                    {!dentroDas24h && (
                      <div style={{ fontSize: 12, lineHeight: 1.5, padding: '8px 10px', borderRadius: 8, marginBottom: 8, background: 'rgba(245,158,11,.10)', border: '1px solid rgba(245,158,11,.35)' }}>
                        Já passou de 24h desde a última mensagem deste cliente. O WhatsApp oficial só aceita resposta livre dentro desse prazo —
                        depois disso, só as mensagens automáticas. Se precisar falar com ele, ligue ou use o WhatsApp da loja.
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <textarea className="form-input" rows={2} style={{ resize: 'vertical', flex: 1 }} placeholder="Escreva sua resposta..."
                        value={texto} onChange={e => setTexto(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
                      <button className="btn btn-primary" onClick={enviar} disabled={enviando || !texto.trim()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'stretch' }}>
                        <Send size={15} /> {enviando ? 'Enviando...' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
