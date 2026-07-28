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
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIGNvbnN0IGVudHJpZXM6IGFueVtdID0gW3sKICAgICAgdGVuYW50X2lkOiB0ZW5hbnRJZCwgdHlwZTogJ3JlY2VpdGEnLCBjYXRlZ29yeTogJ2NvbnN1bHRhJywKICAgICAgZGVzY3JpcHRpb246ICdSZWNlaXRhIGRlIGF0ZW5kaW1lbnRvJywgYW1vdW50OiB2YWxvciwKICAgICAgZHVlX2RhdGU6IGRhdGUgfHwgbnVsbCwgc3RhdHVzOiAncGVuZGVudGUnLAogICAgICBjb25zdWx0YXRpb25faWQ6IGNvbnN1bHRhdGlvbklkLCBwYXJ0bmVyc2hpcF9pZDogcGFydG5lcnNoaXBJZCB8fCBudWxsLAogICAgICBwcm9jZWR1cmVfaWQ6IGNvbnN1bHRhdGlvbj8ucHJvY2VkdXJlX2lkIHx8IG51bGwsCiAgICB9XTs='))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIGNvbnN0IGVudHJpZXM6IGFueVtdID0gW3sKICAgICAgdGVuYW50X2lkOiB0ZW5hbnRJZCwgdHlwZTogJ3JlY2VpdGEnLCBjYXRlZ29yeTogJ2NvbnN1bHRhJywKICAgICAgZGVzY3JpcHRpb246ICdSZWNlaXRhIGRlIGF0ZW5kaW1lbnRvJywgYW1vdW50OiB2YWxvciwKICAgICAgZHVlX2RhdGU6IGRhdGUgfHwgbnVsbCwgc3RhdHVzOiAncGVuZGVudGUnLAogICAgICBjb25zdWx0YXRpb25faWQ6IGNvbnN1bHRhdGlvbklkLCBwYXJ0bmVyc2hpcF9pZDogcGFydG5lcnNoaXBJZCB8fCBudWxsLAogICAgICBwcm9jZWR1cmVfaWQ6IGNvbnN1bHRhdGlvbj8ucHJvY2VkdXJlX2lkIHx8IG51bGwsCiAgICAgIHByb2Zlc3Npb25hbF9pZDogY29uc3VsdGF0aW9uPy5wcm9mZXNzaW9uYWxfaWQgfHwgbnVsbCwKICAgIH1dOw=='))
if ($content.IndexOf($old1) -lt 0) { throw "Bloco 1 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old1, $new1)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }

if ($hasBom) {
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($path, $content, $utf8Bom)
} else {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

Write-Host "AtendimentoPage.tsx atualizado: receita agora tambem guarda professional_id, para o relatorio por profissional funcionar mesmo em consultas ja salvas antes desta fase (basta salvar de novo)."
Write-Host "Rode: npm run build"