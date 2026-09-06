import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = 'https://fkwamdnstrbvgheosalz.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Confere se quem esta chamando e um usuario realmente autenticado no Supabase
// e devolve o email dele (usado abaixo para travar o destinatario). Isso
// impede que qualquer pessoa sem login use esta funcao como um "relay" de
// email aberto (spam/phishing usando nossa conta do Resend).
async function usuarioAutenticado(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.email || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const emailUsuario = await usuarioAutenticado(req);
  if (!emailUsuario) {
    return new Response(JSON.stringify({ error: 'Nao autenticado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY nao configurada' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Observacao da Parte 6 da auditoria (corrigida 06/09/2026): antes o
    // destinatario ("to") vinha livre do corpo da requisicao — qualquer
    // usuario autenticado, inclusive alguem que acabou de criar uma conta
    // trial gratuita de 14 dias, podia mandar email pra QUALQUER endereco
    // atraves da nossa conta no Resend (relay aberto = risco de spam/phishing
    // usando nosso dominio/reputacao). Agora o destinatario e sempre o email
    // do proprio usuario autenticado (vindo do token, nunca do corpo da
    // requisicao) — a unica funcionalidade real que usa esta function hoje
    // (email de boas-vindas apos cadastro, ver src/lib/email.ts) ja manda pro
    // proprio email do usuario que acabou de se cadastrar, entao nada muda
    // pra ela.
    const { subject, html } = await req.json();
    const to = emailUsuario;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to,
        subject,
        html,
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: res.ok ? 200 : 400,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});