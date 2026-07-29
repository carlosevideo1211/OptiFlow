$ErrorActionPreference = "Stop"
$path = "D:\optiflow\src\pages\consulta\RelatoriosOperacionais.tsx"
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
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('aW1wb3J0IHsgdXNlU3RhdGUsIHVzZUVmZmVjdCB9IGZyb20gJ3JlYWN0JzsKaW1wb3J0IHsgc3VwYWJhc2UgfSBmcm9tICcuLi8uLi9saWIvc3VwYWJhc2UnOwppbXBvcnQgeyB1c2VBdXRoIH0gZnJvbSAnLi4vLi4vY29udGV4dC9BdXRoQ29udGV4dCc7CmltcG9ydCB7IENha2UsIEFsZXJ0VHJpYW5nbGUsIERvbGxhclNpZ24sIE1lc3NhZ2VDaXJjbGUgfSBmcm9tICdsdWNpZGUtcmVhY3QnOw=='))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('aW1wb3J0IHsgdXNlU3RhdGUsIHVzZUVmZmVjdCB9IGZyb20gJ3JlYWN0JzsKaW1wb3J0IHsgc3VwYWJhc2UgfSBmcm9tICcuLi8uLi9saWIvc3VwYWJhc2UnOwppbXBvcnQgeyB1c2VBdXRoIH0gZnJvbSAnLi4vLi4vY29udGV4dC9BdXRoQ29udGV4dCc7CmltcG9ydCB7IGZldGNoQWxsUm93cyB9IGZyb20gJy4uLy4uL2xpYi9mZXRjaEFsbCc7CmltcG9ydCB7IENha2UsIEFsZXJ0VHJpYW5nbGUsIERvbGxhclNpZ24sIE1lc3NhZ2VDaXJjbGUgfSBmcm9tICdsdWNpZGUtcmVhY3QnOw=='))
if ($content.IndexOf($old1) -lt 0) { throw "Bloco 1 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old1, $new1)

# --- Bloco 2 ---
$old2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIGNvbnN0IHsgZGF0YTogdG9kYXNDb25zdWx0YXMgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oJ2NvbnN1bHRhdGlvbnMnKQogICAgICAuc2VsZWN0KCdjdXN0b21lcl9pZCwgY3VzdG9tZXJfbmFtZSwgZGF0ZSwgc3RhdHVzJykuZXEoJ3RlbmFudF9pZCcsIHRlbmFudElkKTs='))
$new2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIGNvbnN0IHRvZGFzQ29uc3VsdGFzID0gYXdhaXQgZmV0Y2hBbGxSb3dzPGFueT4oKHJmLCBydCkgPT4gc3VwYWJhc2UuZnJvbSgnY29uc3VsdGF0aW9ucycpCiAgICAgIC5zZWxlY3QoJ2N1c3RvbWVyX2lkLCBjdXN0b21lcl9uYW1lLCBkYXRlLCBzdGF0dXMnKS5lcSgndGVuYW50X2lkJywgdGVuYW50SWQpLnJhbmdlKHJmLCBydCkpOw=='))
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

Write-Host "RelatoriosOperacionais.tsx corrigido: busca de consultations agora usa fetchAllRows (paginacao completa), corrige nomes/telefones faltando em tenants com mais de 1000 consultas."
Write-Host "Rode: npm run build"