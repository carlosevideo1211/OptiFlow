# =====================================================================
# Fase 4 (item 3, revisado) - Agenda passa a montar a grade de
# horarios usando o intervalo_consulta configurado em Dados da
# Clinica, em vez do passo fixo de 30 minutos.
#
# Rode a partir de D:\optiflow. Rode DEPOIS do patch_fase4_intervalo_config.ps1.
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

$backup = "$path.backup_fase4d_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

# 1) buildHorarios ganha um parametro de passo (minutos), default 30
$old1 = @"
function buildHorarios(inicio?: string, fim?: string, possuiIntervalo?: boolean, intInicio?: string, intFim?: string) {
  const start = toMin((inicio || '07:00').slice(0, 5));
  const end = toMin((fim || '19:00').slice(0, 5));
  const intS = possuiIntervalo && intInicio ? toMin(intInicio.slice(0, 5)) : null;
  const intE = possuiIntervalo && intFim ? toMin(intFim.slice(0, 5)) : null;
  const lista: string[] = [];
  for (let m = start; m < end; m += 30) {
    if (intS !== null && intE !== null && m >= intS && m < intE) continue;
    lista.push(toHHMM(m));
  }
  return lista.length > 0 ? lista : HORARIOS_PADRAO;
}
"@
$new1 = @"
function buildHorarios(inicio?: string, fim?: string, possuiIntervalo?: boolean, intInicio?: string, intFim?: string, passoMin?: number) {
  const start = toMin((inicio || '07:00').slice(0, 5));
  const end = toMin((fim || '19:00').slice(0, 5));
  const intS = possuiIntervalo && intInicio ? toMin(intInicio.slice(0, 5)) : null;
  const intE = possuiIntervalo && intFim ? toMin(intFim.slice(0, 5)) : null;
  const passo = passoMin && passoMin > 0 ? passoMin : 30;
  const lista: string[] = [];
  for (let m = start; m < end; m += passo) {
    if (intS !== null && intE !== null && m >= intS && m < intE) continue;
    lista.push(toHHMM(m));
  }
  return lista.length > 0 ? lista : HORARIOS_PADRAO;
}
"@
if ($content.Contains((Normalize $old1))) {
    $content = $content.Replace((Normalize $old1), (Normalize $new1))
    Write-Host "1) buildHorarios aceita passo configuravel." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 1 (funcao buildHorarios) nao encontrado." -ForegroundColor Yellow
}

# 2) Busca de clinic_settings passa a incluir intervalo_consulta
$old2 = "    supabase.from('clinic_settings').select('horario_inicio,horario_fim,dias_semana,possui_intervalo,intervalo_inicio,intervalo_fim').eq('tenant_id', tenantId).maybeSingle()"
$new2 = "    supabase.from('clinic_settings').select('horario_inicio,horario_fim,dias_semana,possui_intervalo,intervalo_inicio,intervalo_fim,intervalo_consulta').eq('tenant_id', tenantId).maybeSingle()"
if ($content.Contains((Normalize $old2))) {
    $content = $content.Replace((Normalize $old2), (Normalize $new2))
    Write-Host "2) Select de clinic_settings inclui intervalo_consulta." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 2 (select clinic_settings) nao encontrado." -ForegroundColor Yellow
}

# 3) Passa o intervalo configurado pra buildHorarios
$old3 = "          setHorarios(buildHorarios(data.horario_inicio, data.horario_fim, data.possui_intervalo, data.intervalo_inicio, data.intervalo_fim));"
$new3 = "          setHorarios(buildHorarios(data.horario_inicio, data.horario_fim, data.possui_intervalo, data.intervalo_inicio, data.intervalo_fim, data.intervalo_consulta));"
if ($content.Contains((Normalize $old3))) {
    $content = $content.Replace((Normalize $old3), (Normalize $new3))
    Write-Host "3) Chamada de buildHorarios passando intervalo_consulta." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 3 (chamada setHorarios) nao encontrado." -ForegroundColor Yellow
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Se algum AVISO apareceu, cole aqui o trecho real do arquivo para eu ajustar." -ForegroundColor Cyan
Write-Host "Se tudo correu bem, rode: npm run build" -ForegroundColor Cyan
