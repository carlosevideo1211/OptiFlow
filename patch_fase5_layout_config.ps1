# =====================================================================
# Fase 5 (opcao A) - AtendimentoPage.tsx passa a ler clinic_settings.
# ficha_layout: reordena e esconde as secoes reais conforme configurado
# na Fase 1, e usa o rodape configurado (com placeholders) nos
# documentos impressos.
#
# Rode a partir de D:\optiflow.
# =====================================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize($text) { return $text -replace "`r`n", "`n" }
function Denormalize($text) { return $text -replace "`n", "`r`n" }

$path = "src\pages\consulta\AtendimentoPage.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ERRO: $path nao encontrado. Ajuste o caminho e rode de novo." -ForegroundColor Red
    Write-Host "Dica: Get-ChildItem -Recurse -Filter AtendimentoPage.tsx" -ForegroundColor Yellow
    exit 1
}

$backup = "$path.backup_fase5_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

# 1) AccordionSection ganha suporte a order/hidden
$old1 = @"
function AccordionSection({ id, label, open, toggle, children }: {
  id: Accordion; label: string; open: boolean;
  toggle: (id: Accordion) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
"@
$new1 = @"
function AccordionSection({ id, label, open, toggle, children, order, hidden }: {
  id: Accordion; label: string; open: boolean;
  toggle: (id: Accordion) => void; children: React.ReactNode;
  order?: number; hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div style={{ borderBottom: '1px solid var(--border)', order }}>
"@
if ($content.Contains((Normalize $old1))) {
    $content = $content.Replace((Normalize $old1), (Normalize $new1))
    Write-Host "1) AccordionSection aceita order/hidden." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 1 (definicao de AccordionSection) nao encontrado." -ForegroundColor Yellow
}

# 2) Mapa de secoes configuraveis -> ids reais implementados (null = nao existe ainda)
$old2 = @"
  const [open, setOpen] = useState<Record<Accordion, boolean>>({
    anamnese: false, ult_prescricao: false, acuidade: false, biomicroscopia: false,
    ceratometria: false, tonometria: false, forometria: false, oftalmoscopia: false,
    retin_din: false, retin_est: false, aval_motora: false, rx_final: true,
    amplitude: false, afinamento: false, dx: false, flexibilidade: false,
    adicao: false, ppc: false, reflexos: false, reservas: false,
    subjetivo: false, ambulatorial: false
  });
"@
$new2 = @"
  const [open, setOpen] = useState<Record<Accordion, boolean>>({
    anamnese: false, ult_prescricao: false, acuidade: false, biomicroscopia: false,
    ceratometria: false, tonometria: false, forometria: false, oftalmoscopia: false,
    retin_din: false, retin_est: false, aval_motora: false, rx_final: true,
    amplitude: false, afinamento: false, dx: false, flexibilidade: false,
    adicao: false, ppc: false, reflexos: false, reservas: false,
    subjetivo: false, ambulatorial: false
  });
  const [secaoOrder, setSecaoOrder] = useState<Accordion[]>([]);
  const [rodapeConfig, setRodapeConfig] = useState<{ ativo: boolean; html: string }>({ ativo: false, html: '' });
  const secOrder = (a: Accordion) => { const i = secaoOrder.indexOf(a); return i === -1 ? 999 : i; };
  const secVisible = (a: Accordion) => secaoOrder.length === 0 || secaoOrder.includes(a);
"@
if ($content.Contains((Normalize $old2))) {
    $content = $content.Replace((Normalize $old2), (Normalize $new2))
    Write-Host "2) Estados secaoOrder/rodapeConfig + helpers adicionados." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 2 (useState open) nao encontrado." -ForegroundColor Yellow
}

# 3) Busca do ficha_layout configurado na Fase 1
$old3 = @"
  useEffect(() => {
    if (!tenantId) return;
    if (isNew) {
"@
$new3 = @"
  useEffect(() => {
    if (!tenantId) return;
    const SECAO_KEY_MAP: Record<string, Accordion | null> = {
      secao_1: 'anamnese', secao_2: 'ult_prescricao', secao_3: 'acuidade', secao_4: 'biomicroscopia',
      secao_5: 'ceratometria', secao_6: 'tonometria', secao_7: 'forometria', secao_8: 'oftalmoscopia',
      secao_9: 'retin_din', secao_10: 'retin_est', secao_11: null, secao_12: 'rx_final',
      secao_13: null, secao_14: null, secao_15: 'dx', secao_16: null, secao_17: null,
      secao_18: null, secao_19: null, secao_20: null, secao_21: null, secao_22: null,
    };
    supabase.from('clinic_settings').select('ficha_layout').eq('tenant_id', tenantId).maybeSingle()
      .then(({ data }) => {
        const fl = (data as any)?.ficha_layout;
        if (fl && Array.isArray(fl.secoes)) {
          const ordem = fl.secoes.filter((s: any) => s.ativo).map((s: any) => SECAO_KEY_MAP[s.key]).filter(Boolean) as Accordion[];
          setSecaoOrder(ordem);
          setRodapeConfig({ ativo: !!fl.rodape_ativo, html: fl.rodape_html || '' });
        }
      });
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    if (isNew) {
"@
if ($content.Contains((Normalize $old3))) {
    $content = $content.Replace((Normalize $old3), (Normalize $new3))
    Write-Host "3) Busca de ficha_layout adicionada (useEffect separado)." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 3 (useEffect isNew) nao encontrado." -ForegroundColor Yellow
}

# 4) Container flex em volta das 12 secoes reais (necessario para CSS order funcionar)
$old4 = @"
              <div style={{ margin: '12px 16px', padding: '10px 14px', background: 'rgba(99,102,241,.08)', borderLeft: '3px solid #6366f1', borderRadius: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                <strong style={{ color: '#a5b4fc' }}>Formato obrigatório:</strong> ESF com sinal (+0,50 / -0,50) · CIL sempre negativo (-1,00) · EIXO entre 1–180 · Adição sem sinal (2,75)
              </div>

              <AccordionSection id="anamnese" label="Anamnese" open={open.anamnese} toggle={toggle}>
"@
$new4 = @"
              <div style={{ margin: '12px 16px', padding: '10px 14px', background: 'rgba(99,102,241,.08)', borderLeft: '3px solid #6366f1', borderRadius: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                <strong style={{ color: '#a5b4fc' }}>Formato obrigatório:</strong> ESF com sinal (+0,50 / -0,50) · CIL sempre negativo (-1,00) · EIXO entre 1–180 · Adição sem sinal (2,75)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>

              <AccordionSection id="anamnese" label="Anamnese" open={open.anamnese} toggle={toggle} order={secOrder('anamnese')} hidden={!secVisible('anamnese')}>
"@
if ($content.Contains((Normalize $old4))) {
    $content = $content.Replace((Normalize $old4), (Normalize $new4))
    Write-Host "4) Container flex aberto antes de Anamnese." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 4 (banner Formato obrigatorio) nao encontrado." -ForegroundColor Yellow
}

# 5) order/hidden nas demais 11 secoes reais
$pares = @(
  @{ old = "<AccordionSection id=`"ult_prescricao`" label=`"Prescrição do Último Exame`" open={open.ult_prescricao} toggle={toggle}>"; new = "<AccordionSection id=`"ult_prescricao`" label=`"Prescrição do Último Exame`" open={open.ult_prescricao} toggle={toggle} order={secOrder('ult_prescricao')} hidden={!secVisible('ult_prescricao')}>" },
  @{ old = "<AccordionSection id=`"acuidade`" label=`"Acuidade Visual`" open={open.acuidade} toggle={toggle}>"; new = "<AccordionSection id=`"acuidade`" label=`"Acuidade Visual`" open={open.acuidade} toggle={toggle} order={secOrder('acuidade')} hidden={!secVisible('acuidade')}>" },
  @{ old = "<AccordionSection id=`"biomicroscopia`" label=`"Biomicroscopia`" open={open.biomicroscopia} toggle={toggle}>"; new = "<AccordionSection id=`"biomicroscopia`" label=`"Biomicroscopia`" open={open.biomicroscopia} toggle={toggle} order={secOrder('biomicroscopia')} hidden={!secVisible('biomicroscopia')}>" },
  @{ old = "<AccordionSection id=`"ceratometria`" label=`"Ceratometria`" open={open.ceratometria} toggle={toggle}>"; new = "<AccordionSection id=`"ceratometria`" label=`"Ceratometria`" open={open.ceratometria} toggle={toggle} order={secOrder('ceratometria')} hidden={!secVisible('ceratometria')}>" },
  @{ old = "<AccordionSection id=`"tonometria`" label=`"Tonometria`" open={open.tonometria} toggle={toggle}>"; new = "<AccordionSection id=`"tonometria`" label=`"Tonometria`" open={open.tonometria} toggle={toggle} order={secOrder('tonometria')} hidden={!secVisible('tonometria')}>" },
  @{ old = "<AccordionSection id=`"forometria`" label=`"Forometria`" open={open.forometria} toggle={toggle}>"; new = "<AccordionSection id=`"forometria`" label=`"Forometria`" open={open.forometria} toggle={toggle} order={secOrder('forometria')} hidden={!secVisible('forometria')}>" },
  @{ old = "<AccordionSection id=`"oftalmoscopia`" label=`"Oftalmoscopia`" open={open.oftalmoscopia} toggle={toggle}>"; new = "<AccordionSection id=`"oftalmoscopia`" label=`"Oftalmoscopia`" open={open.oftalmoscopia} toggle={toggle} order={secOrder('oftalmoscopia')} hidden={!secVisible('oftalmoscopia')}>" },
  @{ old = "<AccordionSection id=`"retin_din`" label=`"Retinoscopia Dinâmica`" open={open.retin_din} toggle={toggle}>"; new = "<AccordionSection id=`"retin_din`" label=`"Retinoscopia Dinâmica`" open={open.retin_din} toggle={toggle} order={secOrder('retin_din')} hidden={!secVisible('retin_din')}>" },
  @{ old = "<AccordionSection id=`"retin_est`" label=`"Retinoscopia Estática`" open={open.retin_est} toggle={toggle}>"; new = "<AccordionSection id=`"retin_est`" label=`"Retinoscopia Estática`" open={open.retin_est} toggle={toggle} order={secOrder('retin_est')} hidden={!secVisible('retin_est')}>" },
  @{ old = "<AccordionSection id=`"rx_final`" label=`"RX Final`" open={open.rx_final} toggle={toggle}>"; new = "<AccordionSection id=`"rx_final`" label=`"RX Final`" open={open.rx_final} toggle={toggle} order={secOrder('rx_final')} hidden={!secVisible('rx_final')}>" },
  @{ old = "<AccordionSection id=`"dx`" label=`"DX`" open={open.dx} toggle={toggle}>"; new = "<AccordionSection id=`"dx`" label=`"DX`" open={open.dx} toggle={toggle} order={secOrder('dx')} hidden={!secVisible('dx')}>" }
)
$contador = 5
foreach ($p in $pares) {
    if ($content.Contains((Normalize $p.old))) {
        $content = $content.Replace((Normalize $p.old), (Normalize $p.new))
        Write-Host "$contador) order/hidden aplicado." -ForegroundColor Green
    } else {
        Write-Host "AVISO: trecho $contador nao encontrado: $($p.old.Substring(0,50))..." -ForegroundColor Yellow
    }
    $contador++
}

# 6) Fecha o container flex logo apos a secao DX, antes da barra de botoes final
$old6 = @"
                <Field label="Obs."><FTextarea value={dxObs} onChange={setDxObs} rows={3} /></Field>
              </AccordionSection>

              <div style={{ padding: '20px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
"@
$new6 = @"
                <Field label="Obs."><FTextarea value={dxObs} onChange={setDxObs} rows={3} /></Field>
              </AccordionSection>

              </div>

              <div style={{ padding: '20px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
"@
if ($content.Contains((Normalize $old6))) {
    $content = $content.Replace((Normalize $old6), (Normalize $new6))
    Write-Host "16) Container flex fechado apos DX." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 16 (fechamento apos DX) nao encontrado." -ForegroundColor Yellow
}

# 7) Rodape dos documentos passa a usar o texto configurado (com placeholders) quando existir
$old7 = @'
  const rodapeDoc = (cidade: string, dt: string) => `
    <div style="position:fixed; bottom:40px; left:40px; right:40px; border-top:1px solid #ccc; padding-top:8px; font-size:9px; color:#888; text-align:center; line-height:1.5;">
      O presente exame realizado pelo optometrista tem por finalidade a correção dos defeitos refrativos, a avaliação sensorial e motora, através da indicação de lentes corretivas e/ou exercícios ortópticos. O diagnóstico de doenças oculares e seu tratamento são de competência do profissional médico.
      <br/><div style="margin-top:4px; border-top:1px solid #ddd; padding-top:4px;">${docCidade || cidade}</div>
    </div>`;
'@
$new7 = @'
  const rodapeDoc = (cidade: string, dt: string) => {
    if (rodapeConfig.ativo && rodapeConfig.html) {
      const hoje = new Date();
      const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
      const prof = docProfissional || consultation?.professional_name || '';
      const htmlFinal = rodapeConfig.html
        .replace(/\{profissional\.nome\}/g, prof)
        .replace(/\{profissional\.conselho\}/g, '')
        .replace(/\{clinica\.cidade\}/g, docCidade || cidade)
        .replace(/\{dia\}/g, String(hoje.getDate()))
        .replace(/\{mes\}/g, meses[hoje.getMonth()])
        .replace(/\{ano\}/g, String(hoje.getFullYear()));
      return `<div style="position:fixed; bottom:40px; left:40px; right:40px; border-top:1px solid #ccc; padding-top:8px; font-size:10px; color:#888; text-align:center; line-height:1.5;">${htmlFinal}</div>`;
    }
    return `
    <div style="position:fixed; bottom:40px; left:40px; right:40px; border-top:1px solid #ccc; padding-top:8px; font-size:9px; color:#888; text-align:center; line-height:1.5;">
      O presente exame realizado pelo optometrista tem por finalidade a correção dos defeitos refrativos, a avaliação sensorial e motora, através da indicação de lentes corretivas e/ou exercícios ortópticos. O diagnóstico de doenças oculares e seu tratamento são de competência do profissional médico.
      <br/><div style="margin-top:4px; border-top:1px solid #ddd; padding-top:4px;">${docCidade || cidade}</div>
    </div>`;
  };
'@
if ($content.Contains((Normalize $old7))) {
    $content = $content.Replace((Normalize $old7), (Normalize $new7))
    Write-Host "17) rodapeDoc agora usa o texto configurado quando existir." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 17 (funcao rodapeDoc) nao encontrado." -ForegroundColor Yellow
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Se algum AVISO apareceu, cole aqui o trecho real do arquivo (10 linhas ao redor) para eu ajustar." -ForegroundColor Cyan
Write-Host "Se tudo correu bem, rode: npm run build" -ForegroundColor Cyan
