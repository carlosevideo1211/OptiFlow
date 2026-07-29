$ErrorActionPreference = "Stop"
$path = "D:\\optiflow\\src\\pages\\AgendaPage.tsx"
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
$old1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ZnVuY3Rpb24gZW1wdHlGb3JtKCkgewogIHJldHVybiB7CiAgICBjdXN0b21lcl9pZDogJycsIGN1c3RvbWVyX25hbWU6ICcnLAogICAgcHJvZmVzc2lvbmFsX25hbWU6ICcnLCBwcm9mZXNzaW9uYWxfaWQ6ICcnLAogICAgcHJvY2VkdXJlX3R5cGU6ICdDb25zdWx0YScsIHByb2NlZHVyZV9pZDogJycsCiAgICBkYXRlOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXSwKICAgIHRpbWU6ICcwODowMCcsCiAgICB0aW1lX2VuZDogJzA4OjMwJywKICAgIG5vdGVzOiAnJywKICB9Owp9'))
$new1 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ZnVuY3Rpb24gZW1wdHlGb3JtKCkgewogIHJldHVybiB7CiAgICBjdXN0b21lcl9pZDogJycsIGN1c3RvbWVyX25hbWU6ICcnLAogICAgcHJvZmVzc2lvbmFsX25hbWU6ICcnLCBwcm9mZXNzaW9uYWxfaWQ6ICcnLAogICAgcHJvY2VkdXJlX3R5cGU6ICdDb25zdWx0YScsIHByb2NlZHVyZV9pZDogJycsCiAgICBwYXJ0bmVyc2hpcF9pZDogJycsIHByaW9yaWRhZGU6IGZhbHNlLAogICAgZGF0ZTogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF0sCiAgICB0aW1lOiAnMDg6MDAnLAogICAgdGltZV9lbmQ6ICcwODozMCcsCiAgICBub3RlczogJycsCiAgfTsKfQ=='))
if ($content.IndexOf($old1) -lt 0) { throw "Bloco 1 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old1, $new1)

# --- Bloco 2 ---
$old2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICBjb25zdCBbcHJvZmVzc2lvbmFscywgc2V0UHJvZmVzc2lvbmFsc10gPSB1c2VTdGF0ZTxhbnlbXT4oW10pOwogIGNvbnN0IFtwcm9jZWR1cmVzLCBzZXRQcm9jZWR1cmVzXSA9IHVzZVN0YXRlPGFueVtdPihbXSk7'))
$new2 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICBjb25zdCBbcHJvZmVzc2lvbmFscywgc2V0UHJvZmVzc2lvbmFsc10gPSB1c2VTdGF0ZTxhbnlbXT4oW10pOwogIGNvbnN0IFtwcm9jZWR1cmVzLCBzZXRQcm9jZWR1cmVzXSA9IHVzZVN0YXRlPGFueVtdPihbXSk7CiAgY29uc3QgW3BhcnRuZXJzaGlwcywgc2V0UGFydG5lcnNoaXBzXSA9IHVzZVN0YXRlPGFueVtdPihbXSk7'))
if ($content.IndexOf($old2) -lt 0) { throw "Bloco 2 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old2, $new2)

# --- Bloco 3 ---
$old3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIHN1cGFiYXNlLmZyb20oJ3Byb2NlZHVyZXMnKS5zZWxlY3QoJ2lkLG5hbWUsZGVmYXVsdF9wcmljZScpLmVxKCd0ZW5hbnRfaWQnLCB0ZW5hbnRJZCkuZXEoJ2FjdGl2ZScsIHRydWUpLm9yZGVyKCduYW1lJykKICAgICAgLnRoZW4oKHsgZGF0YSB9KSA9PiBzZXRQcm9jZWR1cmVzKGRhdGEgfHwgW10pKTs='))
$new3 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgIHN1cGFiYXNlLmZyb20oJ3Byb2NlZHVyZXMnKS5zZWxlY3QoJ2lkLG5hbWUsZGVmYXVsdF9wcmljZScpLmVxKCd0ZW5hbnRfaWQnLCB0ZW5hbnRJZCkuZXEoJ2FjdGl2ZScsIHRydWUpLm9yZGVyKCduYW1lJykKICAgICAgLnRoZW4oKHsgZGF0YSB9KSA9PiBzZXRQcm9jZWR1cmVzKGRhdGEgfHwgW10pKTsKICAgIHN1cGFiYXNlLmZyb20oJ3BhcnRuZXJzaGlwcycpLnNlbGVjdCgnaWQsbmFtZScpLmVxKCd0ZW5hbnRfaWQnLCB0ZW5hbnRJZCkuZXEoJ2FjdGl2ZScsIHRydWUpLm9yZGVyKCduYW1lJykKICAgICAgLnRoZW4oKHsgZGF0YSB9KSA9PiBzZXRQYXJ0bmVyc2hpcHMoZGF0YSB8fCBbXSkpOw=='))
if ($content.IndexOf($old3) -lt 0) { throw "Bloco 3 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old3, $new3)

# --- Bloco 4 ---
$old4 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICBwcm9jZWR1cmVfdHlwZTogZm9ybS5wcm9jZWR1cmVfdHlwZSwKICAgICAgICBwcm9jZWR1cmVfaWQ6IGZvcm0ucHJvY2VkdXJlX2lkIHx8IG51bGwsCiAgICAgICAgZGF0ZTogZm9ybS5kYXRlLAogICAgICAgIHRpbWU6IGZvcm0udGltZSwKICAgICAgICB0aW1lX2VuZDogZm9ybS50aW1lX2VuZCwKICAgICAgICBzdGF0dXM6ICdhZ2VuZGFkYScsCiAgICAgICAgbm90ZXM6IGZvcm0ubm90ZXMgfHwgbnVsbCwKICAgICAgfV0pOw=='))
$new4 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICBwcm9jZWR1cmVfdHlwZTogZm9ybS5wcm9jZWR1cmVfdHlwZSwKICAgICAgICBwcm9jZWR1cmVfaWQ6IGZvcm0ucHJvY2VkdXJlX2lkIHx8IG51bGwsCiAgICAgICAgcGFydG5lcnNoaXBfaWQ6IGZvcm0ucGFydG5lcnNoaXBfaWQgfHwgbnVsbCwKICAgICAgICBwcmlvcmlkYWRlOiBmb3JtLnByaW9yaWRhZGUsCiAgICAgICAgZGF0ZTogZm9ybS5kYXRlLAogICAgICAgIHRpbWU6IGZvcm0udGltZSwKICAgICAgICB0aW1lX2VuZDogZm9ybS50aW1lX2VuZCwKICAgICAgICBzdGF0dXM6ICdhZ2VuZGFkYScsCiAgICAgICAgbm90ZXM6IGZvcm0ubm90ZXMgfHwgbnVsbCwKICAgICAgfV0pOw=='))
if ($content.IndexOf($old4) -lt 0) { throw "Bloco 4 nao encontrado no arquivo - patch abortado, nada foi alterado." }
$content = $content.Replace($old4, $new4)

# --- Bloco 5 ---
$old5 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICAgICAgICB7LyogT2JzZXJ2YcOnw6NvICovfQogICAgICAgICAgICAgIDxkaXY+CiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPSJmb3JtLWxhYmVsIj5PYnNlcnZhw6fDo288L2xhYmVsPgogICAgICAgICAgICAgICAgPHRleHRhcmVhIGNsYXNzTmFtZT0iZm9ybS1pbnB1dCIgcm93cz17M30gdmFsdWU9e2Zvcm0ubm90ZXN9IG9uQ2hhbmdlPXtlID0+IHNldCgnbm90ZXMnLCBlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPSJPYnNlcnZhw6fDtWVzIHNvYnJlIG8gYWdlbmRhbWVudG8uLi4iIC8+CiAgICAgICAgICAgICAgPC9kaXY+CgogICAgICAgICAgICA8L2Rpdj4='))
$new5 = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('ICAgICAgICAgICAgICB7LyogQ29udsOqbmlvIGUgUHJpb3JpZGFkZSAqL30KICAgICAgICAgICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6ICdncmlkJywgZ3JpZFRlbXBsYXRlQ29sdW1uczogJzFmciBhdXRvJywgZ2FwOiAxMiwgYWxpZ25JdGVtczogJ2VuZCcgfX0+CiAgICAgICAgICAgICAgICA8ZGl2PgogICAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPSJmb3JtLWxhYmVsIj5Db252w6puaW8gKG9wY2lvbmFsKTwvbGFiZWw+CiAgICAgICAgICAgICAgICAgIDxzZWxlY3QgY2xhc3NOYW1lPSJmb3JtLWlucHV0IiB2YWx1ZT17Zm9ybS5wYXJ0bmVyc2hpcF9pZH0gb25DaGFuZ2U9e2UgPT4gc2V0KCdwYXJ0bmVyc2hpcF9pZCcsIGUudGFyZ2V0LnZhbHVlKX0+CiAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT0iIj5QYXJ0aWN1bGFyPC9vcHRpb24+CiAgICAgICAgICAgICAgICAgICAge3BhcnRuZXJzaGlwcy5tYXAocCA9PiA8b3B0aW9uIGtleT17cC5pZH0gdmFsdWU9e3AuaWR9PntwLm5hbWV9PC9vcHRpb24+KX0KICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+CiAgICAgICAgICAgICAgICA8L2Rpdj4KICAgICAgICAgICAgICAgIDxsYWJlbCBzdHlsZT17eyBkaXNwbGF5OiAnZmxleCcsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBnYXA6IDYsIHBhZGRpbmdCb3R0b206IDgsIGN1cnNvcjogJ3BvaW50ZXInLCB3aGl0ZVNwYWNlOiAnbm93cmFwJyB9fT4KICAgICAgICAgICAgICAgICAgPGlucHV0IHR5cGU9ImNoZWNrYm94IiBjaGVja2VkPXtmb3JtLnByaW9yaWRhZGV9IG9uQ2hhbmdlPXtlID0+IHNldCgncHJpb3JpZGFkZScsIGUudGFyZ2V0LmNoZWNrZWQpfSAvPgogICAgICAgICAgICAgICAgICBQcmlvcmlkYWRlCiAgICAgICAgICAgICAgICA8L2xhYmVsPgogICAgICAgICAgICAgIDwvZGl2PgoKICAgICAgICAgICAgICB7LyogT2JzZXJ2YcOnw6NvICovfQogICAgICAgICAgICAgIDxkaXY+CiAgICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPSJmb3JtLWxhYmVsIj5PYnNlcnZhw6fDo288L2xhYmVsPgogICAgICAgICAgICAgICAgPHRleHRhcmVhIGNsYXNzTmFtZT0iZm9ybS1pbnB1dCIgcm93cz17M30gdmFsdWU9e2Zvcm0ubm90ZXN9IG9uQ2hhbmdlPXtlID0+IHNldCgnbm90ZXMnLCBlLnRhcmdldC52YWx1ZSl9IHBsYWNlaG9sZGVyPSJPYnNlcnZhw6fDtWVzIHNvYnJlIG8gYWdlbmRhbWVudG8uLi4iIC8+CiAgICAgICAgICAgICAgPC9kaXY+CgogICAgICAgICAgICA8L2Rpdj4='))
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

Write-Host "AgendaPage.tsx atualizado: campo Convenio e toggle Prioridade adicionados ao modal de Novo Agendamento."
Write-Host "Rode: npm run build"