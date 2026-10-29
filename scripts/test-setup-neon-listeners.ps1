$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$source = Join-Path $PSScriptRoot 'setup-neon.ps1'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'setup-neon.ps1 syntax error' }
$function = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-ListenerPids' }, $true)
if (-not $function) { throw 'Missing Get-ListenerPids' }
Invoke-Expression $function.Extent.Text

function Get-NetTCPConnection {
  param([int] $LocalPort, [string] $State, [string] $ErrorAction)
  if ($LocalPort -ne 49123 -or $State -ne 'Listen') { throw 'Unexpected query' }
  switch ($script:case) {
    'empty' { throw 'No MSFT_NetTCPConnection objects found' }
    'one' { [pscustomobject]@{ OwningProcess = 1234 } }
    'many' {
      [pscustomobject]@{ OwningProcess = 1234 }
      [pscustomobject]@{ OwningProcess = 5678 }
      [pscustomobject]@{ OwningProcess = 1234 }
    }
    'error' { throw 'Access denied' }
  }
}
foreach ($scenario in @(
  @{ Name='empty'; Expected=@() },
  @{ Name='one'; Expected=@(1234) },
  @{ Name='many'; Expected=@(1234,5678) }
)) {
  $script:case = $scenario.Name
  $pids = @(Get-ListenerPids 49123)
  if ($pids.Count -ne $scenario.Expected.Count) { throw "$($scenario.Name): wrong count $($pids.Count)" }
  if (@($pids | Where-Object { $_ -isnot [int] }).Count -gt 0) { throw "$($scenario.Name): nested or noninteger PID" }
  if (($pids -join ',') -ne ($scenario.Expected -join ',')) { throw "$($scenario.Name): wrong PIDs $pids" }
  Write-Host "LISTENER_$($scenario.Name.ToUpperInvariant()) PASS"
}
$script:case = 'error'
try { @(Get-ListenerPids 49123) | Out-Null; throw 'Expected verification failure' }
catch { if ($_.Exception.Message -notmatch 'process') { throw } }
Write-Host 'LISTENER_UNVERIFIED_ERROR PASS'
