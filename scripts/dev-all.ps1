param(
  [string] $ConfirmedDatabase = '',
  [switch] $RestartVerified,
  [int] $PostgresPort = 5432,
  [int] $BackendPort = 4000,
  [int] $FrontendPort = 3000,
  [int] $BackendTimeoutSeconds = 30,
  [int] $FrontendTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$backendEnv = Join-Path $projectRoot 'backend/.env'
if ($env:GOCTRO_SETUP_CONFIG_DIR) { $backendEnv = Join-Path $env:GOCTRO_SETUP_CONFIG_DIR 'backend.env' }
$runtimeDirectory = Join-Path $projectRoot '.local/dev-all'
if ($env:GOCTRO_SETUP_RUNTIME_DIR) { $runtimeDirectory = Join-Path $env:GOCTRO_SETUP_RUNTIME_DIR 'dev-all' }
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
  $child = $null
  for ($depth = 0; $depth -lt 12 -and $currentId -gt 0; $depth++) {
    if (-not $seen.Add($currentId)) { break }
    $process = $Snapshot | Where-Object { [int]$_.ProcessId -eq $currentId } | Select-Object -First 1
    if (-not $process) { break }
    if ($child -and (-not $process.CreationDate -or -not $child.CreationDate -or [datetime]$process.CreationDate -gt [datetime]$child.CreationDate)) { break }
    $chain.Add($process)
    $child = $process
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
  $workspaceMarker = $workspaceMarker.Replace('/', '\')
  $rootPid = [int]$chain[0].ProcessId
  foreach ($process in $chain) {
    $command = ([string]$process.CommandLine).ToLowerInvariant().Replace('/', '\')
    if ($command.Contains($workspaceMarker)) { return [int]$process.ProcessId }
    elseif (Test-ProjectEntry $process $Kind) { $rootPid = [int]$process.ProcessId }
  }
  return $rootPid
}

function Get-TreeProcessIds([int] $RootPid, [object[]] $Snapshot) {
  $rootProcess = $Snapshot | Where-Object { [int]$_.ProcessId -eq $RootPid } | Select-Object -First 1
  if (-not $rootProcess -or -not $rootProcess.CreationDate) { throw 'Không xác minh được thời điểm tạo process gốc; chưa dừng process.' }
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($RootPid)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $Snapshot) {
      if ($ids.Contains([int]$process.ParentProcessId)) {
        $parent = $Snapshot | Where-Object { [int]$_.ProcessId -eq [int]$process.ParentProcessId } | Select-Object -First 1
        if ($parent -and $parent.CreationDate -and $process.CreationDate -and [datetime]$process.CreationDate -ge [datetime]$parent.CreationDate -and $ids.Add([int]$process.ProcessId)) { $changed = $true }
      }
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
    $captured = $Snapshot | Where-Object { [int]$_.ProcessId -eq $id } | Select-Object -First 1
    $current = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $current) { continue }
    if ([Math]::Abs(($current.StartTime.ToUniversalTime() - ([datetime]$captured.CreationDate).ToUniversalTime()).TotalMilliseconds) -ge 2) { Write-Failure $FailureCode "PID $id đã đổi thời điểm tạo; không dừng PID có thể đã tái sử dụng." }
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
  $deadline = (Get-Date).AddSeconds(6)
  do {
    Start-Sleep -Milliseconds 250
    $remaining = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  } while ($remaining -and (Get-Date) -lt $deadline)
  if ($remaining) { Write-Failure $FailureCode "Cổng $Port chưa được giải phóng sau khi dừng process đã xác minh của project." }
}

function Get-ListenerPids([int] $Port) {
  try {
    $pids = @((Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique))
    return ,$pids
  }
  catch {
    if ($_.Exception.Message -match 'No MSFT_NetTCPConnection objects found|No matching MSFT_NetTCPConnection') { return ,@() }
    throw "Không xác minh được process đang giữ cổng $Port; dừng để kiểm tra quyền đọc process."
  }
}

function Get-SafeProcessLabel([int] $ProcessId, [object[]] $Snapshot) {
  $process = $Snapshot | Where-Object { [int]$_.ProcessId -eq $ProcessId } | Select-Object -First 1
  if (-not $process) { return "PID=$ProcessId; không đọc được thông tin process" }
  $name = [System.IO.Path]::GetFileName([string]$process.ExecutablePath)
  return "PID=$ProcessId; image=$name"
}

function Start-WorkspaceDev([ValidateSet('backend', 'frontend')] [string] $Kind, [string] $LogPath) {
  $workspace = if ($Kind -eq 'backend') { '@goctro/backend' } else { '@goctro/frontend' }
  $command = "npm run dev --workspace=$workspace"
  $previousPort = $env:PORT
  try {
    $env:PORT = if ($Kind -eq 'backend') { [string]$BackendPort } else { [string]$FrontendPort }
    Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', $command) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $LogPath -RedirectStandardError ($LogPath + '.err') | Out-Null
  } catch {
    Write-Failure "$($Kind.ToUpperInvariant())_START_FAILED" "Không chạy được npm dev. Xem $LogPath"
  } finally { $env:PORT = $previousPort }
}

function Wait-ForHealth([string] $Url, [int] $TimeoutSeconds, [string] $ExpectedService = '', [int] $Consecutive = 1) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $successes = 0
  do {
    $probe = Invoke-LocalGet $Url 2
    if ($probe.Status -eq 200) {
      if (-not $ExpectedService) { $successes++; if ($successes -ge $Consecutive) { return $true } }
      try {
        $body = $probe.Body | ConvertFrom-Json
        if ($body.status -eq 'ok' -and $body.service -eq $ExpectedService) { return $true }
      } catch { }
    } else { $successes = 0 }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Assert-Dependencies {
  $lockfile = Join-Path $projectRoot 'package-lock.json'
  if (-not (Test-Path -LiteralPath $lockfile -PathType Leaf)) {
    Write-Failure 'DEPENDENCIES_INCOMPLETE' 'Thiếu package-lock.json. Kiểm tra checkout rồi chạy setup.bat.'
  }
  $requiredExecutables = @('concurrently.cmd', 'next.cmd', 'prisma.cmd', 'tsx.cmd')
  $missing = @($requiredExecutables | Where-Object { -not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules/.bin/$_") -PathType Leaf) })
  if ($missing.Count) {
    Write-Failure 'DEPENDENCIES_INCOMPLETE' "Thiếu công cụ npm ($($missing -join ', ')). Chạy setup.bat để cài đúng lockfile."
  }
  $dependencyState = & node (Join-Path $PSScriptRoot 'setup-cache.mjs') installed
  if ($LASTEXITCODE -ne 0 -or $dependencyState -ne 'READY') {
    Write-Failure 'DEPENDENCIES_INCOMPLETE' 'Dependency không đủ/không khớp package-lock.json. Chạy setup.bat.'
  }
}

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
Write-Host 'Kiểm tra môi trường local và dependency...'
Assert-Dependencies
if ($FrontendPort -ne 3000) {
  Write-Failure 'FRONTEND_PORT_UNSUPPORTED' 'Frontend phải dùng cổng 3000 để khớp trusted origin của CSRF.'
}
$trustedFrontendOrigin = 'http://localhost:3000'
if ($env:FRONTEND_ORIGIN -and $env:FRONTEND_ORIGIN -ne $trustedFrontendOrigin) {
  Write-Failure 'FRONTEND_ORIGIN_MISMATCH' 'FRONTEND_ORIGIN phải là http://localhost:3000.'
}
if (-not $env:FRONTEND_ORIGIN) {
  $frontendOriginLine = Get-Content -LiteralPath $backendEnv -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*FRONTEND_ORIGIN\s*=' } | Select-Object -First 1
  if ($frontendOriginLine) {
    $configuredFrontendOrigin = ($frontendOriginLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if ($configuredFrontendOrigin -ne $trustedFrontendOrigin) {
      Write-Failure 'FRONTEND_ORIGIN_MISMATCH' 'FRONTEND_ORIGIN trong env backend phải là http://localhost:3000.'
    }
  }
}
if (-not (Test-Path -LiteralPath $backendEnv -PathType Leaf)) {
  Write-Failure 'BACKEND_START_FAILED' 'Thiếu cấu hình backend local. Chạy setup.bat ở chế độ cài lần đầu.'
}
$databaseUrl = $env:DATABASE_URL
$databaseSource = 'process environment'
if (-not $databaseUrl) {
  $databaseSource = 'backend/.env'
  $databaseLine = Get-Content -LiteralPath $backendEnv | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if ($databaseLine) { $databaseUrl = ($databaseLine -split '=', 2)[1].Trim().Trim('"').Trim("'") }
}
if (-not $databaseUrl) {
  Write-Failure 'BACKEND_START_FAILED' 'Thiếu DATABASE_URL trong cấu hình backend. Không hiển thị giá trị chứa secret.'
}
try {
  $databaseUri = [Uri]::new($databaseUrl)
  $databaseName = [Uri]::UnescapeDataString($databaseUri.AbsolutePath.Trim('/'))
} catch {
  Write-Failure 'BACKEND_START_FAILED' 'DATABASE_URL không hợp lệ; giá trị chứa secret được ẩn.'
}
if ($env:NODE_ENV -ne 'development') { Write-Failure 'ENVIRONMENT_REJECTED' 'Launcher chỉ chạy với NODE_ENV=development. Dùng setup.bat để đọc cấu hình local.' }
if ($databaseUri.Scheme -notin @('postgres','postgresql') -or $databaseUri.Host -notin @('localhost','127.0.0.1','::1') -or $databaseName -notmatch '^[A-Za-z][A-Za-z0-9_]{0,62}$' -or $databaseName -in @('postgres','template0','template1')) {
  Write-Failure 'TARGET_REJECTED' 'Chỉ hỗ trợ database PostgreSQL local/dev không phải database hệ thống.'
}
if ($ConfirmedDatabase -cne $databaseName) { Write-Failure 'TARGET_NOT_CONFIRMED' 'Target chưa được xác nhận. Hãy dùng setup.bat.' }
$PostgresPort = if ($databaseUri.Port -gt 0) { $databaseUri.Port } else { 5432 }
if (-not (Test-TcpPort $databaseUri.Host $PostgresPort)) {
  Write-Failure 'POSTGRES_NOT_REACHABLE' "Không kết nối được PostgreSQL tại $($databaseUri.Host):$PostgresPort. Kiểm tra dịch vụ hiện có; không tự bật/tắt PostgreSQL."
}
Write-Host "PostgreSQL OK: host=$($databaseUri.Host); port=$PostgresPort; database=$databaseName"

$processStamp = Join-Path $runtimeDirectory 'processes.json'
$recorded = $null
try { $recorded = Get-Content -LiteralPath $processStamp -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
function Test-RecordedProcess([string]$kind, [int]$processId) {
  if (-not $recorded -or -not $recorded.PSObject.Properties[$kind] -or -not $recorded.PSObject.Properties['target']) { return $false }
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) { return $false }
  $entry = $recorded.$kind
  if (-not $entry -or -not $entry.PSObject.Properties['id'] -or -not $entry.PSObject.Properties['started']) { return $false }
  return $entry -and $entry.id -eq $processId -and $entry.started -eq $process.StartTime.ToUniversalTime().Ticks.ToString() -and $recorded.target -eq "$($databaseUri.Host):$PostgresPort/$databaseName"
}

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
  Write-Failure 'PORT_4000_OCCUPIED_BY_UNKNOWN_PROCESS' "Nhiều process giữ cổng $BackendPort ($($backendPids -join ', ')); chưa dừng process nào."
}

if ($backendPids.Count -eq 1) {
  $ownerPid = [int]$backendPids[0]
  $snapshot = Get-ProcessSnapshot
  $verifiedRootPid = Get-VerifiedProjectRootPid $ownerPid $snapshot 'backend'
  if ($verifiedRootPid -le 0) {
    $label = Get-SafeProcessLabel $ownerPid $snapshot
    Write-Failure 'PORT_4000_OCCUPIED_BY_UNKNOWN_PROCESS' "Cổng $BackendPort bị process chưa xác minh giữ ($label). Giữ nguyên process; kiểm tra và xử lý cổng trước khi chạy lại."
  }
  if (-not $backendHealthy -or $RestartVerified -or -not (Test-RecordedProcess 'backend' $ownerPid)) {
    Write-Warning "Khởi động lại backend đã xác minh thuộc project ($((Get-SafeProcessLabel $ownerPid $snapshot)))."
    Stop-VerifiedTree $verifiedRootPid $snapshot $BackendPort
    $backendPids = @()
  } else {
    Write-Host 'Backend OK (đã xác minh project; tái sử dụng)'
  }
}

if ($backendPids.Count -eq 0) {
  Start-WorkspaceDev 'backend' $backendLog
  if (-not (Wait-ForHealth $backendHealthUrl $BackendTimeoutSeconds 'backend')) {
    $snapshot = Get-ProcessSnapshot
    $listeners = Get-ListenerPids $BackendPort
    $ownerPid = if ($listeners.Count) { $listeners[0] } else { $null }
    if ($ownerPid) {
      $rootPid = Get-VerifiedProjectRootPid ([int]$ownerPid) $snapshot 'backend'
      if ($rootPid -gt 0) { Stop-VerifiedTree $rootPid $snapshot $BackendPort }
    }
    Write-Failure 'BACKEND_HEALTH_TIMEOUT' "Backend chưa trả HTTP 200 sau $BackendTimeoutSeconds giây. Xem $backendLog"
  }
  Write-Host 'Backend OK (vừa khởi động)'
} else {
  Write-Host 'Backend OK (đã xác minh project; tái sử dụng)'
}

$dbHealth = Invoke-LocalGet "$backendUrl/api/health/db" 4
if ($dbHealth.Status -ne 200) {
  if ($backendPids.Count -eq 0) {
    $snapshot = Get-ProcessSnapshot
    $listeners = Get-ListenerPids $BackendPort
    $ownerPid = if ($listeners.Count) { $listeners[0] } else { $null }
    if ($ownerPid) {
      $rootPid = Get-VerifiedProjectRootPid ([int]$ownerPid) $snapshot 'backend'
      if ($rootPid -gt 0) { Stop-VerifiedTree $rootPid $snapshot $BackendPort }
    }
  }
  Write-Failure 'BACKEND_DB_HEALTH_FAILED' "Backend truy cập được nhưng /api/health/db trả HTTP $($dbHealth.Status). Kiểm tra kết nối database; các bước trước đã hoàn thành vẫn được giữ."
}
Write-Host 'Kết nối database qua API OK'

$frontendPids = Get-ListenerPids $FrontendPort
if ($frontendPids.Count -gt 1) {
  Write-Failure 'FRONTEND_START_FAILED' "Nhiều process giữ cổng $FrontendPort; chưa dừng process nào."
}
$frontendProbe = Invoke-LocalGet "$frontendUrl/" 3
$frontendHealthy = $frontendProbe.Status -ge 200 -and $frontendProbe.Status -lt 400
if ($frontendPids.Count -eq 1 -and (-not $frontendHealthy -or $RestartVerified -or -not (Test-RecordedProcess 'frontend' ([int]$frontendPids[0])))) {
  $ownerPid = [int]$frontendPids[0]
  $snapshot = Get-ProcessSnapshot
  $verifiedRootPid = Get-VerifiedProjectRootPid $ownerPid $snapshot 'frontend'
  if ($verifiedRootPid -le 0) {
    Write-Failure 'FRONTEND_START_FAILED' "Cổng $FrontendPort bị process chưa xác minh giữ ($((Get-SafeProcessLabel $ownerPid $snapshot))); giữ nguyên process."
  }
  Write-Warning "Khởi động lại frontend đã xác minh thuộc project ($((Get-SafeProcessLabel $ownerPid $snapshot)))."
  Stop-VerifiedTree $verifiedRootPid $snapshot $FrontendPort 'FRONTEND_START_FAILED'
  $frontendPids = @()
}
if ($frontendPids.Count -eq 0) {
  $frontendReady = $false
  for ($attempt = 1; $attempt -le 2; $attempt++) {
    Start-WorkspaceDev 'frontend' $frontendLog
    if (Wait-ForHealth "$frontendUrl/" $FrontendTimeoutSeconds '' 3) { $frontendReady = $true; break }
    $snapshot = Get-ProcessSnapshot
    $listeners = Get-ListenerPids $FrontendPort
    $ownerPid = if ($listeners.Count) { $listeners[0] } else { $null }
    if ($ownerPid) {
      $rootPid = Get-VerifiedProjectRootPid ([int]$ownerPid) $snapshot 'frontend'
      if ($rootPid -gt 0) { Stop-VerifiedTree $rootPid $snapshot $FrontendPort 'FRONTEND_START_FAILED' }
    }
    if ($ownerPid -and (Get-VerifiedProjectRootPid ([int]$ownerPid) $snapshot 'frontend') -le 0) { Write-Failure 'FRONTEND_START_FAILED' 'Cổng frontend đã bị process khác chiếm trong lúc chờ; giữ nguyên process.' }
    if ($attempt -eq 1) { Write-Host 'Frontend chưa ổn định hoặc vừa thoát; thử khởi động lại một lần sau khi đã kiểm tra cổng/process.' }
  }
  if (-not $frontendReady) { Write-Failure 'FRONTEND_START_FAILED' "Frontend chưa ổn định sau hai lần thử. Xem $frontendLog và .err; kiểm tra cảnh báo dependency/cổng trước khi thử lại." }
  Write-Host 'Frontend OK (vừa khởi động)'
} else {
  if (-not $frontendHealthy) { Write-Failure 'FRONTEND_START_FAILED' "Cổng $FrontendPort đang bị giữ nhưng không trả HTTP 2xx/3xx." }
  $snapshot = Get-ProcessSnapshot
  $ownerPid = [int]$frontendPids[0]
  if ((Get-VerifiedProjectRootPid $ownerPid $snapshot 'frontend') -le 0) {
    Write-Failure 'FRONTEND_START_FAILED' "Cổng $FrontendPort trả HTTP nhưng không thuộc frontend project ($((Get-SafeProcessLabel $ownerPid $snapshot))); không tạo process trùng."
  }
  Write-Host 'Frontend OK (đang chạy; tái sử dụng)'
}

$csrf = Invoke-LocalGet "$backendUrl/api/v1/auth/csrf" 4 $trustedFrontendOrigin
if ($csrf.Status -ne 200) { Write-Failure 'BACKEND_START_FAILED' "Khởi tạo CSRF trả HTTP $($csrf.Status)." }
try {
  $csrfBody = $csrf.Body | ConvertFrom-Json
  if (-not $csrfBody.data.csrf_token) { Write-Failure 'BACKEND_START_FAILED' 'Endpoint CSRF trả HTTP 200 nhưng thiếu token.' }
} catch { Write-Failure 'BACKEND_START_FAILED' 'Không đọc được phản hồi CSRF.' }
$csrfAllowOrigin = [string]$csrf.Headers['Access-Control-Allow-Origin']
$csrfAllowCredentials = [string]$csrf.Headers['Access-Control-Allow-Credentials']
if ($csrfAllowOrigin -ne $trustedFrontendOrigin -or $csrfAllowCredentials -ne 'true') {
  Write-Failure 'BACKEND_START_FAILED' 'CSRF không cho phép trusted frontend origin kèm credential.'
}

Write-Host 'CSRF             OK'
$processRecord = @{ target = "$($databaseUri.Host):$PostgresPort/$databaseName" }
foreach ($kind in @('backend','frontend')) {
  $port = if ($kind -eq 'backend') { $BackendPort } else { $FrontendPort }
  $listeners = Get-ListenerPids $port
  if (-not $listeners.Count) { Write-Failure 'PROCESS_EXITED_AFTER_HEALTH' "Process $kind đã thoát sau health; chưa ghi dấu startup thành công. Xem log." }
  $listener = [int]$listeners[0]
  $snapshot = Get-ProcessSnapshot
  if ((Get-VerifiedProjectRootPid $listener $snapshot $kind) -le 0) { Write-Failure 'PROCESS_OWNER_CHANGED' "Process giữ cổng $port không còn được xác minh thuộc $kind của project. Giữ nguyên process và chưa ghi dấu startup thành công." }
  $process = Get-Process -Id $listener -ErrorAction SilentlyContinue
  if (-not $process) { Write-Failure 'PROCESS_EXITED_AFTER_HEALTH' "Process $kind đã thoát sau health; chưa ghi dấu startup thành công. Xem log." }
  $processRecord[$kind] = @{ id = $listener; started = $process.StartTime.ToUniversalTime().Ticks.ToString() }
}
$processRecord | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $processStamp -Encoding UTF8
Write-Host ''
Write-Host 'Môi trường local đã sẵn sàng.' -ForegroundColor Green
Write-Host "Frontend: $frontendUrl"
Write-Host "Login:    $frontendUrl/login"
