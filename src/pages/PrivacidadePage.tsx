import { useNavigate } from 'react-router-dom';

export default function PrivacidadePage() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'sans-serif', color: 'var(--text-primary)' }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: '1.5rem', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', color: 'var(--text-primary)' }}>← Voltar</button>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: '0.5rem' }}>Política de Privacidade</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Última atualização: junho de 2026</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>1. Controlador dos Dados</h2>
      <p>O OptiFlow atua como operador de dados conforme a LGPD. Cada empresa (ótica) que utiliza o sistema é a controladora dos dados de seus próprios clientes.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>2. Dados Coletados</h2>
      <p>Coletamos apenas os dados necessários para o funcionamento do sistema: nome, e-mail e informações da empresa do administrador da conta. Os dados de clientes finais inseridos no sistema pertencem exclusivamente à ótica contratante.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>3. Uso dos Dados</h2>
      <p>Os dados são utilizados exclusivamente para: prestação do serviço contratado, comunicações sobre o sistema, suporte técnico e cobrança. Não vendemos, compartilhamos ou cedemos dados a terceiros.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>4. Armazenamento e Segurança</h2>
      <p>Os dados são armazenados em servidores seguros da Supabase (infraestrutura AWS), com criptografia em trânsito (HTTPS/TLS) e em repouso. Senhas são armazenadas com hash criptográfico.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>5. Retenção de Dados</h2>
      <p>Os dados são mantidos enquanto a conta estiver ativa. Após o cancelamento, os dados ficam disponíveis por 30 dias para exportação, sendo excluídos permanentemente após esse prazo mediante solicitação.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>6. Direitos do Titular</h2>
      <p>Conforme a LGPD, você tem direito a: acessar seus dados, corrigir dados incorretos, solicitar exclusão, portabilidade dos dados e revogar consentimento. Solicitações devem ser enviadas para <a href="mailto:privacidade@visionproerp.com.br" style={{ color: 'var(--text-accent)' }}>privacidade@visionproerp.com.br</a>.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>7. Cookies</h2>
      <p>Utilizamos apenas cookies essenciais para autenticação e funcionamento do sistema. Não utilizamos cookies de rastreamento ou publicidade.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>8. Transferência Internacional</h2>
      <p>Os dados podem ser processados em servidores localizados fora do Brasil (AWS us-east-1), sempre com as garantias adequadas de proteção exigidas pela LGPD.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>9. Encarregado de Dados (DPO)</h2>
      <p>Contato do responsável pela proteção de dados: <a href="mailto:privacidade@visionproerp.com.br" style={{ color: 'var(--text-accent)' }}>privacidade@visionproerp.com.br</a></p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: '2rem' }}>10. Alterações</h2>
      <p>Esta política pode ser atualizada periodicamente. Notificaremos os usuários sobre mudanças relevantes com antecedência mínima de 15 dias.</p>

      <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13 }}>
        OptiFlow — Sistema de Gestão para Óticas
      </div>
    </div>
  );
}
