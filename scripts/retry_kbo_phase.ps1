param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('result-collect', 'result-apply', 'team-bias', 'schedule', 'mykbo', 'team-war', 'statiz', 'odds', 'ai-prediction', 'service-files')]
  [string]$Phase
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$secret = Get-Content -Raw -LiteralPath (Join-Path $workspace '.runtime\recovery-secret.json') | ConvertFrom-Json
$uri = 'http://localhost:5678/webhook/kbo-auto-recovery-' + $Phase
$payload = @{ requested_at = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'); source = 'codex-auto-recovery' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri $uri -Headers @{ $secret.headerName = $secret.headerValue } -ContentType 'application/json' -Body $payload
