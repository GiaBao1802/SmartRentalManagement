$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = 'D:\fixture\Goctro'
foreach ($file in @('dev-all.ps1','dev-stop.ps1')) {
  $name = if ($file -eq 'dev-all.ps1') { 'Get-VerifiedProjectRootPid' } else { 'Get-VerifiedRootPid' }
  $tokens = $null; $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file),[ref]$tokens,[ref]$errors)
  if ($errors.Count) { throw 'Không parse được helper process.' }
  $wanted = @('Get-ProcessChain','Test-ProjectEntry','Get-TreeProcessIds',$name)
  foreach ($definition in $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $wanted},$false)) {
    Invoke-Expression $definition.Extent.Text
  }
  foreach ($kind in @('backend','frontend')) {
    $entry = if ($kind -eq 'backend') { 'D:\fixture\Goctro\node_modules\tsx\dist\preflight.cjs D:\fixture\Goctro\backend\src\server.ts' } else { 'D:\fixture\Goctro\node_modules\next\dist\server\lib\start-server.js' }
    $marker = if ($kind -eq 'backend') { 'tsx' } else { 'next' }
    $snapshot = @(
      [pscustomobject]@{ProcessId=100;ParentProcessId=101;CreationDate=[datetime]'2026-01-01T00:00:03';ExecutablePath='C:\node\node.exe';CommandLine="node $entry"},
      [pscustomobject]@{ProcessId=101;ParentProcessId=102;CreationDate=[datetime]'2026-01-01T00:00:02';ExecutablePath='C:\Windows\cmd.exe';CommandLine="cmd /c npm run dev --workspace=@goctro/$kind"},
      [pscustomobject]@{ProcessId=102;ParentProcessId=0;CreationDate=[datetime]'2026-01-01T00:00:01';ExecutablePath='C:\node\node.exe';CommandLine="node D:\fixture\Goctro\node_modules\$marker\test-harness.js"}
    )
    $actual = & $name 100 $snapshot $kind
    if ($actual -ne 101) { throw "$file chọn nhầm ancestor: $actual; cần PID 101." }
    $phantom = [pscustomobject]@{ProcessId=200;ParentProcessId=101;CreationDate=[datetime]'2025-01-01T00:00:00';ExecutablePath='C:\node\node.exe';CommandLine='unrelated process from an old PID generation'}
    $tree = @(Get-TreeProcessIds 101 ($snapshot + @($phantom)))
    if ($tree.Count -ne 2 -or $tree -contains 200) { throw "$file theo nhầm descendant do ParentProcessId đã tái sử dụng." }
    $snapshot[1].CreationDate = [datetime]'2026-01-02T00:00:00'
    if ((& $name 100 $snapshot $kind) -ne 100) { throw "$file theo nhầm ancestor PID được tạo sau child." }
    $snapshot[1].CreationDate = [datetime]'2026-01-01T00:00:02'
    $snapshot[1].CommandLine = 'cmd /c another-wrapper'
    if ((& $name 100 $snapshot $kind) -ne 100) { throw "$file nhận harness là app khi không có workspace marker." }
    $snapshot[0].CommandLine = 'node C:\unrelated\server.js'
    if ((& $name 100 $snapshot $kind) -ne 0) { throw "$file chấp nhận process không thuộc project." }
  }
}
Write-Host 'PASS: process app dừng ở npm workspace gần nhất; không chọn launcher/test harness hoặc process khác.'
