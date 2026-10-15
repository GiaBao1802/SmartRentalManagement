$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$exitCode = 1

Push-Location $projectRoot
try {
  npm run dev:all
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) {
    Start-Process 'http://localhost:3000'
  }
} catch {
  Write-Host "Could not start the local environment: $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
} finally {
  Pop-Location
}

exit $exitCode
