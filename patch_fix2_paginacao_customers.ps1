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
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIGNvbnN0IHBhY2llbnRlc0lkcyA9IFsuLi5uZXcgU2V0KCh0b2Rhc0NvbnN1bHRhcyA/PyBbXSkubWFwKChyOiBhbnkpID0+IHIuY3VzdG9tZXJfaWQpLmZpbHRlcihCb29sZWFuKSldOwogICAgbGV0IGN1c3RvbWVyc01hcDogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9OwogICAgaWYgKHBhY2llbnRlc0lkcy5sZW5ndGggPiAwKSB7CiAgICAgIGNvbnN0IHsgZGF0YTogY3VzdG9tZXJzRGF0YSB9ID0gYXdhaXQgc3VwYWJhc2UuZnJvbSgnY3VzdG9tZXJzJykKICAgICAgICAuc2VsZWN0KCdpZCwgbmFtZSwgcGhvbmUsIHdoYXRzYXBwLCBiaXJ0aF9kYXRlJykuaW4oJ2lkJywgcGFjaWVudGVzSWRzKTsKICAgICAgKGN1c3RvbWVyc0RhdGEgPz8gW10pLmZvckVhY2goKGM6IGFueSkgPT4geyBjdXN0b21lcnNNYXBbYy5pZF0gPSBjOyB9KTsKICAgIH0='))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIC8vIEJ1c2NhIFRPRE9TIG9zIGNsaWVudGVzIGRvIHRlbmFudCAocGFnaW5hZG8pIGVtIHZleiBkZSBmaWx0cmFyIHBvciBsaXN0YSBkZSBJRHMg4oCUCiAgICAvLyBldml0YSB0YW50byBvIGxpbWl0ZSBkZSAxMDAwIGxpbmhhcyBxdWFudG8gbyBsaW1pdGUgZGUgdGFtYW5obyBkYSBVUkwgY29tIC5pbigpIGdpZ2FudGUuCiAgICBjb25zdCB0b2Rvc0N1c3RvbWVycyA9IGF3YWl0IGZldGNoQWxsUm93czxhbnk+KChyZiwgcnQpID0+IHN1cGFiYXNlLmZyb20oJ2N1c3RvbWVycycpCiAgICAgIC5zZWxlY3QoJ2lkLCBuYW1lLCBwaG9uZSwgd2hhdHNhcHAsIGJpcnRoX2RhdGUnKS5lcSgndGVuYW50X2lkJywgdGVuYW50SWQpLnJhbmdlKHJmLCBydCkpOwogICAgbGV0IGN1c3RvbWVyc01hcDogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9OwogICAgdG9kb3NDdXN0b21lcnMuZm9yRWFjaCgoYzogYW55KSA9PiB7IGN1c3RvbWVyc01hcFtjLmlkXSA9IGM7IH0pOw=='))
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

Write-Host "RelatoriosOperacionais.tsx corrigido de novo: busca de customers agora e paginada e nao filtra mais por lista de IDs gigante."
Write-Host "Rode: npm run build"