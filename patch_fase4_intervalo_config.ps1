# =====================================================================
# Fase 4 (item 3, revisado) - adiciona o campo "Intervalo entre
# consultas" em DadosClinica.tsx, configuravel por tenant.
#
# Rode a partir de D:\optiflow. Rode o SQL fase4_intervalo_consulta.sql
# no Supabase ANTES de testar esta tela.
# =====================================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize($text) { return $text -replace "`r`n", "`n" }
function Denormalize($text) { return $text -replace "`n", "`r`n" }

$path = "src\pages\consulta\DadosClinica.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ERRO: $path nao encontrado." -ForegroundColor Red
    exit 1
}

$backup = "$path.backup_fase4_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

# 1) Interface - adiciona o campo
$old1 = "  possui_intervalo: boolean;`n  intervalo_inicio: string;`n  intervalo_fim: string;`n}"
$new1 = "  possui_intervalo: boolean;`n  intervalo_inicio: string;`n  intervalo_fim: string;`n  intervalo_consulta: number;`n}"
if ($content.Contains((Normalize $old1))) {
    $content = $content.Replace((Normalize $old1), (Normalize $new1))
    Write-Host "1) Campo intervalo_consulta adicionado a interface." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 1 (interface ClinicSettings) nao encontrado." -ForegroundColor Yellow
}

# 2) DEFAULT_FORM - valor padrao 30 (preserva comportamento atual)
$old2 = "  dias_semana: [1, 2, 3, 4, 5], possui_intervalo: false,`n  intervalo_inicio: '12:00', intervalo_fim: '13:00',`n};"
$new2 = "  dias_semana: [1, 2, 3, 4, 5], possui_intervalo: false,`n  intervalo_inicio: '12:00', intervalo_fim: '13:00',`n  intervalo_consulta: 30,`n};"
if ($content.Contains((Normalize $old2))) {
    $content = $content.Replace((Normalize $old2), (Normalize $new2))
    Write-Host "2) DEFAULT_FORM atualizado com intervalo_consulta: 30." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 2 (DEFAULT_FORM) nao encontrado." -ForegroundColor Yellow
}

# 3) Carregamento dos dados existentes - garante fallback 30 se nao configurado
$old3 = "            dias_semana: data.dias_semana ?? [1, 2, 3, 4, 5],`n          });"
$new3 = "            dias_semana: data.dias_semana ?? [1, 2, 3, 4, 5],`n            intervalo_consulta: data.intervalo_consulta ?? 30,`n          });"
if ($content.Contains((Normalize $old3))) {
    $content = $content.Replace((Normalize $old3), (Normalize $new3))
    Write-Host "3) Carregamento com fallback de intervalo_consulta." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 3 (mapeamento de data no load) nao encontrado." -ForegroundColor Yellow
}

# 4) Campo na tela, junto de Inicio/Fim (usa a 3a e 4a coluna da grade que ja existe)
$old4 = @"
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            <div>
              <label className="form-label">Início</label>
              <input type="time" className="form-input" value={form.horario_inicio} onChange={e => set('horario_inicio', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Fim</label>
              <input type="time" className="form-input" value={form.horario_fim} onChange={e => set('horario_fim', e.target.value)} />
            </div>
          </div>
"@
$new4 = @"
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            <div>
              <label className="form-label">Início</label>
              <input type="time" className="form-input" value={form.horario_inicio} onChange={e => set('horario_inicio', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Fim</label>
              <input type="time" className="form-input" value={form.horario_fim} onChange={e => set('horario_fim', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Intervalo entre consultas</label>
              <select className="form-input" value={form.intervalo_consulta} onChange={e => set('intervalo_consulta', parseInt(e.target.value))}>
                <option value={10}>10 minutos</option>
                <option value={15}>15 minutos</option>
                <option value={20}>20 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>60 minutos</option>
              </select>
            </div>
          </div>
"@
if ($content.Contains((Normalize $old4))) {
    $content = $content.Replace((Normalize $old4), (Normalize $new4))
    Write-Host "4) Select de intervalo entre consultas adicionado na tela." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 4 (grade Inicio/Fim) nao encontrado." -ForegroundColor Yellow
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Se algum AVISO apareceu, cole aqui o trecho real do arquivo para eu ajustar." -ForegroundColor Cyan
