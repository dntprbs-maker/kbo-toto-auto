param(
  [int]$Minutes = 180,
  [string]$WorkflowId = 'whXPf8lgqUAQpwp3'
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $workspace '.runtime\n8n-db'
$pythonExe = 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$reader = Join-Path $PSScriptRoot 'read_n8n_failures.py'

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
docker cp n8n:/home/node/.n8n/database.sqlite (Join-Path $runtimeDir 'database.sqlite') | Out-Null
docker cp n8n:/home/node/.n8n/database.sqlite-wal (Join-Path $runtimeDir 'database.sqlite-wal') | Out-Null
docker cp n8n:/home/node/.n8n/database.sqlite-shm (Join-Path $runtimeDir 'database.sqlite-shm') | Out-Null

& $pythonExe $reader (Join-Path $runtimeDir 'database.sqlite') --minutes $Minutes --workflow $WorkflowId
