param(
  [switch]$BuildAgents,
  [switch]$EnableScheduledAnalysis
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root ".data"
$statePath = Join-Path $dataDir "local-stack.json"
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

function Get-PortOwner([int]$Port) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($listener) { return [int]$listener.OwningProcess }
  return $null
}

function Find-WorkspaceProcess([string]$Tool) {
  $escapedRoot = [Regex]::Escape($root)
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -in @("node.exe", "cmd.exe") -and
      $_.CommandLine -match $escapedRoot -and
      $_.CommandLine -match $Tool
    } |
    Select-Object -First 1
}

function Start-NpmService([string]$Script, [string]$LogName) {
  $stdout = Join-Path $dataDir "$LogName.out.log"
  $stderr = Join-Path $dataDir "$LogName.err.log"
  return Start-Process -FilePath $npm -ArgumentList @("run", $Script) `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
}

function Wait-ForWebsite([int]$ProcessId, [int]$TimeoutSeconds = 60) {
  for ($attempt = 0; $attempt -lt $TimeoutSeconds; $attempt++) {
    if (Get-PortOwner 3002) { return }
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
      $tail = Get-Content (Join-Path $dataDir "website-frontend.err.log") -Tail 20 -ErrorAction SilentlyContinue
      throw "Website process exited before port 3002 opened.`n$($tail -join "`n")"
    }
    Start-Sleep -Seconds 1
  }
  throw "Website did not open http://127.0.0.1:3002 within $TimeoutSeconds seconds."
}

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

$frontendPid = Get-PortOwner 3002
if ($frontendPid) {
  Write-Host "Website already listening on port 3002 (PID $frontendPid)."
} else {
  $frontend = Start-NpmService "dev:frontend" "website-frontend"
  $frontendPid = $frontend.Id
  Wait-ForWebsite $frontendPid
  $frontendPid = Get-PortOwner 3002
  Write-Host "Website started on http://127.0.0.1:3002."
}

$convex = Find-WorkspaceProcess "convex[\\/].*main\.js.*dev"
if ($convex) {
  $backendPid = [int]$convex.ProcessId
  Write-Host "Convex development backend is already running (PID $backendPid)."
} else {
  $backend = Start-NpmService "dev:backend" "website-backend"
  $backendPid = $backend.Id
  Start-Sleep -Seconds 2
  if (-not (Get-Process -Id $backendPid -ErrorAction SilentlyContinue)) {
    $tail = Get-Content (Join-Path $dataDir "website-backend.err.log") -Tail 20 -ErrorAction SilentlyContinue
    throw "Convex backend exited during startup.`n$($tail -join "`n")"
  }
  Write-Host "Convex development backend started."
}

$agentArgs = @{}
if ($BuildAgents) { $agentArgs.Build = $true }
if ($EnableScheduledAnalysis) { $agentArgs.EnableScheduledAnalysis = $true }
& (Join-Path $PSScriptRoot "start-agent-stack.ps1") @agentArgs

@{
  frontendPid = $frontendPid
  backendPid = $backendPid
  startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $statePath

Write-Host ""
Write-Host "Moeazi is ready:"
Write-Host "  Website: http://127.0.0.1:3002"
Write-Host "  Agent API: http://127.0.0.1:8100/health"
Write-Host "  Temporal: http://127.0.0.1:8233"
if (-not $EnableScheduledAnalysis) {
  Write-Host "  Scheduled analysis: disabled"
}
