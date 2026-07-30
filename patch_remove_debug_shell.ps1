$ErrorActionPreference = "Stop"
$path = "D:\optiflow\src\components\Shell.tsx"
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
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgY29uc3QgeyBkYXRhOiB0ZW5hbnQsIGVycm9yOiB0ZW5hbnRFcnIgfSA9IGF3YWl0IHN1cGFiYXNlCiAgICAgICAgLmZyb20oJ3RlbmFudHMnKQogICAgICAgIC5zZWxlY3QoJ3RyaWFsX2VuZF9kYXRlLCBzdGF0dXMsIHBsYW4sIG1vZHVsb19jb25zdWx0YXNfYXRpdm8nKQogICAgICAgIC5lcSgnaWQnLCB0ZW5hbnRJZCkKICAgICAgICAuc2luZ2xlKCk7CiAgICAgIGNvbnNvbGUubG9nKCdbREVCVUcgU2hlbGxdIHRlbmFudElkIHVzYWRvIG5hIGJ1c2NhOicsIHRlbmFudElkKTsKICAgICAgY29uc29sZS5sb2coJ1tERUJVRyBTaGVsbF0gcmVzdWx0YWRvIHRlbmFudHM6JywgdGVuYW50LCAnZXJybzonLCB0ZW5hbnRFcnIpOwogICAgICBjb25zdCB7IGRhdGE6IHsgc2Vzc2lvbjogZGVidWdTZXNzaW9uIH0gfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguZ2V0U2Vzc2lvbigpOwogICAgICBjb25zb2xlLmxvZygnW0RFQlVHIFNoZWxsXSBzZXNzYW8gYXR1YWwgLSBpc19hbm9ueW1vdXM6JywgKGRlYnVnU2Vzc2lvbiBhcyBhbnkpPy51c2VyPy5pc19hbm9ueW1vdXMsICdyb2xlIGNsYWltOicsIChkZWJ1Z1Nlc3Npb24gYXMgYW55KT8udXNlcj8ucm9sZSk7'))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgY29uc3QgeyBkYXRhOiB0ZW5hbnQgfSA9IGF3YWl0IHN1cGFiYXNlCiAgICAgICAgLmZyb20oJ3RlbmFudHMnKQogICAgICAgIC5zZWxlY3QoJ3RyaWFsX2VuZF9kYXRlLCBzdGF0dXMsIHBsYW4sIG1vZHVsb19jb25zdWx0YXNfYXRpdm8nKQogICAgICAgIC5lcSgnaWQnLCB0ZW5hbnRJZCkKICAgICAgICAuc2luZ2xlKCk7'))
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

Write-Host "Shell.tsx limpo: logs de debug temporarios removidos."
Write-Host "Rode: npm run build"