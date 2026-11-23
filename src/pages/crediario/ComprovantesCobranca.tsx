// Comprovantes na tela "Respostas da cobrança" / Acordos do Feirão (23/11/2026, pedido do Carlos).
// Mostra a imagem/PDF que o cliente mandou no WhatsApp e deixa a loja anexar um comprovante que chegou por outro caminho.
// Guarda uma cópia no bucket privado cobranca-comprovantes (a Meta só mantém o arquivo por cerca de 30 dias).
// Só mostra e guarda: quem confirma o pagamento continua sendo a loja ("Pagamento recebido" / "Já dei baixa").
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

const BUCKET = 'cobranca-comprovantes';
const MAX_BYTES = 12 * 1024 * 1024;
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const mimeLimpo = (m?: string | null) => (m || '').split(';')[0].trim().toLowerCase();
const so8 = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-8);
const fmt = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface MsgMidia { id: string; phone: string; media_mime: string | null; created_at: string; }
interface Salvo {
  id: string; customer_id: string | null; phone: string | null; acordo_id: string | null; mensagem_id: string | null;
  origem: 'whatsapp' | 'anexo'; storage_path: string; mime: string; nome_arquivo: string | null; enviado_por: string | null; recebido_em: string;
}
export interface ClienteComprovante {
  nome: string; customer_id: string | null; phone: string | null;
  acordo_id?: string | null;   // comprovante anexado fica ligado a este acordo
  desde: string;               // só conta o que chegou a partir daqui
  valorEsperado?: number | null;
}
interface Item { chave: string; origem: 'whatsapp' | 'anexo'; mime: string; quando: string; salvo?: Salvo; mensagemId?: string; }

async function baixarDaMeta(mensagemId: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('whatsapp-manage', { body: { action: 'get_media', id: mensagemId } });
  let msg = (data as any)?.error || '';
  if (error && !msg) { try { msg = (await (error as any).context?.json())?.error || error.message; } catch { msg = error.message; } }
  if (msg || !(data as any)?.base64) throw new Error(msg || 'Não foi possível abrir o arquivo.');
  const bin = atob((data as any).base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeLimpo((data as any).mime) || 'image/jpeg' });
}

export function useComprovantes(tenantId: string) {
  const [msgs, setMsgs] = useState<MsgMidia[]>([]);
  const [salvos, setSalvos] = useState<Salvo[]>([]);
  const copiando = useRef(new Set<string>());
  const fila = useRef<Promise<void>>(Promise.resolve());

  const carregar = useCallback(async () => {
    const desde = new Date(Date.now() - 35 * 864e5).toISOString();
    const [{ data: m }, { data: s }] = await Promise.all([
      supabase.from('whatsapp_mensagens').select('id, phone, media_mime, created_at').eq('tenant_id', tenantId).eq('direcao', 'in')
        .in('tipo', ['image', 'document']).not('media_id', 'is', null).gte('created_at', desde).order('created_at', { ascending: false }).limit(1000),
      supabase.from('cobranca_comprovantes').select('*').eq('tenant_id', tenantId).order('recebido_em', { ascending: false }).limit(1000),
    ]);
    setMsgs(((m as MsgMidia[]) || []).filter(x => TIPOS_OK.includes(mimeLimpo(x.media_mime))));
    setSalvos((s as Salvo[]) || []);
  }, [tenantId]);
  useEffect(() => { carregar(); }, [carregar]);

  const itensDe = useCallback((c: ClienteComprovante): Item[] => {
    const fone = so8(c.phone);
    const inicio = new Date(c.desde).getTime();
    const doCliente = (s: Salvo) => (!!c.customer_id && s.customer_id === c.customer_id) || (!!fone && so8(s.phone) === fone);
    const lista: Item[] = salvos.filter(s => {
      if (s.acordo_id) return s.acordo_id === c.acordo_id;        // anexado a um acordo: só aparece nele
      return doCliente(s) && new Date(s.recebido_em).getTime() >= inicio;
    // a chave da imagem do WhatsApp não muda quando a cópia fica pronta (o visor não pisca)
    }).map(s => ({ chave: s.mensagem_id || s.id, origem: s.origem, mime: s.mime, quando: s.recebido_em, salvo: s }));
    const copiados = new Set(salvos.map(s => s.mensagem_id).filter(Boolean));
    msgs.filter(m => !copiados.has(m.id) && !!fone && so8(m.phone) === fone && new Date(m.created_at).getTime() >= inicio).forEach(m => {
      lista.push({ chave: m.id, origem: 'whatsapp', mime: mimeLimpo(m.media_mime), quando: m.created_at, mensagemId: m.id });
    });
    return lista.sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
  }, [msgs, salvos]);

  // Guarda a cópia em segundo plano, uma de cada vez. Se falhar, o arquivo continua abrindo pela Meta.
  const guardarCopia = useCallback((it: Item, c: ClienteComprovante) => {
    if (!it.mensagemId || copiando.current.has(it.mensagemId)) return;
    const mensagemId = it.mensagemId;
    copiando.current.add(mensagemId);
    fila.current = fila.current.then(async () => {
      try {
        const blob = await baixarDaMeta(mensagemId);
        const mime = TIPOS_OK.includes(blob.type) ? blob.type : it.mime;
        const path = `${tenantId}/wa-${mensagemId}.${EXT[mime] || 'jpg'}`;
        const { error: e1 } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
        if (e1 && !/exists|duplicate/i.test(e1.message)) throw e1;
        const { data, error: e2 } = await supabase.from('cobranca_comprovantes').upsert({
          tenant_id: tenantId, customer_id: c.customer_id, phone: c.phone, mensagem_id: mensagemId, origem: 'whatsapp',
          storage_path: path, mime, recebido_em: it.quando,
        }, { onConflict: 'tenant_id,mensagem_id' }).select('*').single();
        if (e2) throw e2;
        setSalvos(l => [data as Salvo, ...l.filter(x => x.id !== (data as Salvo).id)]);
      } catch (e) { console.warn('[comprovante] cópia não guardada', mensagemId, e); }
    });
  }, [tenantId]);

  const anexar = useCallback(async (arquivo: File, c: ClienteComprovante, por: string) => {
    const mime = mimeLimpo(arquivo.type);
    if (!TIPOS_OK.includes(mime)) throw new Error('Envie uma foto (JPG, PNG ou WEBP) ou um PDF.');
    if (arquivo.size > MAX_BYTES) throw new Error('Arquivo grande demais (máximo 12 MB).');
    const path = `${tenantId}/anexo-${crypto.randomUUID()}.${EXT[mime]}`;
    const { error: e1 } = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: mime, upsert: false });
    if (e1) throw e1;
    const { data, error: e2 } = await supabase.from('cobranca_comprovantes').insert({
      tenant_id: tenantId, customer_id: c.customer_id, phone: c.phone, acordo_id: c.acordo_id || null, origem: 'anexo',
      storage_path: path, mime, nome_arquivo: arquivo.name.slice(0, 120), enviado_por: por,
    }).select('*').single();
    if (e2) { await supabase.storage.from(BUCKET).remove([path]); throw e2; }
    setSalvos(l => [data as Salvo, ...l]);
  }, [tenantId]);

  const removerAnexo = useCallback(async (s: Salvo) => {
    const { error } = await supabase.from('cobranca_comprovantes').delete().eq('id', s.id).eq('tenant_id', tenantId).eq('origem', 'anexo');
    if (error) throw error;
    await supabase.storage.from(BUCKET).remove([s.storage_path]);
    setSalvos(l => l.filter(x => x.id !== s.id));
  }, [tenantId]);

  return { itensDe, guardarCopia, anexar, removerAnexo };
}
export type Comprovantes = ReturnType<typeof useComprovantes>;

export function ComprovanteAcoes({ comp, cliente, podeAnexar, usuario, estilo }: {
  comp: Comprovantes; cliente: ClienteComprovante; podeAnexar: boolean; usuario: string; estilo: (cor: string) => React.CSSProperties;
}) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itens = useMemo(() => comp.itensDe(cliente), [comp, cliente]);
  const { guardarCopia } = comp;
  useEffect(() => { itens.forEach(i => { if (i.mensagemId) guardarCopia(i, cliente); }); }, [itens, guardarCopia, cliente]);

  const aoEscolher = async (f?: File) => {
    if (!f) return;
    setEnviando(true);
    try { await comp.anexar(f, cliente, usuario); toast.success('Comprovante anexado. Confira antes de confirmar o pagamento.'); setAberto(true); }
    catch (e: any) { toast.error('Não anexou: ' + (e.message || e), { duration: 8000 }); }
    finally { setEnviando(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  return (
    <>
      {itens.length > 0 && <button style={{ ...estilo('#eab308'), fontWeight: 700 }} onClick={() => setAberto(true)}>🧾 Ver comprovante{itens.length > 1 ? ` (${itens.length})` : ''}</button>}
      {podeAnexar && <button style={estilo('#94a3b8')} disabled={enviando} onClick={() => inputRef.current?.click()}>{enviando ? 'Anexando...' : '📎 Anexar comprovante'}</button>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={e => aoEscolher(e.target.files?.[0])} />
      {aberto && itens.length > 0 && <Visor comp={comp} cliente={cliente} itens={itens} fechar={() => setAberto(false)} />}
    </>
  );
}

function Visor({ comp, cliente, itens, fechar }: { comp: Comprovantes; cliente: ClienteComprovante; itens: Item[]; fechar: () => void }) {
  const [i, setI] = useState(0);
  const [url, setUrl] = useState('');
  const [erro, setErro] = useState('');
  const atual = itens[Math.min(i, itens.length - 1)];
  const chave = atual?.chave;

  useEffect(() => {
    if (!atual) { fechar(); return; }
    let vivo = true, local = '';
    setUrl(''); setErro('');
    (async () => {
      try {
        if (atual.salvo) {
          const { data, error } = await supabase.storage.from(BUCKET).download(atual.salvo.storage_path);
          if (error || !data) throw new Error('Não foi possível abrir o arquivo guardado.');
          local = URL.createObjectURL(new Blob([data], { type: atual.salvo.mime }));
        } else {
          local = URL.createObjectURL(await baixarDaMeta(atual.mensagemId!));
        }
        if (vivo) setUrl(local); else URL.revokeObjectURL(local);
      } catch (e: any) { if (vivo) setErro(e.message || 'Não foi possível abrir o arquivo.'); }
    })();
    return () => { vivo = false; if (local) URL.revokeObjectURL(local); };
  }, [chave]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar]);

  if (!atual) return null;
  const remover = async () => {
    if (!atual.salvo || !window.confirm('Remover este comprovante anexado? O pagamento e o acordo não mudam.')) return;
    try { await comp.removerAnexo(atual.salvo); toast.success('Anexo removido.'); setI(0); if (itens.length <= 1) fechar(); }
    catch (e: any) { toast.error('Não removeu: ' + (e.message || e)); }
  };
  const bt: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary, #fff)', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
  return (
    <div role="dialog" aria-modal="true" aria-label={`Comprovante de ${cliente.nome}`} onClick={fechar}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: 'min(760px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 16, gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>Comprovante de {cliente.nome}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {atual.origem === 'whatsapp' ? 'Recebido no WhatsApp' : `Anexado${atual.salvo?.enviado_por ? ' por ' + atual.salvo.enviado_por : ''}`} em {fmt(atual.quando)}
              {cliente.valorEsperado ? <> · valor esperado: <b style={{ color: '#22c55e' }}>{brl(cliente.valorEsperado)}</b></> : null}
            </div>
          </div>
          <button style={bt} onClick={fechar} aria-label="Fechar">✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 240, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.25)', borderRadius: 8 }}>
          {erro ? <div style={{ padding: 24, color: '#f87171', textAlign: 'center' }}>{erro}</div>
            : !url ? <div style={{ padding: 24, color: 'var(--text-muted)' }}>Abrindo...</div>
            : atual.mime === 'application/pdf' ? <iframe src={url} title="Comprovante em PDF" style={{ width: '100%', height: '68vh', border: 0 }} />
            : <img src={url} alt={`Comprovante de ${cliente.nome}`} style={{ maxWidth: '100%', maxHeight: '68vh', objectFit: 'contain' }} />}
        </div>
        <div style={{ fontSize: 12, color: '#eab308' }}>Confira no banco se o valor caiu antes de confirmar. Imagem sozinha não prova o pagamento.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {itens.length > 1 && <>
            <button style={bt} disabled={i === 0} onClick={() => setI(i - 1)}>‹ Anterior</button>
            <span style={{ fontSize: 13 }}>{i + 1} de {itens.length}</span>
            <button style={bt} disabled={i >= itens.length - 1} onClick={() => setI(i + 1)}>Próximo ›</button>
          </>}
          <div style={{ flex: 1 }} />
          {url && <a href={url} download={`comprovante.${EXT[atual.mime] || 'jpg'}`} style={{ ...bt, textDecoration: 'none' }}>Baixar</a>}
          {atual.origem === 'anexo' && <button style={{ ...bt, color: '#f87171', borderColor: '#f87171' }} onClick={remover}>Remover anexo</button>}
        </div>
      </div>
    </div>
  );
}
