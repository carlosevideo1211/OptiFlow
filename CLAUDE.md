# CLAUDE.md — OptiFlow & VisionProERP
## Guia de Referência para Desenvolvimento e Solução de Problemas

---

## 🏗️ ARQUITETURA DO SISTEMA

### Stack
- **Frontend:** React + TypeScript + Vite
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Deploy:** Vercel
- **Estilo:** CSS customizado com variáveis (sem Tailwind)

### Estrutura de Pastas
```
src/
  components/       # Shell.tsx (layout principal)
  context/          # AuthContext.tsx (autenticação)
  lib/              # supabase.ts (cliente Supabase)
  pages/
    admin/          # AdminLoginPage.tsx, AdminPanelPage.tsx
    auth/           # LoginPage.tsx, RegisterPage.tsx
    consulta/       # ConsultaPage.tsx, NovaConsultaModal.tsx
    [módulos]/      # ClientesPage, OS, Vendas, etc.
  types/            # index.ts (tipos e utilitários)
```

---

## 🔐 AUTENTICAÇÃO — PROBLEMAS E SOLUÇÕES

### PROBLEMA 1: Inquilino tratado como Admin (CRÍTICO)
**Sintoma:** Login do inquilino não redireciona. Console mostra:
```
[Auth] Admin detectado, pulando perfil
```
**Causa:** `VITE_ADMIN_EMAIL` no Vercel estava vazio ou com email errado.
**Solução:**
1. Acessar Vercel → Environment Variables
2. Definir `VITE_ADMIN_EMAIL=carlosevideo28@gmail.com`
3. Clicar em Redeploy
4. No código, adicionar fallback:
```typescript
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'carlosevideo28@gmail.com';
```

---

### PROBLEMA 2: Login não redireciona após signIn
**Sintoma:** Clica em "Entrar", console mostra "signIn sucesso" mas fica na tela de login.
**Causa:** `setLoading(false)` era chamado ANTES de `setUser()` no AuthContext.
**Solução:** Corrigir ordem no `loadProfile`:
```typescript
const loadProfile = async (uid: string, email?: string) => {
  if (email && email === ADMIN_EMAIL) {
    setLoading(false);
    return;
  }
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle(); // IMPORTANTE: maybeSingle, não single!
  
  if (data) setUser(data as UserProfile); // setUser ANTES de setLoading
  setLoading(false); // setLoading DEPOIS
};
```

---

### PROBLEMA 3: Erro 406 no console (user_profiles)
**Sintoma:** Console mostra erro 406 ao acessar qualquer página.
**Causa:** `.single()` retorna 406 quando não encontra registro. Admin não tem perfil em `user_profiles`.
**Solução:**
1. Usar `.maybeSingle()` em vez de `.single()` no AuthContext
2. Corrigir policy do Supabase:
```sql
DROP POLICY IF EXISTS "own_profile" ON user_profiles;
CREATE POLICY "own_profile" ON user_profiles
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
```

---

### PROBLEMA 4: Admin conflita com AuthContext
**Sintoma:** Admin loga mas gera erros 406. Ou admin loga e quebra o login do inquilino.
**Causa:** Admin usa o mesmo `AuthProvider` que tenta buscar `user_profiles`.
**Solução no App.tsx:** Separar rotas admin do AuthProvider:
```typescript
// Admin fica FORA do AuthProvider
<Route path="/admin-login" element={<AdminLoginPage />} />
<Route path="/admin/*" element={<AdminPanelPage />} />

// Inquilinos ficam DENTRO do AuthProvider
<AuthProvider>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/*" element={<Shell>...</Shell>} />
</AuthProvider>
```

---

## 📝 REGISTRO DE NOVOS TENANTS — PROBLEMAS E SOLUÇÕES

### PROBLEMA 5: "Database error saving new user" no registro (CRÍTICO)
**Sintoma:** Ao criar conta nova, aparece erro "Database error saving new user".
**Console mostra:** `[Auth] Perfil carregado: undefined erro: undefined`

**Causa raiz:** O trigger `on_auth_user_created` não existe ou está com nome de coluna errado.

**Diagnóstico:**
```sql
-- Verificar se trigger existe
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_schema = 'public';

-- Verificar estrutura da tabela tenants
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'tenants' ORDER BY ordinal_position;
```

**⚠️ ATENÇÃO:** O nome da coluna de trial na tabela `tenants` é **`trial_end_date`** (tipo `date`), NÃO `trial_ends_at`.

**Solução — Recriar trigger corretamente:**
```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (company_name, email, plan, status, trial_end_date)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Minha Ótica'),
    NEW.email,
    'trial',
    'trial',
    (NOW() + INTERVAL '14 days')::date
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.user_profiles (id, tenant_id, full_name, email, role)
  VALUES (
    NEW.id,
    new_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'),
    NEW.email,
    'master'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 🔒 BANCO DE DADOS — RLS E POLÍTICAS

### Função get_tenant_id (OBRIGATÓRIA)
```sql
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM user_profiles WHERE id = auth.uid() LIMIT 1
$$;
```

### Políticas RLS para todas as tabelas de tenant
```sql
-- Aplicar em: customers, consultations, service_orders, products,
-- sales, sale_items, crediario, crediario_parcelas,
-- financial_transactions, suppliers, store_settings

CREATE POLICY "tenant_isolation" ON [tabela]
  FOR ALL TO authenticated
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());
```

### Política para tenants (Admin lê tudo)
```sql
CREATE POLICY "admin_read_all" ON tenants
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
```

### Índices de Performance (criar uma vez)
```sql
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consultations_tenant ON consultations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_tenant ON service_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_tenant ON sale_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crediario_tenant ON crediario(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crediario_parcelas_tenant ON crediario_parcelas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_financial_tenant ON financial_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_store_settings_tenant ON store_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
```

---

## 🌐 VERCEL — VARIÁVEIS DE AMBIENTE OBRIGATÓRIAS

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `VITE_SUPABASE_URL` | `https://[projeto].supabase.co` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Chave anônima do Supabase |
| `VITE_ADMIN_EMAIL` | `email@admin.com` | Email do dono do sistema (SaaS) |
| `VITE_APP_NAME` | `OptiFlow` | Nome do sistema |

**⚠️ IMPORTANTE:** Após alterar qualquer variável no Vercel, clicar em **Redeploy** para aplicar.

---

## 📋 CHECKLIST — NOVO DEPLOY / NOVO SISTEMA

Antes de ir para produção, verificar:

- [ ] Trigger `on_auth_user_created` existe e funciona
- [ ] Função `get_tenant_id()` criada
- [ ] RLS ativo em todas as tabelas públicas
- [ ] Políticas `tenant_isolation` em todas as tabelas de tenant
- [ ] Política `admin_read_all` na tabela `tenants`
- [ ] Índices de performance criados
- [ ] `VITE_ADMIN_EMAIL` configurado no Vercel
- [ ] Teste de registro de novo tenant funcionando
- [ ] Teste de login do inquilino funcionando
- [ ] Teste de login do admin funcionando
- [ ] Console sem erros 406/500

---

## 🗺️ PLANO DE DESENVOLVIMENTO — REGRA DE OURO

**Sempre da base para o topo. Nunca pule etapas.**

| Fase | O que fazer | Critério para avançar |
|------|-------------|----------------------|
| Fundação | Banco, RLS, trigger, índices | Zero erros 406/500 |
| Piso 1 | Auth, login, registro, trial | Login funcionando sem erros |
| Piso 2 | Clientes, Produtos (independentes) | CRUD sem erros |
| Piso 3 | Consulta/Rx completa | Receituário salvo, PDF gerado |
| Piso 4 | OS integrada com Consulta | OS gerada da consulta |
| Piso 5 | PDV/Vendas integrado com OS | Venda concluída, estoque baixado |
| Piso 6 | Estoque sincronizado | Estoque refletindo vendas |
| Piso 7 | Crediário | Parcelas criadas automaticamente |
| Piso 8 | Financeiro | Saldo batendo com vendas |
| Cobertura | Relatórios, Dashboard | Números batem com módulos |
| Acabamento | Cadastros, Configuração | PDFs com logo e dados |
| Telhado | Admin SaaS | Gestão sem acessar Supabase |
| Externo | NF, Landing, Pagamento | Sistema 100% estável |

---

## 🔧 COMANDOS ÚTEIS

### Desenvolvimento local
```powershell
cd C:\OptiFlow\optiflow
npm run dev
```

### Deploy
```powershell
git add .
git commit -m "feat/fix: descrição"
git push
```

### Forçar redeploy no Vercel
```powershell
git commit --allow-empty -m "chore: force redeploy"
git push
```

### Verificar erros TypeScript antes do push
```powershell
npx tsc --noEmit
```

---

## 📌 INFORMAÇÕES DO PROJETO

- **Repositório:** https://github.com/carlosevideo1211/OptiFlow
- **Produção:** https://opti-flow-teal.vercel.app
- **Admin:** https://opti-flow-teal.vercel.app/admin-login
- **Supabase:** https://supabase.com/dashboard/project/fkwamdnstrbvgheosalz
- **Admin email:** carlosevideo28@gmail.com
- **Tenant teste:** carlosevideo@hotmail.com / carlos123
