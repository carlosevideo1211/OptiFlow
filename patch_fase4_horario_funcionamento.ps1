# =====================================================================
# Fase 4 (item 1/3) - Agenda passa a respeitar o horario de
# funcionamento configurado em clinic_settings (Fase 1): grade de
# horarios dinamica, pula intervalo de almoco, marca dias fechados.
#
# Rode a partir de D:\optiflow.
# =====================================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize($text) { return $text -replace "`r`n", "`n" }
function Denormalize($text) { return $text -replace "`n", "`r`n" }

$path = "src\pages\AgendaPage.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ERRO: $path nao encontrado. Ajuste o caminho e rode de novo." -ForegroundColor Red
    Write-Host "Dica: Get-ChildItem -Recurse -Filter AgendaPage.tsx" -ForegroundColor Yellow
    exit 1
}

$backup = "$path.backup_fase4_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

# 1) Renomeia a constante fixa para PADRAO (fallback) e adiciona a funcao que monta a grade dinamica
$old1 = "const HORARIOS = ['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00'];"
$new1 = @"
const HORARIOS_PADRAO = ['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00'];

function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function toHHMM(min: number) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
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
if ($content.Contains((Normalize $old1))) {
    $content = $content.Replace((Normalize $old1), (Normalize $new1))
    Write-Host "1) Constante HORARIOS_PADRAO + funcao buildHorarios adicionadas." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 1 (const HORARIOS) nao encontrado." -ForegroundColor Yellow
}

# 2) Adiciona estados de horarios dinamicos e dias abertos
$old2 = "  const [searchClient, setSearchClient] = useState('');"
$new2 = @"
  const [searchClient, setSearchClient] = useState('');
  const [horarios, setHorarios] = useState<string[]>(HORARIOS_PADRAO);
  const [diasAbertos, setDiasAbertos] = useState<number[] | null>(null);
"@
if ($content.Contains((Normalize $old2))) {
    $content = $content.Replace((Normalize $old2), (Normalize $new2))
    Write-Host "2) Estados horarios/diasAbertos adicionados." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 2 (useState searchClient) nao encontrado." -ForegroundColor Yellow
}

# 3) Busca clinic_settings junto com professionals/customers
$old3 = @"
  useEffect(() => {
    if (!tenantId) return;
    loadConsultas();
    supabase.from('professionals').select('id,name,specialty').eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setProfessionals(data || []));
    fetchAllRows<{id:string;name:string}>((from, to) => supabase.from('customers').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name').range(from, to))
      .then(data => setCustomers(data || []));
  }, [tenantId, weekStart, weekEnd]);
"@
$new3 = @"
  useEffect(() => {
    if (!tenantId) return;
    loadConsultas();
    supabase.from('professionals').select('id,name,specialty').eq('tenant_id', tenantId).eq('active', true).order('name')
      .then(({ data }) => setProfessionals(data || []));
    fetchAllRows<{id:string;name:string}>((from, to) => supabase.from('customers').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name').range(from, to))
      .then(data => setCustomers(data || []));
    supabase.from('clinic_settings').select('horario_inicio,horario_fim,dias_semana,possui_intervalo,intervalo_inicio,intervalo_fim').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setHorarios(buildHorarios(data.horario_inicio, data.horario_fim, data.possui_intervalo, data.intervalo_inicio, data.intervalo_fim));
          setDiasAbertos(Array.isArray(data.dias_semana) ? data.dias_semana : null);
        }
      });
  }, [tenantId, weekStart, weekEnd]);
"@
if ($content.Contains((Normalize $old3))) {
    $content = $content.Replace((Normalize $old3), (Normalize $new3))
    Write-Host "3) Busca de clinic_settings adicionada." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 3 (useEffect load) nao encontrado." -ForegroundColor Yellow
}

# 4) Cabecalho dos dias: marca "Fechado" quando o dia nao esta em dias_semana
$old4 = "                    {count > 0 && <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, marginTop: 2 }}>{count} consulta{count > 1 ? 's' : ''}</div>}"
$new4 = @"
                    {count > 0 && <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, marginTop: 2 }}>{count} consulta{count > 1 ? 's' : ''}</div>}
                    {diasAbertos !== null && !diasAbertos.includes(d.getDay()) && <div style={{ fontSize: 10, color: '#f87171', fontWeight: 600, marginTop: 2 }}>Fechado</div>}
"@
if ($content.Contains((Normalize $old4))) {
    $content = $content.Replace((Normalize $old4), (Normalize $new4))
    Write-Host "4) Marcacao de dia fechado no cabecalho adicionada." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 4 (contador de consultas no cabecalho) nao encontrado." -ForegroundColor Yellow
}

# 5) Corpo da tabela: usa a grade dinamica em vez da fixa
$old5 = "            {HORARIOS.map(hora => ("
$new5 = "            {horarios.map(hora => ("
if ($content.Contains((Normalize $old5))) {
    $content = $content.Replace((Normalize $old5), (Normalize $new5))
    Write-Host "5) Corpo da grade usando horarios dinamicos." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 5 (HORARIOS.map linha da grade) nao encontrado." -ForegroundColor Yellow
}

# 6) Modal - selects de horario inicio/fim usando a grade dinamica (duas ocorrencias)
$old6a = @"
                  <select className="form-input" value={form.time} onChange={e => set('time', e.target.value)}>
                    {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
"@
$new6a = @"
                  <select className="form-input" value={form.time} onChange={e => set('time', e.target.value)}>
                    {horarios.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
"@
if ($content.Contains((Normalize $old6a))) {
    $content = $content.Replace((Normalize $old6a), (Normalize $new6a))
    Write-Host "6a) Select de horario de inicio usando grade dinamica." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 6a (select horario inicio) nao encontrado." -ForegroundColor Yellow
}

$old6b = @"
                  <select className="form-input" value={form.time_end} onChange={e => set('time_end', e.target.value)}>
                    {HORARIOS.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
"@
$new6b = @"
                  <select className="form-input" value={form.time_end} onChange={e => set('time_end', e.target.value)}>
                    {horarios.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
"@
if ($content.Contains((Normalize $old6b))) {
    $content = $content.Replace((Normalize $old6b), (Normalize $new6b))
    Write-Host "6b) Select de horario de fim usando grade dinamica." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 6b (select horario fim) nao encontrado." -ForegroundColor Yellow
}

# 7) Aviso no formulario se a data escolhida cai num dia fechado (nao bloqueia, so avisa)
$old7 = @"
                <label className="form-label">Data *</label>
                <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
"@
$new7 = @"
                <label className="form-label">Data *</label>
                <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
                {diasAbertos !== null && form.date && !diasAbertos.includes(new Date(form.date + 'T12:00:00').getDay()) && (
                  <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>⚠ A loja normalmente nao abre neste dia. Pode agendar assim mesmo se for uma excecao.</div>
                )}
"@
if ($content.Contains((Normalize $old7))) {
    $content = $content.Replace((Normalize $old7), (Normalize $new7))
    Write-Host "7) Aviso de dia fechado no formulario adicionado." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 7 (campo Data do formulario) nao encontrado." -ForegroundColor Yellow
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Se algum AVISO apareceu, cole aqui o trecho real do arquivo (10 linhas ao redor) para eu ajustar." -ForegroundColor Cyan
Write-Host "Se tudo correu bem, rode: npm run build" -ForegroundColor Cyan
