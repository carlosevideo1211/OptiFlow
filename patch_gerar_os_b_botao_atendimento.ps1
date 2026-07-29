$ErrorActionPreference = "Stop"
$path = "D:\\optiflow\\src\\pages\\consulta\\AtendimentoPage.tsx"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$path.bak_$stamp"
Copy-Item $path $backup
Write-Host "Backup criado em $backup"

$bytes = [System.IO.File]::ReadAllBytes($path)
$hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
$rawContent = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$hadCRLF = $rawContent.Contains("`r`n")
$content = $rawContent -replace "`r`n", "`n"

# --- Bloco 1 ---
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('aW1wb3J0IHsKICBFeWUsIENsaXBib2FyZExpc3QsIEZpbGVUZXh0LCBDaGV2cm9uRG93biwgQ2hldnJvblVwLAogIFNhdmUsIFByaW50ZXIsIEFycm93TGVmdCwgQ2hlY2tDaXJjbGUsIFVzZXIsIEhpc3RvcnkKfSBmcm9tICdsdWNpZGUtcmVhY3QnOw=='))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('aW1wb3J0IHsKICBFeWUsIENsaXBib2FyZExpc3QsIEZpbGVUZXh0LCBDaGV2cm9uRG93biwgQ2hldnJvblVwLAogIFNhdmUsIFByaW50ZXIsIEFycm93TGVmdCwgQ2hlY2tDaXJjbGUsIFVzZXIsIEhpc3RvcnksIFNob3BwaW5nQmFnCn0gZnJvbSAnbHVjaWRlLXJlYWN0Jzs='))
if ($content.IndexOf($old1) -lt 0) { throw "Bloco 1 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old1, $new1)

# --- Bloco 2 ---
$old2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPSJidG4gYnRuLXNlY29uZGFyeSIgb25DbGljaz17KCkgPT4geyBjb25zdCBjaWQgPSBjb25zdWx0YXRpb24/LmN1c3RvbWVyX2lkIHx8IG5ld0RhdGE/LmN1c3RvbWVySWQ7IGlmIChjaWQpIG5hdmlnYXRlKCcvY29uc3VsdGEvcHJvbnR1YXJpby8nICsgY2lkKTsgZWxzZSB0b2FzdC5lcnJvcignUGFjaWVudGUgbsOjbyBpZGVudGlmaWNhZG8nKTsgfX0gc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywgZ2FwOiA2IH19PjxGaWxlVGV4dCBzaXplPXsxNH0gLz4gUHJvbnR1w6FyaW88L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPSJidG4gYnRuLXByaW1hcnkiIG9uQ2xpY2s9eygpID0+IGhhbmRsZVNhdmUodHJ1ZSl9IGRpc2FibGVkPXtzYXZpbmd9IHN0eWxlPXt7IGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGdhcDogNiB9fT4='))
$new2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPSJidG4gYnRuLXNlY29uZGFyeSIgb25DbGljaz17KCkgPT4geyBjb25zdCBjaWQgPSBjb25zdWx0YXRpb24/LmN1c3RvbWVyX2lkIHx8IG5ld0RhdGE/LmN1c3RvbWVySWQ7IGlmIChjaWQpIG5hdmlnYXRlKCcvY29uc3VsdGEvcHJvbnR1YXJpby8nICsgY2lkKTsgZWxzZSB0b2FzdC5lcnJvcignUGFjaWVudGUgbsOjbyBpZGVudGlmaWNhZG8nKTsgfX0gc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywgZ2FwOiA2IH19PjxGaWxlVGV4dCBzaXplPXsxNH0gLz4gUHJvbnR1w6FyaW88L2J1dHRvbj4KICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPSJidG4gYnRuLXNlY29uZGFyeSIgb25DbGljaz17KCkgPT4gbmF2aWdhdGUoJy9vcycsIHsgc3RhdGU6IHsgcHJlZmlsbENvbnN1bHRhdGlvbklkOiBpZCB9IH0pfSBzdHlsZT17eyBkaXNwbGF5OiAnZmxleCcsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBnYXA6IDYgfX0+PFNob3BwaW5nQmFnIHNpemU9ezE0fSAvPiBHZXJhciBPUzwvYnV0dG9uPgogICAgICAgICAgPGJ1dHRvbiBjbGFzc05hbWU9ImJ0biBidG4tcHJpbWFyeSIgb25DbGljaz17KCkgPT4gaGFuZGxlU2F2ZSh0cnVlKX0gZGlzYWJsZWQ9e3NhdmluZ30gc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywgZ2FwOiA2IH19Pg=='))
if ($content.IndexOf($old2) -lt 0) { throw "Bloco 2 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old2, $new2)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }

if ($hasBom) {
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($path, $content, $utf8Bom)
} else {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

Write-Host "AtendimentoPage.tsx atualizado: botao Gerar OS adicionado ao topo, ao lado de Finalizar atendimento."
Write-Host "Rode: npm run build"