# =====================================================================
# HOTFIX URGENTE - corrige o fallback quebrado de OS_STATUS.aprovada
# que estava causando tela preta/travada no Dashboard (e por
# consequencia parecendo "nao consegue logar") em varias lojas.
#
# Rode a partir de D:\optiflow.
# =====================================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize($text) { return $text -replace "`r`n", "`n" }
function Denormalize($text) { return $text -replace "`n", "`r`n" }

$path = "src\pages\DashboardPage.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ERRO: $path nao encontrado. Rode a partir de D:\optiflow" -ForegroundColor Red
    exit 1
}

$backup = "$path.backup_hotfix_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

$old = "const st = OS_STATUS[os.status] || OS_STATUS.aprovada;"
$new = "const st = OS_STATUS[os.status] || OS_STATUS.orcamento;"

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    Write-Host "Fallback corrigido: OS_STATUS.aprovada -> OS_STATUS.orcamento (chave que realmente existe)." -ForegroundColor Green
} else {
    Write-Host "AVISO: linha nao encontrada exatamente. Buscando variacoes..." -ForegroundColor Yellow
    if ($content -match "OS_STATUS\.aprovada") {
        Write-Host "Encontrei OS_STATUS.aprovada em outro formato. Cole aqui a linha exata (Get-Content $path | Select-String 'OS_STATUS.aprovada') para eu corrigir." -ForegroundColor Yellow
    } else {
        Write-Host "OS_STATUS.aprovada nao aparece mais no arquivo - pode ja estar corrigido ou o erro estar em outro lugar." -ForegroundColor Yellow
    }
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Proximo passo: npm run build, depois git push (deploy urgente)." -ForegroundColor Cyan
