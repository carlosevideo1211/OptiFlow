$ErrorActionPreference = "Stop"
$path = "D:\\optiflow\\src\\pages\\OrdemServicoPage.tsx"
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
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('aW1wb3J0IHsgdXNlU3RhdGUsIHVzZUVmZmVjdCwgdXNlTWVtbywgdXNlUmVmIH0gZnJvbSAncmVhY3QnOwppbXBvcnQgeyB1c2VBdXRoIH0gZnJvbSAnLi4vY29udGV4dC9BdXRoQ29udGV4dCc7'))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('aW1wb3J0IHsgdXNlU3RhdGUsIHVzZUVmZmVjdCwgdXNlTWVtbywgdXNlUmVmIH0gZnJvbSAncmVhY3QnOwppbXBvcnQgeyB1c2VMb2NhdGlvbiwgdXNlTmF2aWdhdGUgfSBmcm9tICdyZWFjdC1yb3V0ZXItZG9tJzsKaW1wb3J0IHsgdXNlQXV0aCB9IGZyb20gJy4uL2NvbnRleHQvQXV0aENvbnRleHQnOw=='))
if ($content.IndexOf($old1) -lt 0) { throw "Bloco 1 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old1, $new1)

# --- Bloco 2 ---
$old2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gT3JkZW1TZXJ2aWNvUGFnZSgpIHsKICBjb25zdCB7IHRlbmFudElkIH0gPSB1c2VBdXRoKCk7'))
$new2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gT3JkZW1TZXJ2aWNvUGFnZSgpIHsKICBjb25zdCB7IHRlbmFudElkIH0gPSB1c2VBdXRoKCk7CiAgY29uc3QgbG9jYXRpb24gPSB1c2VMb2NhdGlvbigpOwogIGNvbnN0IG5hdmlnYXRlID0gdXNlTmF2aWdhdGUoKTs='))
if ($content.IndexOf($old2) -lt 0) { throw "Bloco 2 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old2, $new2)

# --- Bloco 3 ---
$old3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICB1c2VFZmZlY3QoKCkgPT4geyBpZiAodGVuYW50SWQpIGxvYWQoKTsgfSwgW3RlbmFudElkXSk7'))
$new3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICB1c2VFZmZlY3QoKCkgPT4geyBpZiAodGVuYW50SWQpIGxvYWQoKTsgfSwgW3RlbmFudElkXSk7CgogIC8vIFBvbnRlIHZpbmRhIGRvIG3Ds2R1bG8gQ29uc3VsdGFzL1J4OiAiR2VyYXIgT1MgYSBwYXJ0aXIgZGEgcHJlc2NyacOnw6NvIgogIHVzZUVmZmVjdCgoKSA9PiB7CiAgICBjb25zdCBwcmVmaWxsSWQgPSAobG9jYXRpb24uc3RhdGUgYXMgYW55KT8ucHJlZmlsbENvbnN1bHRhdGlvbklkOwogICAgaWYgKCF0ZW5hbnRJZCB8fCAhcHJlZmlsbElkKSByZXR1cm47CiAgICAoYXN5bmMgKCkgPT4gewogICAgICBjb25zdCB7IGRhdGEgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oJ2NvbnN1bHRhdGlvbnMnKQogICAgICAgIC5zZWxlY3QoJ2lkLGRhdGUscHJvZmVzc2lvbmFsX25hbWUsY3VzdG9tZXJfaWQsY3VzdG9tZXJfbmFtZSxyeF9yZV9lc2YscnhfcmVfY2lsLHJ4X3JlX2VpeG8scnhfcmVfZG5wLHJ4X2xlX2VzZixyeF9sZV9jaWwscnhfbGVfZWl4byxyeF9sZV9kbnAscnhfYWRpY2FvLHJ4X3RpcG9fbGVudGUnKQogICAgICAgIC5lcSgnaWQnLCBwcmVmaWxsSWQpLmVxKCd0ZW5hbnRfaWQnLCB0ZW5hbnRJZCkubWF5YmVTaW5nbGUoKTsKICAgICAgaWYgKCFkYXRhKSB7IHRvYXN0LmVycm9yKCdDb25zdWx0YSBuw6NvIGVuY29udHJhZGEgcGFyYSBpbXBvcnRhciBhIHByZXNjcmnDp8OjbycpOyByZXR1cm47IH0KICAgICAgb3Blbk5ldygpOwogICAgICBzZXQoJ2N1c3RvbWVyX2lkJywgZGF0YS5jdXN0b21lcl9pZCB8fCAnJyk7CiAgICAgIHNldCgnY3VzdG9tZXJfbmFtZScsIGRhdGEuY3VzdG9tZXJfbmFtZSB8fCAnJyk7CiAgICAgIHByZWVuY2hlclJYKGRhdGEgYXMgYW55KTsKICAgICAgaWYgKGRhdGEuY3VzdG9tZXJfaWQpIGxvYWRDb25zdWx0YXRpb25zKGRhdGEuY3VzdG9tZXJfaWQpOwogICAgICBuYXZpZ2F0ZShsb2NhdGlvbi5wYXRobmFtZSwgeyByZXBsYWNlOiB0cnVlLCBzdGF0ZToge30gfSk7CiAgICB9KSgpOwogIH0sIFt0ZW5hbnRJZCwgbG9jYXRpb24uc3RhdGVdKTs='))
if ($content.IndexOf($old3) -lt 0) { throw "Bloco 3 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old3, $new3)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }

if ($hasBom) {
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($path, $content, $utf8Bom)
} else {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

Write-Host "OrdemServicoPage.tsx atualizado: le prefillConsultationId vindo da navegacao e abre a OS ja com cliente e RX importados."
Write-Host "Rode: npm run build"