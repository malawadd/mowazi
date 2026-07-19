$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $root ".data\local-stack.json"

function Stop-ProcessTree([int]$ProcessId) {
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-ProcessTree ([int]$child.ProcessId)
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

$processIds = [System.Collections.Generic.HashSet[int]]::new()
$escapedRoot = [Regex]::Escape($root)
$workspaceProcesses = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -in @("node.exe", "cmd.exe") -and
    $_.CommandLine -match $escapedRoot -and
    ($_.CommandLine -match "convex[\\/].*main\.js.*dev" -or $_.CommandLine -match "next[\\/].*next.*dev")
  }
foreach ($process in $workspaceProcesses) {
  [void]$processIds.Add([int]$process.ProcessId)
}

$listener = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) { [void]$processIds.Add([int]$listener.OwningProcess) }

foreach ($processId in $processIds) {
  Stop-ProcessTree $processId
}

Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue

Push-Location $root
try {
  & docker compose -f docker-compose.agents.yml down --remove-orphans
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose shutdown failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

Write-Host "Website, Convex development backend, and agent stack are stopped."
Write-Host "Postgres and Redis data volumes were preserved."
