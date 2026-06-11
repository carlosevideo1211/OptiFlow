import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    const ASAAS_KEY = body.asaas_key || Deno.env.get('ASAAS_API_KEY') || '';
    const ASAAS_ENV = body.asaas_env || Deno.env.get('ASAAS_ENV') || 'sandbox';
    if (!ASAAS_KEY) throw new Error('Chave Asaas nao configurada. Va em Configuracoes > Integracoes.');
    const BASE = ASAAS_ENV === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';

    const { customer_name, customer_cpf, customer_email, amount, due_date, description } = body;

    // 1. Criar ou buscar cliente no Asaas
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

    // 2. Criar boleto
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
