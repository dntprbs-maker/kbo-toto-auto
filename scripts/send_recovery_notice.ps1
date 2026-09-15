param(
  [Parameter(Mandatory = $true)][ValidateSet('success', 'failed')][string]$Status,
  [Parameter(Mandatory = $true)][string]$Phase,
  [Parameter(Mandatory = $true)][string]$Issue,
  [Parameter(Mandatory = $true)][string]$Action
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$secret = Get-Content -Raw -LiteralPath (Join-Path $workspace '.runtime\recovery-secret.json') | ConvertFrom-Json
$payload = @{
  status = $Status
  phase = $Phase
  issue = $Issue
  action = $Action
  checked_at = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
} | ConvertTo-Json -Depth 4

Invoke-RestMethod -Method Post -Uri 'http://localhost:5678/webhook/kbo-auto-recovery-notify' -Headers @{ $secret.headerName = $secret.headerValue } -ContentType 'application/json' -Body $payload
