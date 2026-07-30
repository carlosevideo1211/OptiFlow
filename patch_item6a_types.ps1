$ErrorActionPreference = "Stop"
$path = "D:\\optiflow\\src\\types\\index.ts"
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
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ZXhwb3J0IGludGVyZmFjZSBVc2VyUHJvZmlsZSB7CiAgaWQ6IHN0cmluZzsKICB0ZW5hbnRfaWQ6IHN0cmluZzsKICBmdWxsX25hbWU6IHN0cmluZzsKICBlbWFpbDogc3RyaW5nOwogIHJvbGU6ICdtYXN0ZXInIHwgJ29wdG9tZXRyaXN0YScgfCAnYXRlbmRlbnRlJyB8ICdjYWl4YScgfCAnc3lzdGVtX2FkbWluJzsKICBhY3RpdmU6IGJvb2xlYW47CiAgY3JtPzogc3RyaW5nOwogIHNwZWNpYWx0eT86IHN0cmluZzsKICBhdmF0YXJfdXJsPzogc3RyaW5nOwp9'))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ZXhwb3J0IGludGVyZmFjZSBVc2VyUHJvZmlsZSB7CiAgaWQ6IHN0cmluZzsKICB0ZW5hbnRfaWQ6IHN0cmluZzsKICBmdWxsX25hbWU6IHN0cmluZzsKICBlbWFpbDogc3RyaW5nOwogIC8vIEFjZWl0YSB0YW1iw6ltIG8gdmFsb3IgbGl2cmUgZGUgZnVuY2lvbmFyaW9zLmNhcmdvIChleDogJ1ZlbmRlZG9yKGEpJywgJ0dlcmVudGUnKQogIC8vIGRlc2RlIGEgRmFzZSBBIGRvIGl0ZW0gNiwgcXVhbmRvIGZ1bmNpb27DoXJpbyBwYXNzb3UgYSB0ZXIgcGVyZmlsIHByw7NwcmlvLgogIHJvbGU6ICdtYXN0ZXInIHwgJ29wdG9tZXRyaXN0YScgfCAnYXRlbmRlbnRlJyB8ICdjYWl4YScgfCAnc3lzdGVtX2FkbWluJyB8IHN0cmluZzsKICBhY3RpdmU6IGJvb2xlYW47CiAgY3JtPzogc3RyaW5nOwogIHNwZWNpYWx0eT86IHN0cmluZzsKICBhdmF0YXJfdXJsPzogc3RyaW5nOwogIGZ1bmNpb25hcmlvX2lkPzogc3RyaW5nOwp9'))
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

Write-Host "types/index.ts atualizado: UserProfile aceita cargo livre e funcionario_id."
Write-Host "Rode: npm run build"