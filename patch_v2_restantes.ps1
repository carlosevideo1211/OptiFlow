# =====================================================================
# Patch v2 - aplica os 3 itens que falharam na v1 (1c, 2b, 2c),
# normalizando CRLF -> LF antes de comparar (evita falso "nao encontrado"
# por causa de quebra de linha), e devolvendo pra CRLF ao salvar.
#
# Rode a partir de D:\optiflow. So aplique DEPOIS da v1 ja ter rodado.
# =====================================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Backup-File($path) {
    $backup = "$path.backup_v2_$timestamp"
    Copy-Item -Path $path -Destination $backup -Force
    Write-Host "Backup criado: $backup"
}

function Normalize($text) { return $text -replace "`r`n", "`n" }
function Denormalize($text) { return $text -replace "`n", "`r`n" }

# ---------------------------------------------------------------------
# PATCH 1c - DashboardPage.tsx - mapa OS_STATUS
# ---------------------------------------------------------------------
$dashPath = "src\pages\DashboardPage.tsx"

if (Test-Path $dashPath) {
    Backup-File $dashPath
    $raw = Get-Content -Path $dashPath -Raw -Encoding UTF8
    $content = Normalize $raw

    $old3 = Normalize @"
  const OS_STATUS: Record<string, { label: string; color: string }> = {
    orcamento:   { label: 'Orçamento',   color: '#94a3b8' },
    aprovada:    { label: 'Aprovada',    color: '#6366f1' },
    em_producao: { label: 'Em Produção', color: '#f59e0b' },
    pronta:      { label: 'Pronta',      color: '#22c55e' },
    entregue:    { label: 'Entregue',    color: '#a855f7' },
    cancelada:   { label: 'Cancelada',   color: '#f87171' },
  };
"@
    $new3 = Normalize @"
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
    if ($content.Contains($old3)) {
        $content = $content.Replace($old3, $new3)
        Write-Host "1c) Mapa OS_STATUS corrigido para os status reais." -ForegroundColor Green
    } else {
        Write-Host "AVISO: trecho 1c ainda nao encontrado. Verifique manualmente o arquivo." -ForegroundColor Yellow
    }

    $final = Denormalize $content
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Resolve-Path $dashPath), $final, $utf8NoBom)
    Write-Host "$dashPath salvo." -ForegroundColor Green
} else {
    Write-Host "ERRO: $dashPath nao encontrado." -ForegroundColor Red
}

Write-Host ""

# ---------------------------------------------------------------------
# PATCH 2b + 2c - VendasPage.tsx
# ---------------------------------------------------------------------
$vendasPath = "src\pages\VendasPage.tsx"

if (Test-Path $vendasPath) {
    Backup-File $vendasPath
    $raw = Get-Content -Path $vendasPath -Raw -Encoding UTF8
    $content = Normalize $raw

    # 2b
    $old5 = Normalize @"
    supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single()
      .then(({ data }) => { if (data) setStoreSettings(data as StoreSettings); });
  }, [tenantId]);
"@
    $new5 = Normalize @"
    supabase.from('store_settings').select('*').eq('tenant_id', tenantId).single()
      .then(({ data }) => { if (data) setStoreSettings(data as StoreSettings); });
    supabase.from('tenants').select('boleto_habilitado').eq('id', tenantId).single()
      .then(({ data }) => { setBoletoHabilitado(!!data?.boleto_habilitado); });
  }, [tenantId]);
"@
    if ($content.Contains($old5)) {
        $content = $content.Replace($old5, $new5)
        Write-Host "2b) Busca de boleto_habilitado adicionada ao load do tenant." -ForegroundColor Green
    } else {
        Write-Host "AVISO: trecho 2b ainda nao encontrado. Verifique manualmente o arquivo." -ForegroundColor Yellow
    }

    # 2c
    $old6 = Normalize @"
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {PAGAMENTOS.map(p => (
"@
    $new6 = Normalize @"
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {PAGAMENTOS.filter(p => p.value !== 'boleto' || boletoHabilitado).map(p => (
"@
    if ($content.Contains($old6)) {
        $content = $content.Replace($old6, $new6)
        Write-Host "2c) Botao 'Boleto' agora so aparece se boletoHabilitado for true." -ForegroundColor Green
    } else {
        Write-Host "AVISO: trecho 2c ainda nao encontrado. Verifique manualmente o arquivo." -ForegroundColor Yellow
    }

    $final = Denormalize $content
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Resolve-Path $vendasPath), $final, $utf8NoBom)
    Write-Host "$vendasPath salvo." -ForegroundColor Green
} else {
    Write-Host "ERRO: $vendasPath nao encontrado." -ForegroundColor Red
}

Write-Host ""
Write-Host "Se ainda aparecer algum AVISO, cole aqui o trecho real do arquivo (10 linhas ao redor) para eu ajustar." -ForegroundColor Cyan
