# VisionPro ERP — Melhorias Implementadas

## Contexto
Sistema ERP para óticas (SaaS multi-inquilino) construído em React + TypeScript + Supabase.
Repositório: `C:/VisionProERP/VisionProErp_Oficial`
Deploy: Vercel (visionproerp.com.br)
Banco: Supabase (PostgreSQL)

---

## 1. Login de Funcionários (Multi-inquilino)

**Problema:** Só o dono (Supabase Auth) conseguia logar. Funcionários não tinham acesso.

**Solução:** Login alternativo via tabela `employees` quando Supabase Auth falha.

**Arquivo:** `src/modules/auth/LoginPage.tsx`

**Lógica:**
```
1. Tenta signInWithPassword (Supabase Auth) — dono da loja
2. Se falhar, busca na tabela employees por email
3. Valida access_password
4. Salva sessão no localStorage como employee_session
5. Redireciona para dashboard da loja correta
```

**Tabela employees necessária:**
- `name` — nome real do funcionário (não email!)
- `email` — email para login
- `access_password` — senha de acesso
- `active` — boolean
- `tenant_id` — vincula ao inquilino
- `role` — cargo

**RLS necessário:**
```sql
CREATE POLICY "employees_login" ON employees FOR SELECT USING (true);
CREATE POLICY "store_settings_public_read" ON store_settings FOR SELECT USING (true);
```

**useAuth.tsx:** Lê `employee_session` do localStorage e monta o estado de autenticação.

---

## 2. Pagamento Parcial no Crediário

**Problema:** Sistema só aceitava pagamento total da parcela.

**Solução:** Checkbox "Pagamento Parcial" no modal de baixa que:
1. Aceita valor menor que o total
2. Registra parcela original como "paga" com valor parcial
3. Cria nova parcela com saldo restante e data escolhida pelo atendente

**Arquivo:** `src/modules/crediario/CrediarioPage.tsx`

**PayForm interface:**
```typescript
interface PayForm {
    paid_amount: string;
    paid_date: string;
    operator_name: string;
    operator_pass: string;
    is_partial: boolean;
    partial_due_date: string;
}
```

**Lógica handlePay:**
```
1. Valida operador na tabela employees (nome + access_password)
2. Se parcial: cria nova installment com saldo = amount - paid
3. Registra em installment_logs para auditoria
4. Atualiza balance do customer
5. Registra em financial_transactions
```

**Nova parcela criada com:**
```javascript
{
    customer_id, customer_name, tenant_id,
    amount: saldo,
    status: 'aberta',
    due_date: partial_due_date,
    installment_number: numero_original,
    installment_count: total_original,
    notes: `Saldo parcela ${num} - pagamento parcial em ${data}`
}
```

---

## 3. Validação de Operador nas Baixas

**Problema:** Campo "Nome do Operador" aceitava qualquer texto, inclusive email.

**Solução:** Validar nome + senha contra tabela `employees` antes de processar baixa.

**Arquivo:** `src/modules/crediario/CrediarioPage.tsx` — função `handlePay`

```typescript
const { data: empList } = await supabase
    .from('employees')
    .select('id, name, access_password, active')
    .eq('tenant_id', tenantId)
    .ilike('name', payForm.operator_name.trim());

if (!empList || empList.length === 0) {
    alert('Funcionario nao encontrado.');
    return;
}
if (String(emp.access_password).trim() !== payForm.operator_pass.trim()) {
    alert('Senha incorreta.');
    return;
}
const operatorNameVerified: string = emp.name;
```

---

## 4. Histórico de Baixas (Auditoria)

**Problema:** Não havia como saber quem deu baixa em cada parcela.

**Solução:** Tabela `installment_logs` registra cada baixa automaticamente.

**SQL para criar tabela:**
```sql
CREATE TABLE IF NOT EXISTS installment_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL,
    installment_id uuid,
    customer_name text,
    installment_number int,
    installment_count int,
    amount numeric,
    paid_amount numeric,
    is_partial boolean DEFAULT false,
    balance numeric DEFAULT 0,
    operator_name text,
    paid_date date,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE installment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_insert" ON installment_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "logs_select" ON installment_logs FOR SELECT USING (true);
```

**Aba "Baixas Crediário"** adicionada em Relatórios Gerenciais:
- Arquivo: `src/modules/reports/ReportsPage.tsx`
- Componente: `BaixasTab`
- Somente leitura — sem botões de edição/exclusão
- Busca por cliente ou operador
- Colunas: Data/Hora, Operador, Cliente, Parcela, Venc., Valor Parcela, Valor Pago, Saldo, Tipo

---

## 5. Comprovante Profissional de Pagamento

**Problema:** Comprovante era simples, sem identidade visual da ótica.

**Solução:** Recibo profissional com logo, CNPJ, endereço e detalhamento de pagamento parcial.

**Arquivo:** `src/modules/crediario/CrediarioPage.tsx` — função `printInstallment`

**Estrutura do recibo:**
- Logo da ótica (busca do localStorage)
- Nome da ótica em maiúsculas
- CNPJ e endereço
- "RECIBO DE PAGAMENTO"
- Nome do cliente
- Valor pago em destaque
- Para pagamento parcial: tabela amarela com valor total, valor recebido e saldo restante em laranja
- Referência à parcela e vencimento
- Assinatura da ótica
- Impressão automática via `window.print()`

---

## 6. Ranking de Clientes (Ouro/Prata/Bronze)

**Problema:** Não havia como identificar rapidamente clientes bons e inadimplentes.

**Solução:** Badge automático baseado no histórico de pagamentos.

**Arquivo:** `src/modules/customers/CustomerPage.tsx`

**Regras:**
- **Ouro (★):** Todas as parcelas pagas sem atraso
- **Prata (●):** Pagou mas com atraso em alguma parcela
- **Bronze (◆):** Tem parcelas vencidas em aberto

**Função calcRanking:**
```typescript
function calcRanking(insts: InstallRecord[]): RankingData {
    const pagas = insts.filter(i => i.status === 'paga');
    const vencidas = insts.filter(i => i.status === 'vencida');
    const comAtraso = pagas.filter(i =>
        i.due_date && new Date(i.due_date + 'T00:00:00') < new Date()
    ).length;
    if (vencidas.length > 0) return 'bronze';
    if (comAtraso > 0) return 'prata';
    if (pagas.length > 0) return 'ouro';
    return null;
}
```

**Aparece em:**
1. Lista de clientes — badge ao lado do nome
2. Modal de detalhes do cliente — badge no header

**useEffect para calcular rankings:**
```typescript
useEffect(() => {
    const ids = customers.map(c => c.id);
    supabase.from('installments')
        .select('customer_id,due_date,status')
        .eq('tenant_id', tid)
        .in('customer_id', ids)
        .then(({ data }) => {
            // agrupa por customer_id e calcula ranking
            setRankings(nr);
        });
}, [customers, user?.tenantId]);
```

---

## 7. Anexo de Receitas nos Clientes

**Problema:** Receitas óticas eram anotadas em papel, sem digitalização.

**Solução:** Modal para upload de fotos/PDFs de receitas vinculados ao cliente.

**Tabela necessária:**
```sql
CREATE TABLE IF NOT EXISTS customer_receitas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    arquivo_url text,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE customer_receitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receitas_all" ON customer_receitas FOR ALL USING (true);
```

**Storage Supabase:** Bucket `arquivos` (público)
```sql
CREATE POLICY "arquivos_all" ON storage.objects
FOR ALL USING (bucket_id = 'arquivos')
WITH CHECK (bucket_id = 'arquivos');
```

**Componente AnexoModal:**
- Ícone 📎 amarelo nas ações da tabela de clientes
- Upload de imagens e PDFs
- Visualização em grid 2 colunas
- Viewer fullscreen ao clicar em "Abrir"
- Botão excluir (remove do storage e da tabela)

---

## 8. Tela de Clientes Mais Larga

**Arquivo:** `src/modules/customers/CustomerPage.tsx`

**Mudança:** `maxWidth: 1160` → `maxWidth: 1600`

---

## 9. Tabelas Criadas no Supabase

| Tabela | Finalidade |
|--------|-----------|
| `installment_logs` | Auditoria de baixas no crediário |
| `customer_receitas` | Anexos de receitas dos clientes |

---

## 10. Políticas RLS Criadas

```sql
-- Funcionários
CREATE POLICY "employees_login" ON employees FOR SELECT USING (true);

-- Loja
CREATE POLICY "store_settings_public_read" ON store_settings FOR SELECT USING (true);

-- Dados
CREATE POLICY "customers_employee_read" ON customers FOR SELECT USING (true);
CREATE POLICY "sales_employee_read" ON sales FOR SELECT USING (true);
CREATE POLICY "service_orders_employee_read" ON service_orders FOR SELECT USING (true);
CREATE POLICY "products_employee_read" ON products FOR SELECT USING (true);
CREATE POLICY "receitas_all" ON customer_receitas FOR ALL USING (true);
CREATE POLICY "logs_insert" ON installment_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "logs_select" ON installment_logs FOR SELECT USING (true);
CREATE POLICY "arquivos_all" ON storage.objects FOR ALL USING (bucket_id = 'arquivos') WITH CHECK (bucket_id = 'arquivos');
```

---

## Padrão de Scripts Python para Correções

Os fixes são feitos via scripts Python que manipulam os arquivos TSX diretamente:

```python
path = 'C:/VisionProERP/.../ComponentName.tsx'
with open(path, encoding='utf-8') as f:
    content = f.read()

OLD = """bloco exato do codigo"""
NEW = """novo codigo"""

if OLD in content:
    content = content.replace(OLD, NEW, 1)
    print("Fix OK")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
```

**IMPORTANTE:** Nunca usar emojis diretamente nas strings Python — usar código Unicode `\uXXXX`.

**Deploy:**
```powershell
npm run build
git add .
git commit -m "mensagem"
git push
```
Vercel faz deploy automático. Para forçar sem cache: Vercel Dashboard → Deployments → Redeploy → desmarcar "Use existing Build Cache".

---

## Estrutura de Arquivos Principais

```
src/
  modules/
    auth/LoginPage.tsx          — Login dono + funcionário
    customers/CustomerPage.tsx  — Clientes + ranking + anexos
    crediario/CrediarioPage.tsx — Crediário + pagamento parcial + auditoria
    reports/ReportsPage.tsx     — Relatórios + aba Baixas Crediário
  hooks/
    useAuth.tsx                 — Estado de autenticação (dono e funcionário)
```
