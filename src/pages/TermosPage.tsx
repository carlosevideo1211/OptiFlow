import { useNavigate } from 'react-router-dom';

export default function TermosPage() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'sans-serif', color: 'var(--text-primary)' }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', color: 'var(--text-primary)' }}>← Voltar</button>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: '0.5rem' }}>Termos de Uso</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Última atualização: junho de 2026</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>1. Aceitação dos Termos</h2>
      <p>Ao acessar e utilizar o OptiFlow, você concorda com estes Termos de Uso. Se não concordar, não utilize o sistema.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>2. Descrição do Serviço</h2>
      <p>O OptiFlow é um sistema de gestão SaaS (Software como Serviço) destinado a óticas e estabelecimentos similares, oferecendo funcionalidades de gestão de clientes, vendas, ordens de serviço, crediário, estoque e financeiro.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>3. Cadastro e Conta</h2>
      <p>Para utilizar o OptiFlow, você deve criar uma conta com informações verídicas. Você é responsável por manter a confidencialidade de suas credenciais de acesso e por todas as atividades realizadas em sua conta.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>4. Planos e Pagamento</h2>
      <p>O OptiFlow oferece planos pagos com cobrança mensal ou anual. O cancelamento pode ser feito a qualquer momento, sem multa. Não há reembolso de valores já pagos, exceto nos casos previstos pelo Código de Defesa do Consumidor.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>5. Dados e Privacidade</h2>
      <p>Seus dados são tratados conforme nossa Política de Privacidade, em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018). Você é o titular e controlador dos dados de seus clientes inseridos no sistema.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>6. Responsabilidades</h2>
      <p>O OptiFlow não se responsabiliza por perdas decorrentes de uso indevido do sistema, falhas de conexão à internet, ou dados inseridos incorretamente pelos usuários. É responsabilidade do cliente manter backups de seus dados críticos.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>7. Propriedade Intelectual</h2>
      <p>Todo o código, design e funcionalidades do OptiFlow são de propriedade exclusiva do desenvolvedor. É proibida a cópia, reprodução ou engenharia reversa do sistema.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>8. Suspensão e Cancelamento</h2>
      <p>Reservamo-nos o direito de suspender contas que violem estes termos, usem o sistema para fins ilegais, ou deixem de efetuar o pagamento do plano contratado.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>9. Alterações nos Termos</h2>
      <p>Podemos atualizar estes termos periodicamente. Notificaremos os usuários sobre mudanças significativas por e-mail ou aviso no sistema.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>10. Contato</h2>
      <p>Para dúvidas sobre estes termos, entre em contato: <a href="mailto:suporte@visionproerp.com.br" style={{ color: 'var(--text-accent)' }}>suporte@visionproerp.com.br</a></p>

      <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 }}>
        OptiFlow — Sistema de Gestão para Óticas
      </div>
    </div>
  );
}
