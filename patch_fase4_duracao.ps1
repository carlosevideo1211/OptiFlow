# =====================================================================
# Fase 4 (item 3/3, versao segura) - cada card da Agenda passa a
# mostrar o intervalo de horario (inicio-fim), dando nocao de duracao
# sem precisar reestruturar a grade (risco praticamente zero).
#
# Rode a partir de D:\optiflow. So aplique DEPOIS dos itens 1 e 2 ja
# confirmados.
# =====================================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize($text) { return $text -replace "`r`n", "`n" }
function Denormalize($text) { return $text -replace "`n", "`r`n" }

$path = "src\pages\AgendaPage.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ERRO: $path nao encontrado." -ForegroundColor Red
    exit 1
}

$backup = "$path.backup_fase4c_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

$old1 = @"
                            {c.procedure_type && (
                              <div style={{ color: colors.color, fontSize: 10, opacity: 0.8 }}>{c.procedure_type}</div>
                            )}
"@
$new1 = @"
                            {c.procedure_type && (
                              <div style={{ color: colors.color, fontSize: 10, opacity: 0.8 }}>{c.procedure_type}</div>
                            )}
                            {c.time && c.time_end && (
                              <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 1 }}>{c.time} - {c.time_end}</div>
                            )}
"@
if ($content.Contains((Normalize $old1))) {
    $content = $content.Replace((Normalize $old1), (Normalize $new1))
    Write-Host "1) Horario de inicio-fim adicionado ao card." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 1 (procedure_type no card) nao encontrado." -ForegroundColor Yellow
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Se algum AVISO apareceu, cole aqui o trecho real do arquivo (10 linhas ao redor) para eu ajustar." -ForegroundColor Cyan
Write-Host "Se tudo correu bem, rode: npm run build" -ForegroundColor Cyan
