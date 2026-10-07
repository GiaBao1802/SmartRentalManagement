$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendUrl = 'http://localhost:3000'
$apiUrl = 'http://localhost:4000/api/health'

function Test-PortListening([int] $port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

try {
  $postgres = Get-Service -Name 'postgresql-x64-17' -ErrorAction SilentlyContinue
  if ($postgres -and $postgres.Status -ne 'Running') {
    Start-Service -Name 'postgresql-x64-17'
    $postgres.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
  }

  if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
    Write-Host 'Dang cai dependencies...'
    Push-Location $projectRoot
    npm install
    Pop-Location
  }

  if (-not (Test-PortListening 4000)) {
    $backendCommand = 'cd /d "' + $projectRoot + '" && npm run dev --workspace=@goctro/backend'
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $backendCommand) -WorkingDirectory $projectRoot
  }

  if (-not (Test-PortListening 3000)) {
    $frontendCommand = 'cd /d "' + $projectRoot + '" && npm run dev --workspace=@goctro/frontend'
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $frontendCommand) -WorkingDirectory $projectRoot
  }

  Write-Host 'Dang cho Next.js va API khoi dong...'
  $deadline = (Get-Date).AddSeconds(120)
  $frontendReady = $false
  $apiReady = $false
  while ((Get-Date) -lt $deadline -and (-not $frontendReady -or -not $apiReady)) {
    if (-not $frontendReady) {
      try {
        $null = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 3
        $frontendReady = $true
      } catch { }
    }
    if (-not $apiReady) {
      try {
        $null = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 3
        $apiReady = $true
      } catch { }
    }
    if (-not $frontendReady -or -not $apiReady) { Start-Sleep -Seconds 2 }
  }

  if ($frontendReady) {
    Start-Process $frontendUrl
    Write-Host 'Da mo web test UI/UX tai http://localhost:3000'
    if (-not $apiReady) { Write-Warning 'API chua san sang. Kiem tra cua so backend va PostgreSQL.' }
  } else {
    throw 'Next.js chua san sang sau 120 giay. Kiem tra cua so frontend.'
  }
} catch {
  Write-Host "Khong the khoi dong web: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
