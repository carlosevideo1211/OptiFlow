import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function TrialExpiredPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const plans = [
    { name:'Básico', price:'R$ 89', period:'/mês', color:'var(--info)', features:['Clientes ilimitados','OS e Consultas','PDV completo','Crediário','Relatórios básicos'] },
    { name:'Profissional', price:'R$ 149', period:'/mês', color:'var(--primary)', featured:true, features:['Tudo do Básico','Múltiplos usuários','Relatórios avançados','Suporte prioritário','Backup automático'] },
    { name:'Clínica', price:'R$ 249', period:'/mês', color:'var(--accent)', features:['Tudo do Profissional','Múltiplas filiais','API integração','Laudos digitais','Treinamento incluso'] },
  ];
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ maxWidth:860, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>⏰</div>
        <h1 style={{ fontSize:30, fontWeight:800, color:'var(--text)', marginBottom:12 }}>Seu período trial expirou</h1>
        <p style={{ color:'var(--text2)', marginBottom:48, fontSize:15 }}>Escolha um plano para continuar usando o OptiFlow</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:32 }}>
          {plans.map(p => (
            <div key={p.name} className="card" style={{ border: p.featured ? `2px solid ${p.color}` : undefined, position:'relative' }}>
              {p.featured && <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', background:p.color, color:'#fff', fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:99 }}>Mais popular</div>}
              <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:8 }}>{p.name}</div>
              <div style={{ fontSize:28, fontWeight:800, color:p.color }}>{p.price}<span style={{ fontSize:13, fontWeight:400, color:'var(--text2)' }}>{p.period}</span></div>
              <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:8 }}>
                {p.features.map(f => <div key={f} style={{ fontSize:13, color:'var(--text2)', display:'flex', alignItems:'center', gap:8, textAlign:'left' }}>✅ {f}</div>)}
              </div>
              <button className="btn btn-primary btn-sm" style={{ width:'100%', justifyContent:'center', marginTop:20 }}>Assinar agora</button>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={async () => { await signOut(); navigate('/login'); }}>Sair da conta</button>
      </div>
    </div>
  );
}
