$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$backendPort = 4000
$frontendPort = 3000

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

function Get-VerifiedRootPid([int] $ListenerPid, [object[]] $Snapshot, [ValidateSet('backend', 'frontend')] [string] $Kind) {
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

function Get-ListenerPids([int] $Port) {
  try {
    $pids = @((Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique))
    return ,$pids
  }
  catch { return ,@() }
}

$snapshot = Get-ProcessSnapshot
$stopped = [System.Collections.Generic.HashSet[int]]::new()
foreach ($entry in @(@{ Port = $backendPort; Kind = 'backend' }, @{ Port = $frontendPort; Kind = 'frontend' })) {
  foreach ($listenerPid in (Get-ListenerPids $entry.Port)) {
    $listenerPid = [int]$listenerPid
    if ($stopped.Contains($listenerPid)) { continue }
    $rootPid = Get-VerifiedRootPid $listenerPid $snapshot $entry.Kind
    if ($rootPid -le 0) {
      Write-Host "Skipped port $($entry.Port): listener PID $listenerPid is not verified as this project's $($entry.Kind)." -ForegroundColor Yellow
      continue
    }
    foreach ($id in (Get-TreeProcessIds $rootPid $snapshot)) {
      Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
      [void]$stopped.Add([int]$id)
    }
    Write-Host "Stopped verified project $($entry.Kind) process tree (root PID $rootPid)."
  }
}
Write-Host 'PostgreSQL was left running.'
