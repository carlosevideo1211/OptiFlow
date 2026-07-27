# =====================================================================
# Fase 4 (item 2/3) - Agenda ganha filtro por profissional: select no
# cabecalho, "Todos" por padrao, filtra a grade da semana.
#
# Rode a partir de D:\optiflow. So aplique DEPOIS do item 1 (horario
# de funcionamento) ja confirmado.
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

$backup = "$path.backup_fase4b_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

# 1) Estado do filtro selecionado
$old1 = "  const [diasAbertos, setDiasAbertos] = useState<number[] | null>(null);"
$new1 = @"
  const [diasAbertos, setDiasAbertos] = useState<number[] | null>(null);
  const [profissionalFiltro, setProfissionalFiltro] = useState('');
"@
if ($content.Contains((Normalize $old1))) {
    $content = $content.Replace((Normalize $old1), (Normalize $new1))
    Write-Host "1) Estado profissionalFiltro adicionado." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 1 (useState diasAbertos) nao encontrado." -ForegroundColor Yellow
}

# 2) Aplica o filtro no getSlot (usado pra renderizar cada celula da grade)
$old2 = @"
  const getSlot = (date: string, hora: string) =>
    consultas.filter(c => c.date === date && c.time === hora);
"@
$new2 = @"
  const getSlot = (date: string, hora: string) =>
    consultas.filter(c => c.date === date && c.time === hora && (!profissionalFiltro || c.professional_name === profissionalFiltro));
"@
if ($content.Contains((Normalize $old2))) {
    $content = $content.Replace((Normalize $old2), (Normalize $new2))
    Write-Host "2) Filtro aplicado em getSlot." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 2 (funcao getSlot) nao encontrado." -ForegroundColor Yellow
}

# 3) Contador de consultas no cabecalho de cada dia tambem respeita o filtro
$old3 = "                const count = consultas.filter(c => c.date === fmt(d)).length;"
$new3 = "                const count = consultas.filter(c => c.date === fmt(d) && (!profissionalFiltro || c.professional_name === profissionalFiltro)).length;"
if ($content.Contains((Normalize $old3))) {
    $content = $content.Replace((Normalize $old3), (Normalize $new3))
    Write-Host "3) Contador do cabecalho respeitando o filtro." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 3 (contador no cabecalho) nao encontrado." -ForegroundColor Yellow
}

# 4) Select de filtro na barra superior, ao lado do botao "Hoje"
$old4 = @"
          <button onClick={() => setBaseDate(new Date())} style={{ background: 'rgba(99,102,241,.15)', border: '1px solid #6366f1', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', color: '#a5b4fc', fontSize: 12, fontWeight: 600 }}>
            Hoje
          </button>
        </div>
"@
$new4 = @"
          <button onClick={() => setBaseDate(new Date())} style={{ background: 'rgba(99,102,241,.15)', border: '1px solid #6366f1', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', color: '#a5b4fc', fontSize: 12, fontWeight: 600 }}>
            Hoje
          </button>
          <select className="form-input" style={{ width: 200, fontSize: 12 }} value={profissionalFiltro} onChange={e => setProfissionalFiltro(e.target.value)}>
            <option value="">Todos os profissionais</option>
            {professionals.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>
"@
if ($content.Contains((Normalize $old4))) {
    $content = $content.Replace((Normalize $old4), (Normalize $new4))
    Write-Host "4) Select de filtro adicionado na barra superior." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 4 (botao Hoje) nao encontrado." -ForegroundColor Yellow
}

# 5) Contador "X na semana" no topo direito tambem respeita o filtro
$old5 = "          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{consultas.length} na semana</span>"
$new5 = @"
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{(profissionalFiltro ? consultas.filter(c => c.professional_name === profissionalFiltro).length : consultas.length)} na semana</span>
"@
if ($content.Contains((Normalize $old5))) {
    $content = $content.Replace((Normalize $old5), (Normalize $new5))
    Write-Host "5) Contador 'na semana' respeitando o filtro." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 5 (contador na semana) nao encontrado." -ForegroundColor Yellow
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Se algum AVISO apareceu, cole aqui o trecho real do arquivo (10 linhas ao redor) para eu ajustar." -ForegroundColor Cyan
Write-Host "Se tudo correu bem, rode: npm run build" -ForegroundColor Cyan
