# =====================================================================
# Patch: adiciona botao "Boleto: On/Off" na tabela de tenants do
# AdminPanelPage.tsx, permitindo ligar/desligar boleto_habilitado
# por loja com um clique, sem precisar de SQL manual.
#
# Rode a partir de D:\optiflow.
# =====================================================================

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Normalize($text) { return $text -replace "`r`n", "`n" }
function Denormalize($text) { return $text -replace "`n", "`r`n" }

$path = "src\pages\admin\AdminPanelPage.tsx"

if (-not (Test-Path $path)) {
    Write-Host "ERRO: $path nao encontrado. Ajuste o caminho e rode de novo." -ForegroundColor Red
    Write-Host "Dica: Get-ChildItem -Recurse -Filter AdminPanelPage.tsx" -ForegroundColor Yellow
    exit 1
}

$backup = "$path.backup_$timestamp"
Copy-Item -Path $path -Destination $backup -Force
Write-Host "Backup criado: $backup"

$raw = Get-Content -Path $path -Raw -Encoding UTF8
$content = Normalize $raw

# 1) Adiciona boleto_habilitado na interface Tenant
$old1 = Normalize @"
interface Tenant {
  id: string;
  company_name: string;
  email: string;
  phone?: string;
  plan: Plan;
  status: string;
  trial_end_date?: string;
  next_billing?: string;
  mrr_value?: number;
  city?: string;
  state?: string;
  created_at: string;
}
"@
$new1 = Normalize @"
interface Tenant {
  id: string;
  company_name: string;
  email: string;
  phone?: string;
  plan: Plan;
  status: string;
  trial_end_date?: string;
  next_billing?: string;
  mrr_value?: number;
  city?: string;
  state?: string;
  created_at: string;
  boleto_habilitado?: boolean;
}
"@
if ($content.Contains($old1)) {
    $content = $content.Replace($old1, $new1)
    Write-Host "1) Campo boleto_habilitado adicionado na interface Tenant." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 1 (interface Tenant) nao encontrado." -ForegroundColor Yellow
}

# 2) Adiciona a funcao de toggle, logo apos a funcao excluir()
$old2 = Normalize @"
  const excluir = async (t: Tenant) => {
    if (!confirm('Excluir '+t.company_name+'? Isso nao pode ser desfeito.')) return;
    await supabase.from('tenants').delete().eq('id', t.id);
    setTenants(prev=>prev.filter(x=>x.id!==t.id));
    toast.success('Tenant excluido');
  };
"@
$new2 = Normalize @"
  const excluir = async (t: Tenant) => {
    if (!confirm('Excluir '+t.company_name+'? Isso nao pode ser desfeito.')) return;
    await supabase.from('tenants').delete().eq('id', t.id);
    setTenants(prev=>prev.filter(x=>x.id!==t.id));
    toast.success('Tenant excluido');
  };

  const toggleBoleto = async (t: Tenant) => {
    const novoValor = !t.boleto_habilitado;
    setUpdating(t.id);
    const { error } = await supabase.from('tenants').update({ boleto_habilitado: novoValor }).eq('id', t.id);
    setUpdating(null);
    if (error) { toast.error('Erro ao atualizar boleto: '+error.message); return; }
    setTenants(prev => prev.map(x => x.id===t.id ? {...x, boleto_habilitado: novoValor} : x));
    toast.success(novoValor ? 'Boleto habilitado para '+t.company_name : 'Boleto desabilitado para '+t.company_name);
  };
"@
if ($content.Contains($old2)) {
    $content = $content.Replace($old2, $new2)
    Write-Host "2) Funcao toggleBoleto adicionada." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 2 (funcao excluir) nao encontrado." -ForegroundColor Yellow
}

# 3) Adiciona o botao na coluna de Acoes, entre "Contrato" e "Acessar Loja"
$old3 = Normalize @"
   <button onClick={()=>window.open('/contrato/'+t.id,'_blank')} title="Contrato"
                        style={{background:'rgba(59,130,246,.1)',border:'1px solid rgba(59,130,246,.2)',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#3b82f6',display:'flex',alignItems:'center',marginRight:4}}>
                        <span style={{fontSize:12}}>Contrato</span>
                      </button>
                      <button onClick={()=>acessarLoja(t.id)} title="Acessar Loja"
"@
$new3 = Normalize @"
   <button onClick={()=>window.open('/contrato/'+t.id,'_blank')} title="Contrato"
                        style={{background:'rgba(59,130,246,.1)',border:'1px solid rgba(59,130,246,.2)',borderRadius:6,padding:'5px 8px',cursor:'pointer',color:'#3b82f6',display:'flex',alignItems:'center',marginRight:4}}>
                        <span style={{fontSize:12}}>Contrato</span>
                      </button>
                      <button onClick={()=>toggleBoleto(t)} title={t.boleto_habilitado ? 'Clique para desabilitar boleto' : 'Clique para habilitar boleto'}
                        disabled={updating===t.id}
                        style={{
                          background: t.boleto_habilitado ? 'rgba(34,197,94,.1)' : 'rgba(148,163,184,.1)',
                          border: t.boleto_habilitado ? '1px solid rgba(34,197,94,.3)' : '1px solid rgba(148,163,184,.3)',
                          borderRadius:6, padding:'5px 8px', cursor:'pointer',
                          color: t.boleto_habilitado ? '#22c55e' : '#94a3b8',
                          display:'flex', alignItems:'center', marginRight:4, fontSize:12, fontWeight:700
                        }}>
                        Boleto: {t.boleto_habilitado ? 'On' : 'Off'}
                      </button>
                      <button onClick={()=>acessarLoja(t.id)} title="Acessar Loja"
"@
if ($content.Contains($old3)) {
    $content = $content.Replace($old3, $new3)
    Write-Host "3) Botao 'Boleto: On/Off' adicionado na coluna de Acoes." -ForegroundColor Green
} else {
    Write-Host "AVISO: trecho 3 (botao Contrato/Acessar Loja) nao encontrado." -ForegroundColor Yellow
}

$final = Denormalize $content
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $path), $final, $utf8NoBom)
Write-Host "$path salvo." -ForegroundColor Green
Write-Host ""
Write-Host "Se algum AVISO apareceu, cole aqui o trecho real do arquivo para eu ajustar." -ForegroundColor Cyan
Write-Host "Se tudo correu bem, rode: npm run build" -ForegroundColor Cyan
