import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';

// Botao "Instalar no celular": coloca o icone do OptiFlow na tela inicial,
// abrindo como aplicativo (sem a barra do navegador). No Android/computador
// usa o convite do proprio navegador (beforeinstallprompt); no iPhone, que
// nao tem esse convite, mostra o passo a passo do "Adicionar a Tela de Inicio".
// Some sozinho quando o sistema ja esta rodando como aplicativo instalado.

let conviteGuardado: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    conviteGuardado = e;
    window.dispatchEvent(new Event('optiflow:instalavel'));
  });
}

const rodandoComoApp = () =>
  window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function InstalarApp({ compacto }: { compacto?: boolean }) {
  const [instalavel, setInstalavel] = useState<boolean>(!!conviteGuardado);
  const [ajuda, setAjuda] = useState(false);
  const [instalado, setInstalado] = useState<boolean>(typeof window !== 'undefined' && rodandoComoApp());

  useEffect(() => {
    const a = () => setInstalavel(true);
    const b = () => { setInstalado(true); conviteGuardado = null; };
    window.addEventListener('optiflow:instalavel', a);
    window.addEventListener('appinstalled', b);
    return () => { window.removeEventListener('optiflow:instalavel', a); window.removeEventListener('appinstalled', b); };
  }, []);

  if (instalado) return null;
  // Sem convite do navegador e fora do iPhone: mostra mesmo assim, com instrucoes.
  const instalar = async () => {
    if (conviteGuardado) {
      conviteGuardado.prompt();
      try { await conviteGuardado.userChoice; } catch { /* usuario fechou */ }
      conviteGuardado = null;
      setInstalavel(false);
      return;
    }
    setAjuda(true);
  };

  return (
    <>
      <button onClick={instalar} title="Instalar o OptiFlow no celular"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: compacto ? 'center' : 'flex-start',
          gap: 8, padding: '8px', borderRadius: 8, border: '1px dashed rgba(99,102,241,.5)', background: 'rgba(99,102,241,.10)',
          color: '#818cf8', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        <Smartphone size={15} />
        {!compacto && (instalavel ? 'Instalar no celular' : 'Colocar na tela inicial')}
      </button>

      {ajuda && (
        <div onClick={() => setAjuda(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="card"
            style={{ maxWidth: 380, width: '100%', padding: 20, position: 'relative' }}>
            <button onClick={() => setAjuda(false)} aria-label="Fechar"
              style={{ position: 'absolute', right: 12, top: 12, background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer' }}><X size={18} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <img src="/icons/icon-192.png" alt="" style={{ width: 44, height: 44, borderRadius: 10 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Colocar o OptiFlow na tela do celular</div>
            </div>
            {ehIphone() ? (
              <ol style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
                <li>Abra este site no <b>Safari</b>.</li>
                <li>Toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
                <li>Escolha <b>Adicionar à Tela de Início</b> e confirme.</li>
              </ol>
            ) : (
              <ol style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
                <li>Abra este site no <b>Chrome</b> do celular.</li>
                <li>Toque nos <b>três pontinhos</b> (⋮), no canto de cima.</li>
                <li>Escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b> e confirme.</li>
              </ol>
            )}
            <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 10 }}>
              O ícone do OptiFlow aparece junto com os outros aplicativos e abre direto no sistema.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
