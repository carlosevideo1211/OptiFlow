$ErrorActionPreference = "Stop"
$path = "D:\\optiflow\\src\\pages\\consulta\\ConsultaPage.tsx"
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
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('aW1wb3J0IFJlbGF0b3Jpb3NDb25zdWx0YXMgZnJvbSAnLi9SZWxhdG9yaW9zQ29uc3VsdGFzJzsKaW1wb3J0IHRvYXN0IGZyb20gJ3JlYWN0LWhvdC10b2FzdCc7'))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('aW1wb3J0IFJlbGF0b3Jpb3NDb25zdWx0YXMgZnJvbSAnLi9SZWxhdG9yaW9zQ29uc3VsdGFzJzsKaW1wb3J0IEZpbmFuY2Vpcm9Db25zdWx0YXMgZnJvbSAnLi9GaW5hbmNlaXJvQ29uc3VsdGFzJzsKaW1wb3J0IHRvYXN0IGZyb20gJ3JlYWN0LWhvdC10b2FzdCc7'))
if ($content.IndexOf($old1) -lt 0) { throw "Bloco 1 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old1, $new1)

# --- Bloco 2 ---
$old2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICBjb25zdCBbdGFiLCBzZXRUYWJdID0gdXNlU3RhdGU8J2luaWNpbyd8J3BhY2llbnRlcyd8J2NvbnN1bHRhcyd8J2FnZW5kYSd8J3JlbGF0b3Jpb3MnfCdhanVzdGVzJz4oJ2luaWNpbycpOw=='))
$new2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICBjb25zdCBbdGFiLCBzZXRUYWJdID0gdXNlU3RhdGU8J2luaWNpbyd8J3BhY2llbnRlcyd8J2NvbnN1bHRhcyd8J2FnZW5kYSd8J2ZpbmFuY2Vpcm8nfCdyZWxhdG9yaW9zJ3wnYWp1c3Rlcyc+KCdpbmljaW8nKTs='))
if ($content.IndexOf($old2) -lt 0) { throw "Bloco 2 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old2, $new2)

# --- Bloco 3 ---
$old3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICB7W3trOidpbmljaW8nLGw6J/Cfj6AgSW7DrWNpbyd9LHtrOidwYWNpZW50ZXMnLGw6J/Cfp5EgUGFjaWVudGVzJ30se2s6J2NvbnN1bHRhcycsbDon8J+RgSBDb25zdWx0YXMgLyBSeCd9LHtrOidhZ2VuZGEnLGw6J/Cfk4UgQWdlbmRhJ30se2s6J3JlbGF0b3Jpb3MnLGw6J/Cfk4ogUmVsYXTDs3Jpb3MnfSx7azonYWp1c3RlcycsbDon4pqZ77iPIENvbmZpZ3VyYcOnw7Vlcyd9XS5tYXAodCA9PiAo'))
$new3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICB7W3trOidpbmljaW8nLGw6J/Cfj6AgSW7DrWNpbyd9LHtrOidwYWNpZW50ZXMnLGw6J/Cfp5EgUGFjaWVudGVzJ30se2s6J2NvbnN1bHRhcycsbDon8J+RgSBDb25zdWx0YXMgLyBSeCd9LHtrOidhZ2VuZGEnLGw6J/Cfk4UgQWdlbmRhJ30se2s6J2ZpbmFuY2Vpcm8nLGw6J/CfkrAgRmluYW5jZWlybyd9LHtrOidyZWxhdG9yaW9zJyxsOifwn5OKIFJlbGF0w7NyaW9zJ30se2s6J2FqdXN0ZXMnLGw6J+Kame+4jyBDb25maWd1cmHDp8O1ZXMnfV0ubWFwKHQgPT4gKA=='))
if ($content.IndexOf($old3) -lt 0) { throw "Bloco 3 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old3, $new3)

# --- Bloco 4 ---
$old4 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgey8qIFJlbGF0w7NyaW9zIChGYXNlIDcpICovfQogICAgICB7dGFiID09PSAncmVsYXRvcmlvcycgJiYgPFJlbGF0b3Jpb3NDb25zdWx0YXMvPn0='))
$new4 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgey8qIEZpbmFuY2Vpcm8gKENvbnRhcyBhIFJlY2ViZXIvUGFnYXIgZG8gbcOzZHVsbykgKi99CiAgICAgIHt0YWIgPT09ICdmaW5hbmNlaXJvJyAmJiA8RmluYW5jZWlyb0NvbnN1bHRhcy8+fQoKICAgICAgey8qIFJlbGF0w7NyaW9zIChGYXNlIDcpICovfQogICAgICB7dGFiID09PSAncmVsYXRvcmlvcycgJiYgPFJlbGF0b3Jpb3NDb25zdWx0YXMvPn0='))
if ($content.IndexOf($old4) -lt 0) { throw "Bloco 4 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old4, $new4)

if ($hadCRLF) { $content = $content -replace "`n", "`r`n" }

if ($hasBom) {
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($path, $content, $utf8Bom)
} else {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

Write-Host "ConsultaPage.tsx atualizado: nova aba Financeiro adicionada ao modulo Consultas/Rx."
Write-Host "Rode: npm run build"