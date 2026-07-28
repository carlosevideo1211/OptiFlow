$ErrorActionPreference = "Stop"
$path = "D:\optiflow\src\pages\consulta\AtendimentoPage.tsx"
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
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICBjb25zdCBzeW5jTGFuY2FtZW50b3NGaW5hbmNlaXJvcyA9IGFzeW5jIChjb25zdWx0YXRpb25JZDogc3RyaW5nKSA9PiB7CiAgICAvLyBJZGVtcG90ZW50ZTogc2VtcHJlIGxpbXBhIG9zIGxhbsOnYW1lbnRvcyBhbnRpZ29zIGRlc3RhIGNvbnN1bHRhIGFudGVzIGRlCiAgICAvLyByZWNyaWFyLCBhc3NpbSBzYWx2YXIgZGUgbm92byAoZXg6IGNvcnJpZ2luZG8gdmFsb3IpIG7Do28gZHVwbGljYSBuYWRhLgogICAgYXdhaXQgc3VwYWJhc2UuZnJvbSgnY2xpbmljX2ZpbmFuY2lhbF9lbnRyaWVzJykuZGVsZXRlKCkuZXEoJ2NvbnN1bHRhdGlvbl9pZCcsIGNvbnN1bHRhdGlvbklkKTsKCiAgICBjb25zdCB2YWxvciA9IG51bShkb2NWYWxvckV4YW1lKTsKICAgIGlmICh2YWxvciA9PSBudWxsIHx8IHZhbG9yIDw9IDAgfHwgc3RhdHVzICE9PSAncmVhbGl6YWRhJykgcmV0dXJuOw=='))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICBjb25zdCBzeW5jTGFuY2FtZW50b3NGaW5hbmNlaXJvcyA9IGFzeW5jIChjb25zdWx0YXRpb25JZDogc3RyaW5nLCBzdGF0dXNGaW5hbDogc3RyaW5nKSA9PiB7CiAgICAvLyBJZGVtcG90ZW50ZTogc2VtcHJlIGxpbXBhIG9zIGxhbsOnYW1lbnRvcyBhbnRpZ29zIGRlc3RhIGNvbnN1bHRhIGFudGVzIGRlCiAgICAvLyByZWNyaWFyLCBhc3NpbSBzYWx2YXIgZGUgbm92byAoZXg6IGNvcnJpZ2luZG8gdmFsb3IpIG7Do28gZHVwbGljYSBuYWRhLgogICAgYXdhaXQgc3VwYWJhc2UuZnJvbSgnY2xpbmljX2ZpbmFuY2lhbF9lbnRyaWVzJykuZGVsZXRlKCkuZXEoJ2NvbnN1bHRhdGlvbl9pZCcsIGNvbnN1bHRhdGlvbklkKTsKCiAgICBjb25zdCB2YWxvciA9IG51bShkb2NWYWxvckV4YW1lKTsKICAgIGlmICh2YWxvciA9PSBudWxsIHx8IHZhbG9yIDw9IDAgfHwgc3RhdHVzRmluYWwgIT09ICdyZWFsaXphZGEnKSByZXR1cm47'))
if ($content.IndexOf($old1) -lt 0) { throw "Bloco 1 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old1, $new1)

# --- Bloco 2 ---
$old2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAvLyDilIDilIAgc2FsdmFyIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGNvbnN0IGhhbmRsZVNhdmUgPSBhc3luYyAoKSA9PiB7CiAgICBpZiAoY3JlYXRpbmdSZWYuY3VycmVudCkgcmV0dXJuOw=='))
$new2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAvLyDilIDilIAgc2FsdmFyIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIC8vIGZpbmFsaXphbmRvPXRydWUgKGJvdMOjbyAiRmluYWxpemFyIGF0ZW5kaW1lbnRvIikgZm9yw6dhIHN0YXR1cyBwYXJhICdyZWFsaXphZGEnLgogIC8vIE9zIGJvdMO1ZXMgIlNhbHZhciIgZGUgY2FkYSBzZcOnw6NvIGNvbnRpbnVhbSByZXNwZWl0YW5kbyBvIHN0YXR1cyBlc2NvbGhpZG8gZW0gQWp1c3Rlcy4KICBjb25zdCBoYW5kbGVTYXZlID0gYXN5bmMgKGZpbmFsaXphbmRvOiBib29sZWFuID0gZmFsc2UpID0+IHsKICAgIGlmIChjcmVhdGluZ1JlZi5jdXJyZW50KSByZXR1cm47'))
if ($content.IndexOf($old2) -lt 0) { throw "Bloco 2 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old2, $new2)

# --- Bloco 3 ---
$old3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgaWYgKCFpZCB8fCBpZCA9PT0gJ25vdm8nKSB7IHNldFNhdmluZyhmYWxzZSk7IHJldHVybjsgfQogICAgICBjb25zdCBwYXlsb2FkOiBhbnkgPSB7'))
$new3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgaWYgKCFpZCB8fCBpZCA9PT0gJ25vdm8nKSB7IHNldFNhdmluZyhmYWxzZSk7IHJldHVybjsgfQogICAgICBjb25zdCBzdGF0dXNGaW5hbCA9IGZpbmFsaXphbmRvID8gJ3JlYWxpemFkYScgOiBzdGF0dXM7CiAgICAgIGNvbnN0IHBheWxvYWQ6IGFueSA9IHs='))
if ($content.IndexOf($old3) -lt 0) { throw "Bloco 3 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old3, $new3)

# --- Bloco 4 ---
$old4 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICBsY19sZW50ZTogbGNMZW50ZXx8bnVsbCwgbGNfb2JzOiBsY09ic3x8bnVsbCwgc3RhdHVzLCBkYXRlOiBkYXRlfHxudWxsLAogICAgICAgIHBhcnRuZXJzaGlwX2lkOiBwYXJ0bmVyc2hpcElkIHx8IG51bGwsCiAgICAgICAgdmFsb3JfY29icmFkbzogbnVtKGRvY1ZhbG9yRXhhbWUpLAogICAgICB9OwogICAgICBjb25zdCB7IGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5mcm9tKCdjb25zdWx0YXRpb25zJykudXBkYXRlKHBheWxvYWQpLmVxKCdpZCcsIGlkKTsKICAgICAgaWYgKGVycm9yKSB0aHJvdyBlcnJvcjsKICAgICAgYXdhaXQgc3luY0xhbmNhbWVudG9zRmluYW5jZWlyb3MoaWQpOwogICAgICB0b2FzdC5zdWNjZXNzKCdTYWx2byBjb20gc3VjZXNzbyEnKTs='))
$new4 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICBsY19sZW50ZTogbGNMZW50ZXx8bnVsbCwgbGNfb2JzOiBsY09ic3x8bnVsbCwgc3RhdHVzOiBzdGF0dXNGaW5hbCwgZGF0ZTogZGF0ZXx8bnVsbCwKICAgICAgICBwYXJ0bmVyc2hpcF9pZDogcGFydG5lcnNoaXBJZCB8fCBudWxsLAogICAgICAgIHZhbG9yX2NvYnJhZG86IG51bShkb2NWYWxvckV4YW1lKSwKICAgICAgfTsKICAgICAgY29uc3QgeyBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2UuZnJvbSgnY29uc3VsdGF0aW9ucycpLnVwZGF0ZShwYXlsb2FkKS5lcSgnaWQnLCBpZCk7CiAgICAgIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7CiAgICAgIGF3YWl0IHN5bmNMYW5jYW1lbnRvc0ZpbmFuY2Vpcm9zKGlkLCBzdGF0dXNGaW5hbCk7CiAgICAgIGlmIChmaW5hbGl6YW5kbykgc2V0U3RhdHVzKCdyZWFsaXphZGEnKTsKICAgICAgdG9hc3Quc3VjY2VzcyhmaW5hbGl6YW5kbyA/ICdBdGVuZGltZW50byBmaW5hbGl6YWRvIScgOiAnU2Fsdm8gY29tIHN1Y2Vzc28hJyk7'))
if ($content.IndexOf($old4) -lt 0) { throw "Bloco 4 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old4, $new4)

# --- Bloco 5 ---
$old5 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPSJidG4gYnRuLXByaW1hcnkiIG9uQ2xpY2s9e2hhbmRsZVNhdmV9IGRpc2FibGVkPXtzYXZpbmd9IHN0eWxlPXt7IGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGdhcDogNiB9fT4KICAgICAgICAgICAgPENoZWNrQ2lyY2xlIHNpemU9ezE0fSAvPiB7c2F2aW5nID8gJ1NhbHZhbmRvLi4uJyA6ICdGaW5hbGl6YXIgYXRlbmRpbWVudG8nfQogICAgICAgICAgPC9idXR0b24+'))
$new5 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICAgIDxidXR0b24gY2xhc3NOYW1lPSJidG4gYnRuLXByaW1hcnkiIG9uQ2xpY2s9eygpID0+IGhhbmRsZVNhdmUodHJ1ZSl9IGRpc2FibGVkPXtzYXZpbmd9IHN0eWxlPXt7IGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGdhcDogNiB9fT4KICAgICAgICAgICAgPENoZWNrQ2lyY2xlIHNpemU9ezE0fSAvPiB7c2F2aW5nID8gJ1NhbHZhbmRvLi4uJyA6ICdGaW5hbGl6YXIgYXRlbmRpbWVudG8nfQogICAgICAgICAgPC9idXR0b24+'))
if ($content.IndexOf($old5) -lt 0) { throw "Bloco 5 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old5, $new5)

# --- Bloco 6 ---
$old6 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('PGJ1dHRvbiBjbGFzc05hbWU9ImJ0biBidG4tcHJpbWFyeSIgb25DbGljaz17aGFuZGxlU2F2ZX0gZGlzYWJsZWQ9e3NhdmluZ30gc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywgZ2FwOiA2LCBmb250U2l6ZTogMTIgfX0+PFNhdmUgc2l6ZT17MTN9IC8+IHtzYXZpbmcgPyAnU2FsdmFuZG8uLi4nIDogJ1NhbHZhcid9PC9idXR0b24+'))
$new6 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('PGJ1dHRvbiBjbGFzc05hbWU9ImJ0biBidG4tcHJpbWFyeSIgb25DbGljaz17KCkgPT4gaGFuZGxlU2F2ZSgpfSBkaXNhYmxlZD17c2F2aW5nfSBzdHlsZT17eyBkaXNwbGF5OiAnZmxleCcsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBnYXA6IDYsIGZvbnRTaXplOiAxMiB9fT48U2F2ZSBzaXplPXsxM30gLz4ge3NhdmluZyA/ICdTYWx2YW5kby4uLicgOiAnU2FsdmFyJ308L2J1dHRvbj4='))
if ($content.IndexOf($old6) -lt 0) { throw "Bloco 6 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old6, $new6)

# --- Bloco 7 ---
$old7 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('PGJ1dHRvbiBjbGFzc05hbWU9ImJ0biBidG4tcHJpbWFyeSIgb25DbGljaz17aGFuZGxlU2F2ZX0gZGlzYWJsZWQ9e3NhdmluZ30gc3R5bGU9e3sgZGlzcGxheTogJ2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywgZ2FwOiA2IH19PjxTYXZlIHNpemU9ezE0fSAvPiB7c2F2aW5nID8gJ1NhbHZhbmRvLi4uJyA6ICdTYWx2YXInfTwvYnV0dG9uPg=='))
$new7 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('PGJ1dHRvbiBjbGFzc05hbWU9ImJ0biBidG4tcHJpbWFyeSIgb25DbGljaz17KCkgPT4gaGFuZGxlU2F2ZSgpfSBkaXNhYmxlZD17c2F2aW5nfSBzdHlsZT17eyBkaXNwbGF5OiAnZmxleCcsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBnYXA6IDYgfX0+PFNhdmUgc2l6ZT17MTR9IC8+IHtzYXZpbmcgPyAnU2FsdmFuZG8uLi4nIDogJ1NhbHZhcid9PC9idXR0b24+'))
if ($content.IndexOf($old7) -lt 0) { throw "Bloco 7 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old7, $new7)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }

if ($hasBom) {
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($path, $content, $utf8Bom)
} else {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

Write-Host "AtendimentoPage.tsx atualizado: Finalizar atendimento agora forca o status para Realizada automaticamente; botoes Salvar de secao continuam respeitando o status atual."
Write-Host "Rode: npm run build"