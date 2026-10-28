$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root

$orgId = 'org-cool-term-43890018'
$projectId = 'patient-scene-93926977'
$branch = 'production'
$envFile = Join-Path $root '.env.neon'

function Invoke-Neon([string[]] $Arguments) {
  if ($script:neonCommand -eq 'npx.cmd') {
    & npx.cmd --yes neon@latest @Arguments
  } else {
    & $script:neonCommand @Arguments
  }
  if ($LASTEXITCODE -ne 0) { throw "Neon CLI thất bại ở lệnh '$($Arguments[0])' (exit $LASTEXITCODE)." }
}

function Get-NeonProfiles {
  $output = if ($script:neonCommand -eq 'npx.cmd') {
    & npx.cmd --yes neon@latest profile list --output json 2>$null
  } else {
    & $script:neonCommand profile list --output json 2>$null
  }
  if ($LASTEXITCODE -ne 0) { return @() }
  try { return @($output -join "`n" | ConvertFrom-Json) } catch { return @() }
}

function EnvValue([string] $name) {
  $line = Get-Content -LiteralPath $envFile -Encoding UTF8 | Where-Object { $_ -match "^\s*$([regex]::Escape($name))\s*=" } | Select-Object -First 1
  if ($line) { return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'") }
  return ''
}

function Set-EnvDefault([string] $name, [string] $value) {
  if (EnvValue $name) { return }
  Add-Content -LiteralPath $envFile -Value "$name=$value" -Encoding UTF8
}

function Remove-LocalDatabaseLink {
  $backendEnv = Join-Path $root 'backend/.env'
  if (-not (Test-Path -LiteralPath $backendEnv)) { return }
  $content = [IO.File]::ReadAllText($backendEnv, [Text.Encoding]::UTF8)
  $updated = [regex]::Replace($content, '(?m)^\s*DATABASE_URL\s*=.*(?:\r?\n|$)', '')
  if ($updated -cne $content) {
    [IO.File]::WriteAllText($backendEnv, $updated, [Text.UTF8Encoding]::new($false))
    Write-Host 'Đã gỡ dòng DATABASE_URL local khỏi backend/.env; database local và dữ liệu của nó vẫn nguyên.'
  } else {
    Write-Host 'backend/.env không có liên kết DATABASE_URL local cần gỡ.'
  }
}

try {
  Write-Host 'Neon shared Postgres — project goctro-shared-dev / branch production'
  Write-Host 'Cảnh báo: đây là database cloud dùng chung. Mọi người trong nhóm có thể nhìn thấy thay đổi của nhau.' -ForegroundColor Yellow
  Write-Host 'Hiện database có schema V1.15 nhưng chưa có bộ dữ liệu thật; mục này không tự seed/import.'
  $confirm = (Read-Host 'Nhập DUNG để tiếp tục').Trim()
  if ($confirm -cne 'DUNG') { throw 'Đã hủy trước khi lấy cấu hình hoặc kết nối database.' }

  if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'Cần cài Node.js 24.11+ kèm npm 11.6+, rồi mở setup.bat lại.'
  }
  & node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a<24||(a===24&&b<11)?1:0)"
  if ($LASTEXITCODE -ne 0) { throw 'Cần Node.js 24.11 trở lên.' }

  $script:neonCommand = if (Get-Command neon.cmd -ErrorAction SilentlyContinue) { 'neon.cmd' } else { 'npx.cmd' }
  if ($script:neonCommand -eq 'npx.cmd') { Write-Host 'Neon CLI chưa cài toàn cục; sẽ dùng npx neon@latest.' }

  $versionOutput = if ($script:neonCommand -eq 'npx.cmd') { & npx.cmd --yes neon@latest --version 2>$null } else { & neon.cmd --version 2>$null }
  if ($LASTEXITCODE -ne 0) { throw 'Không chạy được Neon CLI. Kiểm tra mạng/npm rồi thử lại.' }

  $profiles = @(Get-NeonProfiles)
  $authenticated = @($profiles | Where-Object { $_.account -and $_.account -ne '-' -and $_.file -ne 'missing' }).Count -gt 0
  if (-not $authenticated) {
    Write-Host 'Neon chưa đăng nhập. Hoàn tất đăng nhập trong trình duyệt vừa mở; setup sẽ tiếp tục sau khi Neon CLI báo thành công.'
    Invoke-Neon @('login')
    $profiles = @(Get-NeonProfiles)
    $authenticated = @($profiles | Where-Object { $_.account -and $_.account -ne '-' -and $_.file -ne 'missing' }).Count -gt 0
    if (-not $authenticated) { throw 'Neon CLI chưa xác nhận được tài khoản. Đăng nhập bằng neon.cmd login rồi chạy lại mục này.' }
  }

  Write-Host 'Liên kết workspace với đúng project/branch; cấu hình local chỉ được gỡ sau khi Neon kết nối thành công.'
  Invoke-Neon @('link','--org-id',$orgId,'--project-id',$projectId,'--branch',$branch,'--no-env-pull','--no-config','-y')
  Invoke-Neon @('env','pull','--project-id',$projectId,'--branch',$branch,'--service','postgres','--file','.env.neon')
  if (-not (Test-Path -LiteralPath $envFile)) { throw 'Neon CLI không tạo được .env.neon.' }

  $databaseUrl = EnvValue 'DATABASE_URL'
  $branchValue = EnvValue 'NEON_BRANCH'
  try { $databaseUri = [Uri]::new($databaseUrl) } catch { throw 'DATABASE_URL Neon thiếu hoặc không hợp lệ; không hiển thị giá trị chứa secret.' }
  if ($databaseUri.Scheme -notin @('postgres','postgresql') -or $databaseUri.Host -notlike '*.neon.tech' -or $databaseUri.AbsolutePath.Trim('/') -ne 'neondb') {
    throw 'DATABASE_URL không trỏ tới đúng PostgreSQL Neon đã khai báo; giữ file env để kiểm tra, không khởi động app.'
  }
  if ($branchValue -cne $branch) { throw "Neon CLI trả branch '$branchValue', cần '$branch'. Không khởi động app." }

  # Keep Neon-managed values while filling only missing, local app-development settings.
  $random = [byte[]]::new(32)
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($random) } finally { $rng.Dispose() }
  Set-EnvDefault 'NODE_ENV' 'development'
  Set-EnvDefault 'FRONTEND_ORIGIN' 'http://localhost:3000'
  Set-EnvDefault 'SESSION_SECRET' ([Convert]::ToBase64String($random))
  Set-EnvDefault 'NEXT_PUBLIC_API_BASE_URL' 'http://localhost:4000/api/v1'
  Set-EnvDefault 'CONTRACT_IDEMPOTENCY_ACTIVE_KEY_VERSION' 'local-v1'
  $idempotencyKey = [byte[]]::new(32)
  $idempotencyRng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $idempotencyRng.GetBytes($idempotencyKey) } finally { $idempotencyRng.Dispose() }
  Set-EnvDefault 'CONTRACT_IDEMPOTENCY_KEYS_JSON' ('{"local-v1":"' + [Convert]::ToBase64String($idempotencyKey) + '"}')

  if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules/.bin/concurrently.cmd'))) {
    Write-Host 'Đang cài dependency theo package-lock.json...'
    & npm.cmd ci --include=dev
    if ($LASTEXITCODE -ne 0) { throw 'npm ci thất bại; kiểm tra mạng hoặc npm rồi chạy lại.' }
  }
  Write-Host 'Kiểm tra kết nối PostgreSQL Neon bằng câu SELECT chỉ đọc...'
  & node --env-file=.env.neon (Join-Path $PSScriptRoot 'verify-neon-connection.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Không kết nối hoặc schema cloud chưa sẵn sàng. Không chạy migration/seed/reset.' }
  Remove-LocalDatabaseLink

  Write-Host 'Nếu app đang chạy ở cổng 3000 hoặc 4000, hãy dừng phiên đó trước khi tiếp tục.' -ForegroundColor Yellow
  $start = (Read-Host 'Nhập CHAY để khởi động app bằng database chung').Trim()
  if ($start -cne 'CHAY') { Write-Host 'Đã kiểm tra Neon và gỡ liên kết DB local khỏi backend/.env. Khi sẵn sàng, chạy: npm run dev:neon'; exit 0 }
  Write-Host 'Đang khởi động frontend + backend trên Neon. Nhấn Ctrl+C để dừng.'
  & npm.cmd run dev:neon
  if ($LASTEXITCODE -ne 0) { throw 'Ứng dụng không khởi động thành công; kiểm tra lỗi cổng hoặc log phía trên.' }
  exit 0
} catch {
  Write-Host "NEON_SETUP_ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
