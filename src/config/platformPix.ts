// Chave Pix usada para receber o pagamento da mensalidade dos INQUILINOS
// (as óticas/consultórios que assinam o OptiFlow) — não confundir com
// `store_settings.pix_key`, que é a chave Pix de cada inquilino para
// receber dos SEUS PRÓPRIOS clientes (crediário/vendas).
//
// Usada pelo botão "Gerar Pix" no lembrete de vencimento do inquilino
// (ver src/pages/DashboardPage.tsx) — o mesmo fluxo manual que já existia
// fora do sistema: o inquilino gera o Pix, paga, e o pagamento cai direto
// nessa chave (fora do OptiFlow); depois o Carlos confirma manualmente no
// Painel Admin ("Confirmar Pix", em AdminPanelPage.tsx), do jeito que já
// era feito antes. Não passa pelo Asaas nem por nenhuma API — é o mesmo
// gerador de Pix "Copia e Cola" estático já usado nos carnês de crediário.
//
// Chave definida pelo Carlos em 01/09/2026 (CPF, a mesma ja usada antes,
// fora do sistema, para receber a mensalidade dos inquilinos). Guardada
// sem pontuacao (so os 11 digitos), formato em que o CPF costuma ser
// registrado como chave Pix no DICT do Banco Central.
export const PLATFORM_PIX_KEY = '40538990287';

// Nome do recebedor exibido no Pix (máx. 25 caracteres — o gerador de EMV
// corta e limpa automaticamente se for maior ou tiver acentos/símbolos).
export const PLATFORM_PIX_NOME = 'OptiFlow';
