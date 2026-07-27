# =====================================================================
# Fase 3 - adiciona a aba "Pacientes" em ConsultaPage.tsx, ligando
# a lista de pacientes + Ficha do Paciente (FichaPaciente.tsx e
# PacientesTab.tsx precisam estar em src\pages\consulta\ antes de rodar).
#
# Rode a partir de D:\optiflow.
# =====================================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize($text) { return $text -replace "`r`n", "`n" }
function Denormalize($text) { return $text -replace "`n", "`r`n" }

$path = "src\pages\consulta\ConsultaPage.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ERRO: $path nao encontrado. Ajuste o caminho e rode de novo." -ForegroundColor Red
    Write-Host "Dica: Get-ChildItem -Recurse -Filter ConsultaPage.tsx" -ForegroundColor Yellow
    exit 1
}

$backup = "$path.backup_fase3_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

# 1) Import do novo componente
$old1 = "import InicioConsultas from './InicioConsultas';"
$new1 = "import InicioConsultas from './InicioConsultas';`nimport PacientesTab from './PacientesTab';"
if ($content.Contains($old1)) {
    $content = $content.Replace($old1, $new1)
    Write-Host "1) Import de PacientesTab adicionado." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 1 (import InicioConsultas) nao encontrado." -ForegroundColor Yellow
}

# 2) Tipo da aba (adiciona 'pacientes' ao union type)
$old2 = "const [tab, setTab] = useState<'inicio'|'consultas'|'agenda'|'ajustes'>('inicio');"
$new2 = "const [tab, setTab] = useState<'inicio'|'pacientes'|'consultas'|'agenda'|'ajustes'>('inicio');"
if ($content.Contains($old2)) {
    $content = $content.Replace($old2, $new2)
    Write-Host "2) Tipo da aba atualizado com 'pacientes'." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 2 (useState tab) nao encontrado." -ForegroundColor Yellow
}

# 3) Botao da aba na barra de navegacao
$old3 = "{[{k:'inicio',l:'🏠 Início'},{k:'consultas',l:'👁 Consultas / Rx'},{k:'agenda',l:'📅 Agenda'},{k:'ajustes',l:'⚙️ Configurações'}].map(t => ("
$new3 = "{[{k:'inicio',l:'🏠 Início'},{k:'pacientes',l:'🧑 Pacientes'},{k:'consultas',l:'👁 Consultas / Rx'},{k:'agenda',l:'📅 Agenda'},{k:'ajustes',l:'⚙️ Configurações'}].map(t => ("
if ($content.Contains($old3)) {
    $content = $content.Replace($old3, $new3)
    Write-Host "3) Botao 'Pacientes' adicionado na barra de abas." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 3 (lista de abas) nao encontrado." -ForegroundColor Yellow
}

# 4) Renderizacao condicional da aba
$old4 = @"
      {/* Agenda */}
      {tab === 'agenda' && <AgendaPage/>}
"@
$new4 = @"
      {/* Pacientes (Fase 3) */}
      {tab === 'pacientes' && <PacientesTab/>}

      {/* Agenda */}
      {tab === 'agenda' && <AgendaPage/>}
"@
$old4n = Normalize $old4
$new4n = Normalize $new4
if ($content.Contains($old4n)) {
    $content = $content.Replace($old4n, $new4n)
    Write-Host "4) Renderizacao da aba Pacientes adicionada." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 4 (renderizacao Agenda) nao encontrado." -ForegroundColor Yellow
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Se algum AVISO apareceu, cole aqui o trecho real do arquivo para eu ajustar." -ForegroundColor Cyan
Write-Host "Se tudo correu bem, copie FichaPaciente.tsx e PacientesTab.tsx para src\pages\consulta\ ANTES de rodar 'npm run build'." -ForegroundColor Cyan
