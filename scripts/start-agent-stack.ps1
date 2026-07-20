param(
  [switch]$Build,
  [switch]$InfrastructureOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Import-EnvFile([string]$Path, [switch]$Overwrite) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
    $name = $Matches[1]
    $value = $Matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if ($Overwrite -or -not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

Import-EnvFile (Join-Path $root ".env")
Import-EnvFile (Join-Path $root ".env.local")
Import-EnvFile (Join-Path $root ".env.agents") -Overwrite

# Shared secrets stay in their existing app env files. Rehydrate blank service values
# into the process so Compose can inject only the variables each container needs.
$agentValues = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $root ".env.agents")) {
  if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $agentValues[$Matches[1]] = $Matches[2] }
}
if (-not $agentValues["OPENAI_API_KEY"]) { Import-EnvFile (Join-Path $root ".env.local") -Overwrite }
if (-not $agentValues["WORKER_SHARED_SECRET"] -or -not $agentValues["CONVEX_WORKER_URL"]) {
  Import-EnvFile (Join-Path $root ".env") -Overwrite
}

$required = @("WORKER_SHARED_SECRET", "CONVEX_WORKER_URL", "DEEPSEEK_API_KEY")
if ($agentValues["PROVIDER_MODE"] -ne "deepseek_only") { $required += "OPENAI_API_KEY" }
foreach ($name in $required) {
  if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
    throw "Missing required environment variable: $name"
  }
}

$env:AGENT_ENV_FILE = ".env.agents"
$services = if ($InfrastructureOnly) { @("timescaledb", "redis", "temporal") } else { @() }
$arguments = @("compose", "-f", "docker-compose.agents.yml")
$arguments += @("up", "-d")
if ($Build) { $arguments += "--build" }
$arguments += $services
Push-Location $root
try {
  & docker compose -f docker-compose.agents.yml --profile legacy-polling rm -s -f dispatcher
  if ($LASTEXITCODE -ne 0) { throw "Could not remove the legacy polling dispatcher." }
  & docker compose -f docker-compose.agents.yml --profile continuous-ingestion rm -s -f ingestors
  if ($LASTEXITCODE -ne 0) { throw "Could not remove background ingestors." }
  $legacyScheduler = docker ps -aq --filter "name=^moeazi-agents-scheduler-1$"
  if ($legacyScheduler) {
    & docker rm -f $legacyScheduler
    if ($LASTEXITCODE -ne 0) { throw "Could not remove the legacy scheduler." }
  }
  & docker @arguments --remove-orphans
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed with exit code $LASTEXITCODE" }
  & docker compose -f docker-compose.agents.yml ps
} finally {
  Pop-Location
}
