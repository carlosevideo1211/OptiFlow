# =====================================================================
# Patch: corrige bug de "OS Ativas"/"Pipeline de OS" sempre zerados
#        + adiciona trava de boleto (desligado por padrao, so ativa
#        quando o tenant pedir via boleto_habilitado em tenants)
#
# Rode este script a partir da pasta D:\optiflow (raiz do projeto).
# Ele faz backup automatico de cada arquivo antes de alterar.
# =====================================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Backup-File($path) {
    $backup = "$path.backup_$timestamp"
    Copy-Item -Path $path -Destination $backup -Force
    Write-Host "Backup criado: $backup"
}

# ---------------------------------------------------------------------
# PATCH 1 - DashboardPage.tsx
# Corrige o filtro de status de OS (valores antigos que nao existem
# mais: 'aprovada' e 'em_producao') e o mapa OS_STATUS de exibicao.
# ---------------------------------------------------------------------
$dashPath = "src\pages\DashboardPage.tsx"

if (Test-Path $dashPath) {
    Backup-File $dashPath
    $content = Get-Content -Path $dashPath -Raw -Encoding UTF8

    # 1a) Corrige a query de contagem de OS ativas
    $old1 = "supabase.from('service_orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['aprovada', 'em_producao'])"
    $new1 = "supabase.from('service_orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('status', 'in', '(entregue,cancelada)')"
    if ($content -notmatch [regex]::Escape($old1)) {
        Write-Host "AVISO: trecho 1a nao encontrado em $dashPath - confira manualmente." -ForegroundColor Yellow
    } else {
        $content = $content.Replace($old1, $new1)
        Write-Host "1a) Query de contagem de OS ativas corrigida."
    }

    # 1b) Corrige a query da lista "Pipeline de OS" (osRec)
    $old2 = "supabase.from('service_orders').select('id, os_number, customer_name, status, delivery_date').eq('tenant_id', tenantId).in('status', ['aprovada', 'em_producao', 'pronta']).order('created_at', { ascending: false }).limit(5)"
    $new2 = "supabase.from('service_orders').select('id, os_number, customer_name, status, delivery_date').eq('tenant_id', tenantId).not('status', 'in', '(entregue,cancelada)').order('created_at', { ascending: false }).limit(5)"
    if ($content -notmatch [regex]::Escape($old2)) {
        Write-Host "AVISO: trecho 1b nao encontrado em $dashPath - confira manualmente." -ForegroundColor Yellow
    } else {
        $content = $content.Replace($old2, $new2)
        Write-Host "1b) Query do Pipeline de OS corrigida."
    }

    # 1c) Corrige o mapa de status usado para exibir label/cor no Pipeline
    $old3 = @"
  const OS_STATUS: Record<string, { label: string; color: string }> = {
    orcamento:   { label: 'Orçamento',   color: '#94a3b8' },
    aprovada:    { label: 'Aprovada',    color: '#6366f1' },
    em_producao: { label: 'Em Produção', color: '#f59e0b' },
    pronta:      { label: 'Pronta',      color: '#22c55e' },
    entregue:    { label: 'Entregue',    color: '#a855f7' },
    cancelada:   { label: 'Cancelada',   color: '#f87171' },
  };
"@
    $new3 = @"
  const OS_STATUS: Record<string, { label: string; color: string }> = {
    orcamento:  { label: 'Orçamento',        color: '#94a3b8' },
    confirmada: { label: 'Confirmada',       color: '#6366f1' },
    lab:        { label: 'No Laboratório',   color: '#f59e0b' },
    montagem:   { label: 'Em Montagem',      color: '#06b6d4' },
    pronta:     { label: 'Pronta p/ Entrega',color: '#22c55e' },
    entregue:   { label: 'Entregue',         color: '#a855f7' },
    cancelada:  { label: 'Cancelada',        color: '#f87171' },
  };
"@
    if ($content -notmatch [regex]::Escape($old3)) {
        Write-Host "AVISO: trecho 1c (OS_STATUS) nao encontrado em $dashPath - confira manualmente." -ForegroundColor Yellow
    } else {
        $content = $content.Replace($old3, $new3)
        Write-Host "1c) Mapa OS_STATUS corrigido para os status reais."
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Resolve-Path $dashPath), $content, $utf8NoBom)
    Write-Host "$dashPath salvo." -ForegroundColor Green
} else {
    Write-Host "ERRO: $dashPath nao encontrado. Rode este script a partir de D:\optiflow" -ForegroundColor Red
}

Write-Host ""

# ---------------------------------------------------------------------
# PATCH 2 - VendasPage.tsx
# Adiciona leitura de tenants.boleto_habilitado e esconde a opcao
# "Boleto" da lista de formas de pagamento quando desligado.
# ---------------------------------------------------------------------
$vendasPath = "src\pages\VendasPage.tsx"

if (Test-Path $vendasPath) {
    Backup-File $vendasPath
    $content = Get-Content -Path $vendasPath -Raw -Encoding UTF8

    # 2a) Adiciona estado boletoHabilitado, logo apos storeSettings
    $old4 = "const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);"
    $new4 = "const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);`n  const [boletoHabilitado, setBoletoHabilitado] = useState(false);"
    if ($content -notmatch [regex]::Escape($old4)) {
        Write-Host "AVISO: trecho 2a nao encontrado em $vendasPath - confira manualmente." -ForegroundColor Yellow
    } else {
        $content = $content.Replace($old4, $new4)
        Write-Host "2a) Estado boletoHabilitado adicionado."
    }

    # 2b) Busca o valor no useEffect que ja carrega store_settings
    $old5 = @"
    supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single()
      .then(({ data }) => { if (data) setStoreSettings(data as StoreSettings); });
  }, [tenantId]);
"@
    $new5 = @"
    supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single()
      .then(({ data }) => { if (data) setStoreSettings(data as StoreSettings); });
    supabase.from('tenants').select('boleto_habilitado').eq('id', tenantId).single()
      .then(({ data }) => { setBoletoHabilitado(!!data?.boleto_habilitado); });
  }, [tenantId]);
"@
    if ($content -notmatch [regex]::Escape($old5)) {
        Write-Host "AVISO: trecho 2b nao encontrado em $vendasPath - confira manualmente." -ForegroundColor Yellow
    } else {
        $content = $content.Replace($old5, $new5)
        Write-Host "2b) Busca de boleto_habilitado adicionada ao load do tenant."
    }

    # 2c) Filtra a lista de formas de pagamento exibidas no PDV
    $old6 = @"
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {PAGAMENTOS.map(p => (
"@
    $new6 = @"
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {PAGAMENTOS.filter(p => p.value !== 'boleto' || boletoHabilitado).map(p => (
"@
    if ($content -notmatch [regex]::Escape($old6)) {
        Write-Host "AVISO: trecho 2c nao encontrado em $vendasPath - confira manualmente." -ForegroundColor Yellow
    } else {
        $content = $content.Replace($old6, $new6)
        Write-Host "2c) Botao 'Boleto' agora so aparece se boletoHabilitado for true."
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Resolve-Path $vendasPath), $content, $utf8NoBom)
    Write-Host "$vendasPath salvo." -ForegroundColor Green
} else {
    Write-Host "ERRO: $vendasPath nao encontrado. Rode este script a partir de D:\optiflow" -ForegroundColor Red
}

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "PROXIMO PASSO MANUAL (SQL, rode no Supabase antes do deploy):" -ForegroundColor Cyan
Write-Host @"
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS boleto_habilitado boolean NOT NULL DEFAULT false;
"@ -ForegroundColor White
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Depois rode: npm run build" -ForegroundColor Cyan
