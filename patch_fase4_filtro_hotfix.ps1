# =====================================================================
# Fase 4 (item 2/3) - HOTFIX: filtro por profissional nao batia porque
# c.professional_name vem como "Nome/ Especialidade" mas a lista mostra
# so o nome puro. Normaliza a comparacao (parte antes da barra).
#
# Rode a partir de D:\optiflow. So aplique DEPOIS de ja ter rodado o
# patch_fase4_filtro_profissional.ps1 anterior.
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

$backup = "$path.backup_fase4b_hotfix_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

# 0) Funcao auxiliar de normalizacao, logo apos os estados
$old0 = "  const [profissionalFiltro, setProfissionalFiltro] = useState('');"
$new0 = @"
  const [profissionalFiltro, setProfissionalFiltro] = useState('');
  const matchProfissional = (nomeConsulta?: string) => {
    if (!profissionalFiltro) return true;
    if (!nomeConsulta) return false;
    return nomeConsulta.split('/')[0].trim() === profissionalFiltro;
  };
"@
if ($content.Contains((Normalize $old0))) {
    $content = $content.Replace((Normalize $old0), (Normalize $new0))
    Write-Host "0) Funcao matchProfissional adicionada." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 0 (useState profissionalFiltro) nao encontrado." -ForegroundColor Yellow
}

# 1) getSlot usando a comparacao normalizada
$old1 = @"
  const getSlot = (date: string, hora: string) =>
    consultas.filter(c => c.date === date && c.time === hora && (!profissionalFiltro || c.professional_name === profissionalFiltro));
"@
$new1 = @"
  const getSlot = (date: string, hora: string) =>
    consultas.filter(c => c.date === date && c.time === hora && matchProfissional(c.professional_name));
"@
if ($content.Contains((Normalize $old1))) {
    $content = $content.Replace((Normalize $old1), (Normalize $new1))
    Write-Host "1) getSlot corrigido." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 1 (getSlot) nao encontrado." -ForegroundColor Yellow
}

# 2) Contador por dia no cabecalho
$old2 = "                const count = consultas.filter(c => c.date === fmt(d) && (!profissionalFiltro || c.professional_name === profissionalFiltro)).length;"
$new2 = "                const count = consultas.filter(c => c.date === fmt(d) && matchProfissional(c.professional_name)).length;"
if ($content.Contains((Normalize $old2))) {
    $content = $content.Replace((Normalize $old2), (Normalize $new2))
    Write-Host "2) Contador por dia corrigido." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 2 (contador por dia) nao encontrado." -ForegroundColor Yellow
}

# 3) Contador "na semana"
$old3 = "          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{(profissionalFiltro ? consultas.filter(c => c.professional_name === profissionalFiltro).length : consultas.length)} na semana</span>"
$new3 = "          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{consultas.filter(c => matchProfissional(c.professional_name)).length} na semana</span>"
if ($content.Contains((Normalize $old3))) {
    $content = $content.Replace((Normalize $old3), (Normalize $new3))
    Write-Host "3) Contador 'na semana' corrigido." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 3 (contador na semana) nao encontrado." -ForegroundColor Yellow
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Se algum AVISO apareceu, cole aqui o trecho real do arquivo (10 linhas ao redor) para eu ajustar." -ForegroundColor Cyan
Write-Host "Se tudo correu bem, rode: npm run build" -ForegroundColor Cyan
