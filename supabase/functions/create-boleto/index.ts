import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = 'https://fkwamdnstrbvgheosalz.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Confere se quem esta chamando e um usuario realmente autenticado no Supabase
// e devolve o id dele. Isso impede que qualquer pessoa sem login use esta
// funcao (que gera boletos de verdade usando a chave do Asaas do tenant) -
// e o id devolvido e usado logo abaixo para buscar o TENANT_ID de quem esta
// chamando, em vez de confiar cegamente na chave Asaas enviada no corpo.
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
  const data = await res.json().catch(() => null);
  return data?.id || null;
}

async function supabaseFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  return res.json();
}

serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const userId = await usuarioAutenticado(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Nao autenticado' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();

    // Busca a chave Asaas cadastrada no PROPRIO tenant do usuario logado, em
    // vez de usar a chave que veio no corpo da requisicao: antes, qualquer
    // usuario autenticado no sistema podia mandar a asaas_key de OUTRO tenant
    // no corpo e gerar boletos usando ela, sem nenhuma checagem de que aquela
    // chave pertencia mesmo a ele. Mesmo padrao de checagem de tenant ja usado
    // em create-asaas-subscription/index.ts.
    const perfis = await supabaseFetch(`user_profiles?id=eq.${userId}&select=tenant_id`);
    const perfil = Array.isArray(perfis) ? perfis[0] : null;
    if (!perfil?.tenant_id) {
      return new Response(JSON.stringify({ error: 'Perfil nao encontrado' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const settingsRows = await supabaseFetch(`store_settings?tenant_id=eq.${perfil.tenant_id}&select=asaas_key,asaas_env`);
    const settings = Array.isArray(settingsRows) ? settingsRows[0] : null;

    const ASAAS_KEY = settings?.asaas_key || Deno.env.get('ASAAS_API_KEY') || '';
    const ASAAS_ENV = settings?.asaas_env || Deno.env.get('ASAAS_ENV') || 'sandbox';
    if (!ASAAS_KEY) throw new Error('Chave Asaas nao configurada. Va em Configuracoes > Integracoes.');
    const BASE = ASAAS_ENV === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';

    const { customer_name, customer_cpf, customer_email, amount, due_date, description } = body;

    const searchRes = await fetch(BASE + '/customers?cpfCnpj=' + customer_cpf, {
      headers: { 'access_token': ASAAS_KEY }
    });
    const searchData = await searchRes.json();
    let asaasCustomerId = searchData.data?.[0]?.id;

    if (!asaasCustomerId) {
      const createRes = await fetch(BASE + '/customers', {
        method: 'POST',
        headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customer_name, cpfCnpj: customer_cpf, email: customer_email || '' })
      });
      const createData = await createRes.json();
      asaasCustomerId = createData.id;
      if (!asaasCustomerId) throw new Error('Erro ao criar cliente: ' + JSON.stringify(createData));
    }

    const boletoRes = await fetch(BASE + '/payments', {
      method: 'POST',
      headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: 'BOLETO',
        value: amount,
        dueDate: due_date,
        description: description || 'Pagamento OptiFlow',
      })
    });
    const boletoData = await boletoRes.json();
    if (!boletoData.id) throw new Error('Erro ao gerar boleto: ' + JSON.stringify(boletoData));

    return new Response(JSON.stringify({
      boleto_id: boletoData.id,
      boleto_url: boletoData.bankSlipUrl,
      invoice_url: boletoData.invoiceUrl,
      barcode: boletoData.nossoNumero,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});