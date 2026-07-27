$ErrorActionPreference = "Stop"
$path = "D:\optiflow\src\pages\consulta\AtendimentoPage.tsx"
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "D:\optiflow\src\pages\consulta\AtendimentoPage.tsx.bak_$stamp"
Copy-Item $path $backup
Write-Host "Backup criado em $backup"

$bytes = [System.IO.File]::ReadAllBytes($path)
$hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
$rawContent = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Normaliza CRLF -> LF para comparar, devolve CRLF ao salvar
$hadCRLF = $rawContent.Contains("`r`n")
$content = $rawContent -replace "`r`n", "`n"

# --- Bloco 1 ---
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICBjb25zdCBbZG9jUHJvZmlzc2lvbmFsLCBzZXREb2NQcm9maXNzaW9uYWxdID0gdXNlU3RhdGUoJycpOw=='))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICBjb25zdCBbZG9jUHJvZmlzc2lvbmFsLCBzZXREb2NQcm9maXNzaW9uYWxdID0gdXNlU3RhdGUoJycpOwogIGNvbnN0IFtwYXJ0bmVyc2hpcHMsIHNldFBhcnRuZXJzaGlwc10gPSB1c2VTdGF0ZTxhbnlbXT4oW10pOwogIGNvbnN0IFtwYXJ0bmVyc2hpcElkLCBzZXRQYXJ0bmVyc2hpcElkXSA9IHVzZVN0YXRlKCcnKTs='))
if ($content.IndexOf($old1) -lt 0) { throw "Bloco 1 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old1, $new1)

# --- Bloco 2 ---
$old2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICB9LCBbdGVuYW50SWRdKTsKCiAgdXNlRWZmZWN0KCgpID0+IHsKICAgIGlmICghdGVuYW50SWQpIHJldHVybjsKICAgIGlmIChpc05ldykgew=='))
$new2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICB9LCBbdGVuYW50SWRdKTsKCiAgdXNlRWZmZWN0KCgpID0+IHsKICAgIGlmICghdGVuYW50SWQpIHJldHVybjsKICAgIHN1cGFiYXNlLmZyb20oJ3BhcnRuZXJzaGlwcycpLnNlbGVjdCgnaWQsbmFtZSxjb21taXNzaW9uX3BlcmNlbnQnKS5lcSgndGVuYW50X2lkJywgdGVuYW50SWQpLmVxKCdhY3RpdmUnLCB0cnVlKS5vcmRlcignbmFtZScpCiAgICAgIC50aGVuKCh7IGRhdGEgfSkgPT4gc2V0UGFydG5lcnNoaXBzKGRhdGEgfHwgW10pKTsKICB9LCBbdGVuYW50SWRdKTsKCiAgdXNlRWZmZWN0KCgpID0+IHsKICAgIGlmICghdGVuYW50SWQpIHJldHVybjsKICAgIGlmIChpc05ldykgew=='))
if ($content.IndexOf($old2) -lt 0) { throw "Bloco 2 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old2, $new2)

# --- Bloco 3 ---
$old3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIGlmICghaWQpIHJldHVybjsKICAgIGNvbnN0IGxvYWQgPSBhc3luYyAoKSA9PiB7CiAgICAgIHNldExvYWRpbmcodHJ1ZSk7CiAgICAgIGNvbnN0IHsgZGF0YSwgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oJ2NvbnN1bHRhdGlvbnMnKS5zZWxlY3QoJyonKS5lcSgnaWQnLCBpZCkuZXEoJ3RlbmFudF9pZCcsIHRlbmFudElkKS5zaW5nbGUoKTsKICAgICAgaWYgKGVycm9yIHx8ICFkYXRhKSB7IHRvYXN0LmVycm9yKCdDb25zdWx0YSBuw6NvIGVuY29udHJhZGEnKTsgbmF2aWdhdGUoJy9jb25zdWx0YScpOyByZXR1cm47IH0KICAgICAgc2V0Q29uc3VsdGF0aW9uKGRhdGEpOwogICAgICBwb3B1bGF0ZShkYXRhKTsKICAgICAgc2V0TG9hZGluZyhmYWxzZSk7CiAgICB9OwogICAgbG9hZCgpOwogIH0sIFtpZCwgdGVuYW50SWRdKTs='))
$new3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIGlmICghaWQpIHJldHVybjsKICAgIGNvbnN0IGxvYWQgPSBhc3luYyAoKSA9PiB7CiAgICAgIHNldExvYWRpbmcodHJ1ZSk7CiAgICAgIGNvbnN0IHsgZGF0YSwgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oJ2NvbnN1bHRhdGlvbnMnKS5zZWxlY3QoJyonKS5lcSgnaWQnLCBpZCkuZXEoJ3RlbmFudF9pZCcsIHRlbmFudElkKS5zaW5nbGUoKTsKICAgICAgaWYgKGVycm9yIHx8ICFkYXRhKSB7IHRvYXN0LmVycm9yKCdDb25zdWx0YSBuw6NvIGVuY29udHJhZGEnKTsgbmF2aWdhdGUoJy9jb25zdWx0YScpOyByZXR1cm47IH0KICAgICAgc2V0Q29uc3VsdGF0aW9uKGRhdGEpOwogICAgICBwb3B1bGF0ZShkYXRhKTsKICAgICAgaWYgKGRhdGEucGFydG5lcnNoaXBfaWQpIHNldFBhcnRuZXJzaGlwSWQoZGF0YS5wYXJ0bmVyc2hpcF9pZCk7CiAgICAgIGlmIChkYXRhLnZhbG9yX2NvYnJhZG8gIT0gbnVsbCkgewogICAgICAgIHNldERvY1ZhbG9yRXhhbWUoU3RyaW5nKE51bWJlcihkYXRhLnZhbG9yX2NvYnJhZG8pLnRvRml4ZWQoMikpLnJlcGxhY2UoJy4nLCAnLCcpKTsKICAgICAgfSBlbHNlIGlmIChkYXRhLnByb2NlZHVyZV9pZCkgewogICAgICAgIGNvbnN0IHsgZGF0YTogcHJvYyB9ID0gYXdhaXQgc3VwYWJhc2UuZnJvbSgncHJvY2VkdXJlcycpLnNlbGVjdCgnZGVmYXVsdF9wcmljZScpLmVxKCdpZCcsIGRhdGEucHJvY2VkdXJlX2lkKS5tYXliZVNpbmdsZSgpOwogICAgICAgIGlmIChwcm9jPy5kZWZhdWx0X3ByaWNlICE9IG51bGwpIHNldERvY1ZhbG9yRXhhbWUoU3RyaW5nKE51bWJlcihwcm9jLmRlZmF1bHRfcHJpY2UpLnRvRml4ZWQoMikpLnJlcGxhY2UoJy4nLCAnLCcpKTsKICAgICAgfQogICAgICBzZXRMb2FkaW5nKGZhbHNlKTsKICAgIH07CiAgICBsb2FkKCk7CiAgfSwgW2lkLCB0ZW5hbnRJZF0pOw=='))
if ($content.IndexOf($old3) -lt 0) { throw "Bloco 3 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old3, $new3)

# --- Bloco 4 ---
$old4 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICAgICAgICAgICAgPEZpZWxkIGxhYmVsPSJWYWxvciBkbyBleGFtZSAoUiQpIj4KICAgICAgICAgICAgICAgICAgICA8RklucHV0IHZhbHVlPXtkb2NWYWxvckV4YW1lfSBvbkNoYW5nZT17c2V0RG9jVmFsb3JFeGFtZX0gcGxhY2Vob2xkZXI9IkV4OiA4MCwwMCIgLz4KICAgICAgICAgICAgICAgICAgPC9GaWVsZD4KICAgICAgICAgICAgICAgICAgPEZpZWxkIGxhYmVsPSJDaWRhZGUiPg=='))
$new4 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICAgICAgICAgICAgPEZpZWxkIGxhYmVsPSJWYWxvciBkbyBleGFtZSAoUiQpIj4KICAgICAgICAgICAgICAgICAgICA8RklucHV0IHZhbHVlPXtkb2NWYWxvckV4YW1lfSBvbkNoYW5nZT17c2V0RG9jVmFsb3JFeGFtZX0gcGxhY2Vob2xkZXI9IkV4OiA4MCwwMCIgLz4KICAgICAgICAgICAgICAgICAgPC9GaWVsZD4KICAgICAgICAgICAgICAgICAgPEZpZWxkIGxhYmVsPSJDb252w6puaW8gKG9wY2lvbmFsKSI+CiAgICAgICAgICAgICAgICAgICAgPHNlbGVjdCBjbGFzc05hbWU9ImZvcm0taW5wdXQiIHZhbHVlPXtwYXJ0bmVyc2hpcElkfSBvbkNoYW5nZT17ZSA9PiBzZXRQYXJ0bmVyc2hpcElkKGUudGFyZ2V0LnZhbHVlKX0+CiAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPSIiPlBhcnRpY3VsYXI8L29wdGlvbj4KICAgICAgICAgICAgICAgICAgICAgIHtwYXJ0bmVyc2hpcHMubWFwKHAgPT4gPG9wdGlvbiBrZXk9e3AuaWR9IHZhbHVlPXtwLmlkfT57cC5uYW1lfTwvb3B0aW9uPil9CiAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+CiAgICAgICAgICAgICAgICAgIDwvRmllbGQ+CiAgICAgICAgICAgICAgICAgIDxGaWVsZCBsYWJlbD0iQ2lkYWRlIj4='))
if ($content.IndexOf($old4) -lt 0) { throw "Bloco 4 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old4, $new4)

# --- Bloco 5 ---
$old5 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICBsY19sZW50ZTogbGNMZW50ZXx8bnVsbCwgbGNfb2JzOiBsY09ic3x8bnVsbCwgc3RhdHVzLCBkYXRlOiBkYXRlfHxudWxsLAogICAgICB9OwogICAgICBjb25zdCB7IGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5mcm9tKCdjb25zdWx0YXRpb25zJykudXBkYXRlKHBheWxvYWQpLmVxKCdpZCcsIGlkKTs='))
$new5 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICBsY19sZW50ZTogbGNMZW50ZXx8bnVsbCwgbGNfb2JzOiBsY09ic3x8bnVsbCwgc3RhdHVzLCBkYXRlOiBkYXRlfHxudWxsLAogICAgICAgIHBhcnRuZXJzaGlwX2lkOiBwYXJ0bmVyc2hpcElkIHx8IG51bGwsCiAgICAgICAgdmFsb3JfY29icmFkbzogbnVtKGRvY1ZhbG9yRXhhbWUpLAogICAgICB9OwogICAgICBjb25zdCB7IGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5mcm9tKCdjb25zdWx0YXRpb25zJykudXBkYXRlKHBheWxvYWQpLmVxKCdpZCcsIGlkKTs='))
if ($content.IndexOf($old5) -lt 0) { throw "Bloco 5 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old5, $new5)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }

if ($hasBom) {
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($path, $content, $utf8Bom)
} else {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

Write-Host "AtendimentoPage.tsx atualizado: convenio (partnership_id) e valor_cobrado agora sao capturados e salvos, com valor pre-preenchido do procedimento."
Write-Host "Rode: npm run build"