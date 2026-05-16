# CLAUDE.md — OptiFlow & VisionProERP
## Guia de Referência para Desenvolvimento e Solução de Problemas
## Última atualização: Sessão 6 — 16/05/2026

---

## 🏗️ ARQUITETURA DOS SISTEMAS

### OptiFlow
- **Produção:** https://opti-flow-teal.vercel.app
- **Repositório:** https://github.com/carlosevideo1211/OptiFlow
- **Supabase:** https://supabase.com/dashboard/project/fkwamdnstrbvgheosalz
- **Pasta local:** C:\OptiFlow\optiflow
- **Admin:** carlosevideo28@gmail.com
- **Tenant teste:** carlosevideo@hotmail.com / carlos123

### VisionProERP
- **Produção:** https://www.visionproerp.com.br
- **Repositório:** https://github.com/carlosevideo1211/VisionProERP_Oficial
- **Supabase:** https://supabase.com/dashboard/project/vicxhfxvapwuxjsfnpzv
- **Pasta local:** C:\VisionProERP\VisionProErp_Oficial
- **Admin:** carlosevideo28@gmail.com

---

## 🔐 AUTENTICAÇÃO — PROBLEMAS E SOLUÇÕES

### PROBLEMA 1: Inquilino tratado como Admin (CRÍTICO)
**Sintoma:** Login não redireciona. Console: `[Auth] Admin detectado, pulando perfil`
**Causa:** `VITE_ADMIN_EMAIL` no Vercel vazio ou errado.
**Solução:**
1. Vercel → Environment Variables → `VITE_ADMIN_EMAIL=carlosevideo28@gmail.com` → Redeploy
2. No código adicionar fallback:
```typescript
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'carlosevideo28@gmail.com';
```

### PROBLEMA 2: Login não redireciona após signIn
**Causa:** `setLoading(false)` chamado ANTES de `setUser()`.
**Solução:**
```typescript
if (data) setUser(data as UserProfile); // setUser PRIMEIRO
setLoading(false);                       // setLoading DEPOIS
```

### PROBLEMA 3: Erro 406 no console (user_profiles)
**Causa:** `.single()` retorna 406 quando não encontra registro.
**Solução:** Usar `.maybeSingle()` + corrigir policy:
```sql
DROP POLICY IF EXISTS "own_profile" ON user_profiles;
CREATE POLICY "own_profile" ON user_profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### PROBLEMA 4: Admin conflita com AuthContext
**Solução no App.tsx:** Rotas admin FORA do AuthProvider:
```typescript
<Route path="/admin-login" element={<AdminLoginPage />} />
<Route path="/admin/*" element={<AdminPanelPage />} />
<AuthProvider>
  <Route path="/*" element={<Shell>...</Shell>} />
</AuthProvider>
```

---

## 📝 REGISTRO DE TENANTS — PROBLEMAS E SOLUÇÕES

### PROBLEMA 5: "Database error saving new user" (CRÍTICO — OptiFlow)
**Causa:** Trigger `on_auth_user_created` não existe ou coluna errada.
**⚠️ ATENÇÃO:** Coluna de trial = **`trial_end_date`** (date), NÃO `trial_ends_at`.
**Solução:**
```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (company_name, email, plan, status, trial_end_date)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', 'Minha Ótica'),
    NEW.email, 'trial', 'trial', (NOW() + INTERVAL '14 days')::date)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.user_profiles (id, tenant_id, full_name, email, role)
  VALUES (NEW.id, new_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'), NEW.email, 'master');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 🏢 VISIONPROERP — PROVISIONAMENTO DE TENANTS (CRÍTICO)

### PROBLEMA 6: Inquilino cadastrado mas login/comandos não funcionam
**Causa raiz:** Ordem errada de criação — `user_profiles` criado ANTES do `tenant`.
**⚠️ REGRA:** No VisionProERP NÃO usar trigger `on_auth_user_created` — conflita com provisionamento manual.

**Ordem correta:**
```
tenant → branch → store_settings → user_profiles → employee
```

**Solução — Função provision_new_tenant no Supabase:**
```sql
CREATE OR REPLACE FUNCTION provision_new_tenant(
  p_tenant_id uuid, p_company_name text, p_email text, p_plan text,
  p_user_id uuid, p_username text, p_mrr_value numeric DEFAULT 0,
  p_phone text DEFAULT NULL, p_whatsapp text DEFAULT NULL, p_nfe_enabled boolean DEFAULT false
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_branch_id uuid; v_trial_end date;
BEGIN
  v_trial_end := (NOW() + INTERVAL '14 days')::date;

  INSERT INTO public.tenants (id, company_name, email, plan, status, trial_end_date, mrr_value, phone, whatsapp, nfe_enabled)
  VALUES (p_tenant_id, p_company_name, p_email, p_plan, 'trial', v_trial_end, p_mrr_value, p_phone, p_whatsapp, p_nfe_enabled)
  ON CONFLICT (id) DO UPDATE SET company_name = EXCLUDED.company_name, email = EXCLUDED.email, plan = EXCLUDED.plan;

  INSERT INTO public.branches (tenant_id, name, is_main_branch, active)
  VALUES (p_tenant_id, 'Matriz - ' || p_company_name, true, true)
  ON CONFLICT DO NOTHING RETURNING id INTO v_branch_id;

  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id = p_tenant_id AND is_main_branch = true LIMIT 1;
  END IF;

  INSERT INTO public.store_settings (id, tenant_id, branch_id, name, email)
  VALUES (gen_random_uuid(), p_tenant_id, v_branch_id, p_company_name, p_email)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_profiles (id, tenant_id, full_name, username, role, active)
  VALUES (p_user_id, p_tenant_id, p_company_name, p_username, 'master', true)
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, full_name = EXCLUDED.full_name, role = EXCLUDED.role, active = EXCLUDED.active;

  INSERT INTO public.employees (id, tenant_id, name, email, role, active)
  VALUES (p_user_id, p_tenant_id, 'Administrador ' || p_company_name, p_email, 'master', true)
  ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, name = EXCLUDED.name, role = EXCLUDED.role, active = EXCLUDED.active;

  RETURN json_build_object('success', true, 'tenant_id', p_tenant_id, 'branch_id', v_branch_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION provision_new_tenant TO authenticated;
```

### PROBLEMA 7: "duplicate key value violates unique constraint tenants_pkey"
**Causa:** Bloco antigo `// 2. Criar o Inquilino` ainda existia no SaasAdminPage.tsx.
**Solução:** Remover o bloco antigo — manter apenas a chamada `provision_new_tenant`.

### PROBLEMA 8: Usuários órfãos no Auth após excluir tenant
**Diagnóstico:**
```sql
SELECT au.id, au.email FROM auth.users au
LEFT JOIN public.user_profiles up ON up.id = au.id
WHERE up.id IS NULL AND au.email != 'carlosevideo28@gmail.com';
```
**Solução:**
```sql
DELETE FROM auth.users WHERE id IN ('id1', 'id2', ...);
```

---

## 🔒 BANCO DE DADOS — RLS E POLÍTICAS

### Função get_tenant_id (OptiFlow)
```sql
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM user_profiles WHERE id = auth.uid() LIMIT 1
$$;
```

### Políticas RLS
```sql
-- Todas as tabelas de tenant
CREATE POLICY "tenant_isolation" ON [tabela]
  FOR ALL TO authenticated
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

-- Tabela tenants (admin lê tudo)
CREATE POLICY "admin_read_all" ON tenants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### Índices de Performance
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

## 🌐 VERCEL — VARIÁVEIS OBRIGATÓRIAS

| Variável | Valor |
|----------|-------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima |
| `VITE_ADMIN_EMAIL` | `carlosevideo28@gmail.com` |
| `VITE_APP_NAME` | Nome do sistema |

**⚠️ Após alterar variável → Redeploy obrigatório!**

---

## 📋 CHECKLIST — NOVO DEPLOY

- [ ] Trigger `on_auth_user_created` (OptiFlow) ou `provision_new_tenant` (VisionProERP)
- [ ] Função `get_tenant_id()` criada
- [ ] RLS ativo em todas as tabelas
- [ ] Políticas `tenant_isolation` aplicadas
- [ ] Índices de performance criados
- [ ] `VITE_ADMIN_EMAIL` no Vercel correto
- [ ] Registro/provisionamento testado e funcionando
- [ ] Login do inquilino funcionando
- [ ] Login do admin funcionando
- [ ] Console sem erros 406/500
- [ ] Usuários órfãos no Auth limpos

---

## 🗺️ PLANO OPTIFLOW — STATUS ATUAL

| Fase | Status |
|------|--------|
| Fundação — Banco, RLS, trigger, índices | ✅ CONCLUÍDO |
| Piso 1 — Auth, login, registro, trial | ✅ CONCLUÍDO |
| Piso 2 — Clientes, Produtos | 🔄 PRÓXIMO |
| Piso 3 — Consulta/Rx completa | ⏳ |
| Piso 4 — OS integrada | ⏳ |
| Piso 5 — PDV/Vendas | ⏳ |
| Piso 6 — Estoque | ⏳ |
| Piso 7 — Crediário | ⏳ |
| Piso 8 — Financeiro | ⏳ |
| Cobertura — Relatórios, Dashboard | ⏳ |
| Acabamento — Cadastros, Configuração | ⏳ |
| Telhado — Admin SaaS | ⏳ |
| Externo — NF, Landing, Pagamento | ⏳ |

---

## 🔧 COMANDOS ÚTEIS

```powershell
# OptiFlow
cd C:\OptiFlow\optiflow
npm run dev
git add . && git commit -m "feat/fix: descrição" && git push

# VisionProERP
cd C:\VisionProERP\VisionProErp_Oficial
npm run dev
git add . && git commit -m "feat/fix: descrição" && git push

# Verificar TypeScript
npx tsc --noEmit 2>&1 | Select-Object -First 20

# Forçar redeploy
git commit --allow-empty -m "chore: force redeploy" && git push
```
