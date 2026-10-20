param(
  [int] $PostgresPort = 5432,
  [int] $BackendPort = 4000,
  [int] $FrontendPort = 3000,
  [int] $BackendTimeoutSeconds = 30,
  [int] $FrontendTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$backendEnv = Join-Path $projectRoot 'backend/.env'
$runtimeDirectory = Join-Path $projectRoot '.local/dev-all'
$backendLog = Join-Path $runtimeDirectory 'backend.log'
$frontendLog = Join-Path $runtimeDirectory 'frontend.log'
$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://localhost:$FrontendPort"

function Write-Failure([string] $Code, [string] $Message) {
  Write-Host "$Code`: $Message" -ForegroundColor Red
  exit 1
}

function Test-TcpPort([string] $HostName, [int] $Port, [int] $TimeoutMilliseconds = 2000) {
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync($HostName, $Port)
    if (-not $task.Wait($TimeoutMilliseconds)) { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Invoke-LocalGet([string] $Url, [int] $TimeoutSeconds = 3, [string] $Origin = '') {
  $request = [System.Net.HttpWebRequest]::Create($Url)
  $request.Method = 'GET'
  $request.Timeout = $TimeoutSeconds * 1000
  $request.ReadWriteTimeout = $TimeoutSeconds * 1000
  $request.Proxy = $null
  if ($Origin) { $request.Headers['Origin'] = $Origin }
  $response = $null
  try {
    $response = [System.Net.HttpWebResponse]$request.GetResponse()
  } catch [System.Net.WebException] {
    if ($_.Exception.Response -is [System.Net.HttpWebResponse]) {
      $response = [System.Net.HttpWebResponse]$_.Exception.Response
    } else {
      return [pscustomobject]@{ Status = 0; Body = ''; Error = $_.Exception.Message; Headers = $null }
    }
  }
  try {
    $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
    $body = $reader.ReadToEnd()
    $reader.Dispose()
    return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = $body; Error = ''; Headers = $response.Headers }
  } finally {
    $response.Dispose()
  }
}

function Get-ProcessSnapshot {
  try { return @(Get-CimInstance Win32_Process) }
  catch { return @() }
}

function Get-ProcessChain([int] $ProcessId, [object[]] $Snapshot) {
  $chain = [System.Collections.Generic.List[object]]::new()
  $seen = [System.Collections.Generic.HashSet[int]]::new()
  $currentId = $ProcessId
  for ($depth = 0; $depth -lt 12 -and $currentId -gt 0; $depth++) {
    if (-not $seen.Add($currentId)) { break }
    $process = $Snapshot | Where-Object { [int]$_.ProcessId -eq $currentId } | Select-Object -First 1
    if (-not $process) { break }
    $chain.Add($process)
    $currentId = [int]$process.ParentProcessId
  }
  return ,$chain.ToArray()
}

function Test-ProjectEntry([object] $Process, [ValidateSet('backend', 'frontend')] [string] $Kind) {
  if (-not $Process.CommandLine -or -not $Process.ExecutablePath) { return $false }
  $command = ([string]$Process.CommandLine).ToLowerInvariant().Replace('/', '\')
  $root = $projectRoot.ToLowerInvariant().Replace('/', '\')
  $image = [System.IO.Path]::GetFileName([string]$Process.ExecutablePath).ToLowerInvariant()
  if ($image -notin @('node.exe', 'node')) { return $false }
  if (-not $command.Contains($root)) { return $false }
  if ($Kind -eq 'backend') {
    return (
      ($command -match 'node_modules\\tsx\\dist\\preflight\.cjs' -and $command -match 'src\\server\.ts') -or
      ($command -match 'node_modules\\tsx\\dist\\cli\.mjs' -and $command -match 'watch.*src\\server\.ts') -or
      ($command -match 'backend\\dist\\server\.js')
    )
  }
  return ($command -match 'next\\dist\\server\\lib\\start-server\.js')
}

function Get-VerifiedProjectRootPid([int] $ListenerPid, [object[]] $Snapshot, [ValidateSet('backend', 'frontend')] [string] $Kind) {
  $chain = Get-ProcessChain $ListenerPid $Snapshot
  if (-not $chain.Count -or -not (Test-ProjectEntry $chain[0] $Kind)) { return 0 }
  $workspaceMarker = if ($Kind -eq 'backend') { 'npm run dev --workspace=@goctro/backend' } else { 'npm run dev --workspace=@goctro/frontend' }
  $watchMarker = if ($Kind -eq 'backend') { 'tsx' } else { 'next' }
  $rootPid = [int]$chain[0].ProcessId
  foreach ($process in $chain) {
    $command = ([string]$process.CommandLine).ToLowerInvariant().Replace('/', '\')
    if ($command.Contains($workspaceMarker)) { $rootPid = [int]$process.ProcessId }
    elseif ($command.Contains($watchMarker) -and $command.Contains($projectRoot.ToLowerInvariant().Replace('/', '\'))) { $rootPid = [int]$process.ProcessId }
  }
  return $rootPid
}

function Get-TreeProcessIds([int] $RootPid, [object[]] $Snapshot) {
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootPid)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $Snapshot) {
      if ($ids.Contains([int]$process.ParentProcessId) -and $ids.Add([int]$process.ProcessId)) { $changed = $true }
    }
  }
  $depths = @{}
  foreach ($id in $ids) {
    $depth = 0
    $current = $id
    while ($current -ne $RootPid -and $depth -lt 20) {
      $node = $Snapshot | Where-Object { [int]$_.ProcessId -eq $current } | Select-Object -First 1
      if (-not $node) { break }
      $current = [int]$node.ParentProcessId
      $depth++
    }
    $depths[$id] = $depth
  }
  return @($ids | Sort-Object { $depths[$_] } -Descending)
}

function Stop-VerifiedTree([int] $RootPid, [object[]] $Snapshot, [int] $Port, [string] $FailureCode = 'BACKEND_START_FAILED') {
  foreach ($id in (Get-TreeProcessIds $RootPid $Snapshot)) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
  $deadline = (Get-Date).AddSeconds(6)
  do {
    Start-Sleep -Milliseconds 250
    $remaining = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  } while ($remaining -and (Get-Date) -lt $deadline)
  if ($remaining) { Write-Failure $FailureCode "port $Port did not release after stopping the verified project process tree." }
}

function Get-ListenerPids([int] $Port) {
  try {
    $pids = @((Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique))
    return ,$pids
  }
  catch {
    if ($_.Exception.Message -match 'No MSFT_NetTCPConnection objects found|No matching MSFT_NetTCPConnection') { return ,@() }
    throw "Could not safely inspect port $Port listener ownership: $($_.Exception.Message)"
  }
}

function Get-SafeProcessLabel([int] $ProcessId, [object[]] $Snapshot) {
  $process = $Snapshot | Where-Object { [int]$_.ProcessId -eq $ProcessId } | Select-Object -First 1
  if (-not $process) { return "PID=$ProcessId; process details unavailable" }
  $name = [System.IO.Path]::GetFileName([string]$process.ExecutablePath)
  return "PID=$ProcessId; image=$name"
}

function Start-WorkspaceDev([ValidateSet('backend', 'frontend')] [string] $Kind, [string] $LogPath) {
  $workspace = if ($Kind -eq 'backend') { '@goctro/backend' } else { '@goctro/frontend' }
  $command = "npm run dev --workspace=$workspace"
  try {
    Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', $command) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $LogPath -RedirectStandardError ($LogPath + '.err') | Out-Null
  } catch {
    Write-Failure "$($Kind.ToUpperInvariant())_START_FAILED" "could not start the existing npm dev script. See $LogPath"
  }
}

function Wait-ForHealth([string] $Url, [int] $TimeoutSeconds, [string] $ExpectedService = '') {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $probe = Invoke-LocalGet $Url 2
    if ($probe.Status -eq 200) {
      if (-not $ExpectedService) { return $true }
      try {
        $body = $probe.Body | ConvertFrom-Json
        if ($body.status -eq 'ok' -and $body.service -eq $ExpectedService) { return $true }
      } catch { }
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Assert-Dependencies {
  $lockfile = Join-Path $projectRoot 'package-lock.json'
  if (-not (Test-Path -LiteralPath $lockfile -PathType Leaf)) {
    Write-Failure 'DEPENDENCIES_INCOMPLETE' 'package-lock.json is missing. Run setup.bat from a clean checkout.'
  }
  $requiredExecutables = @('concurrently.cmd', 'next.cmd', 'prisma.cmd', 'tsx.cmd')
  $missing = @($requiredExecutables | Where-Object { -not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules/.bin/$_") -PathType Leaf) })
  if ($missing.Count) {
    Write-Failure 'DEPENDENCIES_INCOMPLETE' "Required npm executables are missing ($($missing -join ', ')). Run setup.bat; the launcher will not reinstall packages."
  }
  $dependencyCheck = Join-Path $runtimeDirectory 'dependency-check.json'
  & npm.cmd ls --workspaces --include=dev --depth=0 --json *> $dependencyCheck
  if ($LASTEXITCODE -ne 0) {
    Write-Failure 'DEPENDENCIES_INCOMPLETE' "Installed dependencies do not match package-lock.json. Run setup.bat; see $dependencyCheck"
  }
}

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
Write-Host 'Checking local prerequisites...'
Assert-Dependencies
if ($FrontendPort -ne 3000) {
  Write-Failure 'FRONTEND_PORT_UNSUPPORTED' 'This launcher is restricted to frontend port 3000 because backend CSRF origin is configured as one exact trusted origin.'
}
$trustedFrontendOrigin = 'http://localhost:3000'
if ($env:FRONTEND_ORIGIN -and $env:FRONTEND_ORIGIN -ne $trustedFrontendOrigin) {
  Write-Failure 'FRONTEND_ORIGIN_MISMATCH' 'Process FRONTEND_ORIGIN must be exactly http://localhost:3000 for this launcher.'
}
if (-not $env:FRONTEND_ORIGIN) {
  $frontendOriginLine = Get-Content -LiteralPath $backendEnv -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*FRONTEND_ORIGIN\s*=' } | Select-Object -First 1
  if ($frontendOriginLine) {
    $configuredFrontendOrigin = ($frontendOriginLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if ($configuredFrontendOrigin -ne $trustedFrontendOrigin) {
      Write-Failure 'FRONTEND_ORIGIN_MISMATCH' 'backend/.env FRONTEND_ORIGIN must be exactly http://localhost:3000 for this launcher.'
    }
  }
}
if (-not (Test-TcpPort 'localhost' $PostgresPort)) {
  Write-Failure 'POSTGRES_NOT_REACHABLE' "PostgreSQL is not reachable at localhost:$PostgresPort. Start the existing PostgreSQL 18 service and retry. No database process was started or stopped."
}
if (-not (Test-Path -LiteralPath $backendEnv -PathType Leaf)) {
  Write-Failure 'BACKEND_START_FAILED' 'backend/.env is missing. Create it locally; secrets are not displayed by this launcher.'
}
$databaseUrl = $env:DATABASE_URL
$databaseSource = 'process environment'
if (-not $databaseUrl) {
  $databaseSource = 'backend/.env'
  $databaseLine = Get-Content -LiteralPath $backendEnv | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if ($databaseLine) { $databaseUrl = ($databaseLine -split '=', 2)[1].Trim().Trim('"').Trim("'") }
}
if (-not $databaseUrl) {
  Write-Failure 'BACKEND_START_FAILED' 'DATABASE_URL is missing from the backend environment. The value will not be printed.'
}
try {
  $databaseUri = [Uri]::new($databaseUrl)
  $databaseName = [Uri]::UnescapeDataString($databaseUri.AbsolutePath.Trim('/'))
} catch {
  Write-Failure 'BACKEND_START_FAILED' 'DATABASE_URL is not a valid PostgreSQL connection URL. The value will not be printed.'
}
if ($databaseUri.Host -notin @('localhost', '127.0.0.1', '::1') -or $databaseUri.Port -ne $PostgresPort -or $databaseName -ne 'Goctro_test3') {
  $actualTarget = "host=$($databaseUri.Host); port=$($databaseUri.Port); database=$databaseName; source=$databaseSource"
  Write-Failure 'BACKEND_START_FAILED' "configured database target must be localhost:$PostgresPort/Goctro_test3. Found $actualTarget. Credentials are not displayed."
}
Write-Host 'PostgreSQL       OK'

$backendHealthUrl = "$backendUrl/api/health"
$backendHealth = Invoke-LocalGet $backendHealthUrl 3
$backendPids = Get-ListenerPids $BackendPort
$backendHealthy = $false
if ($backendHealth.Status -eq 200) {
  try {
    $healthBody = $backendHealth.Body | ConvertFrom-Json
    $backendHealthy = ($healthBody.status -eq 'ok' -and $healthBody.service -eq 'backend')
  } catch { }
}

if ($backendPids.Count -gt 1) {
  Write-Failure 'PORT_4000_OCCUPIED_BY_UNKNOWN_PROCESS' "multiple distinct processes own port $BackendPort ($($backendPids -join ', ')); none were stopped."
}

if ($backendPids.Count -eq 1) {
  $ownerPid = [int]$backendPids[0]
  $snapshot = Get-ProcessSnapshot
  $verifiedRootPid = Get-VerifiedProjectRootPid $ownerPid $snapshot 'backend'
  if ($verifiedRootPid -le 0) {
    $label = Get-SafeProcessLabel $ownerPid $snapshot
    Write-Failure 'PORT_4000_OCCUPIED_BY_UNKNOWN_PROCESS' "port $BackendPort is occupied by an unverified process ($label). It was left untouched; stop it manually or choose a free port."
  }
  if (-not $backendHealthy) {
    Write-Warning "Stale backend verified in the project process tree ($((Get-SafeProcessLabel $ownerPid $snapshot))); restarting that tree only."
    Stop-VerifiedTree $verifiedRootPid $snapshot $BackendPort
    $backendPids = @()
  } else {
    Write-Host "Backend          OK (healthy; verified project ownership; reused)"
  }
}

if ($backendPids.Count -eq 0) {
  Start-WorkspaceDev 'backend' $backendLog
  if (-not (Wait-ForHealth $backendHealthUrl $BackendTimeoutSeconds 'backend')) {
    $snapshot = Get-ProcessSnapshot
    $ownerPid = (Get-ListenerPids $BackendPort | Select-Object -First 1)
    if ($ownerPid) {
      $rootPid = Get-VerifiedProjectRootPid ([int]$ownerPid) $snapshot 'backend'
      if ($rootPid -gt 0) { Stop-VerifiedTree $rootPid $snapshot $BackendPort }
    }
    Write-Failure 'BACKEND_HEALTH_TIMEOUT' "backend did not return HTTP 200 within $BackendTimeoutSeconds seconds. See $backendLog"
  }
  Write-Host 'Backend          OK (started)'
} else {
  Write-Host 'Backend          OK (already healthy; verified project ownership; reused)'
}

$dbHealth = Invoke-LocalGet "$backendUrl/api/health/db" 4
if ($dbHealth.Status -ne 200) {
  if ($backendPids.Count -eq 0) {
    $snapshot = Get-ProcessSnapshot
    $ownerPid = (Get-ListenerPids $BackendPort | Select-Object -First 1)
    if ($ownerPid) {
      $rootPid = Get-VerifiedProjectRootPid ([int]$ownerPid) $snapshot 'backend'
      if ($rootPid -gt 0) { Stop-VerifiedTree $rootPid $snapshot $BackendPort }
    }
  }
  Write-Failure 'BACKEND_DB_HEALTH_FAILED' "backend is reachable but /api/health/db returned HTTP $($dbHealth.Status). Check local database connectivity; no migration or seed was run."
}
Write-Host 'Database health  OK'

$frontendPids = Get-ListenerPids $FrontendPort
if ($frontendPids.Count -gt 1) {
  Write-Failure 'FRONTEND_START_FAILED' "multiple distinct processes own port $FrontendPort; none were stopped."
}
$frontendProbe = Invoke-LocalGet "$frontendUrl/" 3
$frontendHealthy = $frontendProbe.Status -ge 200 -and $frontendProbe.Status -lt 400
if ($frontendPids.Count -eq 1 -and -not $frontendHealthy) {
  $ownerPid = [int]$frontendPids[0]
  $snapshot = Get-ProcessSnapshot
  $verifiedRootPid = Get-VerifiedProjectRootPid $ownerPid $snapshot 'frontend'
  if ($verifiedRootPid -le 0) {
    Write-Failure 'FRONTEND_START_FAILED' "port $FrontendPort is occupied by $((Get-SafeProcessLabel $ownerPid $snapshot)); the process was left untouched."
  }
  Write-Warning "Stale frontend verified in the project process tree ($((Get-SafeProcessLabel $ownerPid $snapshot))); restarting that tree only."
  Stop-VerifiedTree $verifiedRootPid $snapshot $FrontendPort 'FRONTEND_START_FAILED'
  $frontendPids = @()
}
if ($frontendPids.Count -eq 0) {
  Start-WorkspaceDev 'frontend' $frontendLog
  if (-not (Wait-ForHealth "$frontendUrl/" $FrontendTimeoutSeconds)) {
    $snapshot = Get-ProcessSnapshot
    $ownerPid = (Get-ListenerPids $FrontendPort | Select-Object -First 1)
    if ($ownerPid) {
      $rootPid = Get-VerifiedProjectRootPid ([int]$ownerPid) $snapshot 'frontend'
      if ($rootPid -gt 0) { Stop-VerifiedTree $rootPid $snapshot $FrontendPort 'FRONTEND_START_FAILED' }
    }
    Write-Failure 'FRONTEND_START_FAILED' "frontend did not become reachable within $FrontendTimeoutSeconds seconds. See $frontendLog"
  }
  Write-Host 'Frontend         OK (started)'
} else {
  if (-not $frontendHealthy) { Write-Failure 'FRONTEND_START_FAILED' "port $FrontendPort is occupied, but the frontend did not return HTTP 2xx/3xx." }
  $snapshot = Get-ProcessSnapshot
  $ownerPid = [int]$frontendPids[0]
  if ((Get-VerifiedProjectRootPid $ownerPid $snapshot 'frontend') -le 0) {
    Write-Failure 'FRONTEND_START_FAILED' "port $FrontendPort serves HTTP but is not owned by this project's frontend ($((Get-SafeProcessLabel $ownerPid $snapshot))); no duplicate was started."
  }
  Write-Host 'Frontend         OK (already healthy; reused)'
}

$csrf = Invoke-LocalGet "$backendUrl/api/v1/auth/csrf" 4 $trustedFrontendOrigin
if ($csrf.Status -ne 200) { Write-Failure 'BACKEND_START_FAILED' "CSRF bootstrap returned HTTP $($csrf.Status)." }
try {
  $csrfBody = $csrf.Body | ConvertFrom-Json
  if (-not $csrfBody.data.csrf_token) { Write-Failure 'BACKEND_START_FAILED' 'CSRF endpoint returned HTTP 200 without a token.' }
} catch { Write-Failure 'BACKEND_START_FAILED' 'CSRF endpoint returned an unreadable response.' }
$csrfAllowOrigin = [string]$csrf.Headers['Access-Control-Allow-Origin']
$csrfAllowCredentials = [string]$csrf.Headers['Access-Control-Allow-Credentials']
if ($csrfAllowOrigin -ne $trustedFrontendOrigin -or $csrfAllowCredentials -ne 'true') {
  Write-Failure 'BACKEND_START_FAILED' 'CSRF endpoint did not allow the expected frontend origin with credentials.'
}

Write-Host 'CSRF             OK'
Write-Host ''
Write-Host 'Local environment is ready.' -ForegroundColor Green
Write-Host "Frontend: $frontendUrl"
Write-Host "Login:    $frontendUrl/login"
