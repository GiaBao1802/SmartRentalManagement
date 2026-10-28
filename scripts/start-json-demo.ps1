$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$entry = Join-Path $root 'scripts/owner-advisor-demo/server.mjs'
$port = 4332
$url = "http://localhost:$port"
function Probe {
  try {
    $result = Invoke-RestMethod -Uri "$url/health" -TimeoutSec 2
    return $result.mode -eq 'owner-advisor-demo' -and $result.authRequired -eq $true
  } catch { return $false }
}
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) { Write-Host 'Thiếu backend trợ lý chủ trọ.' -ForegroundColor Red; exit 1 }
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { Write-Host 'Cần cài Node.js để chạy demo JSON.' -ForegroundColor Red; exit 1 }
& $node.Source -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a<24||(a===24&&b<11)?1:0)"
if ($LASTEXITCODE -ne 0) { Write-Host 'Cần Node.js 24.11 trở lên.' -ForegroundColor Red; exit 1 }
if (Probe) {
  Write-Host "Demo JSON đã chạy: $url"
  Start-Process $url | Out-Null
  exit 0
}
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener) { Write-Host "Cổng $port đã được chương trình khác sử dụng; không dừng chương trình đó." -ForegroundColor Red; exit 1 }
$runtime = Join-Path $root '.local/owner-advisor'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$env:OWNER_ADVISOR_PORT = [string]$port
$process = Start-Process -FilePath $node.Source -ArgumentList @(('"' + $entry + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'server.log') -RedirectStandardError (Join-Path $runtime 'server.err.log') -PassThru
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if (Probe) { $ready = $true; break }
  if ($process.HasExited) { break }
  Start-Sleep -Milliseconds 500
}
if (-not $ready) { Write-Host "Demo JSON chưa sẵn sàng. Xem log tại $runtime" -ForegroundColor Red; exit 1 }
Write-Host "Trợ lý chủ trọ — hóa đơn giả lập: $url"
Write-Host 'Cần backend quản lý và đăng nhập chủ trọ tại localhost:3000. Hóa đơn, công nợ và đơn giá vẫn giả lập.'
Start-Process $url | Out-Null
exit 0
