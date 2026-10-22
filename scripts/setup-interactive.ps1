param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root
$completed = [Collections.Generic.List[string]]::new()
$step = 'Chọn chế độ'
$demoSet = $false
function Yes([string]$message) { (Read-Host "$message [y/N]").Trim().ToLowerInvariant() -in @('y','yes','c','co','có') }
function Secret([string]$message) {
  $secure = Read-Host $message -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function EnvValue([string]$file, [string]$name) {
  $line = Get-Content -LiteralPath $file -Encoding UTF8 | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if ($line) { return (($line -split '=',2)[1]).Trim().Trim('"').Trim("'") }
  return ''
}
function RandomSecret { $bytes = New-Object byte[] 32; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }; [Convert]::ToBase64String($bytes) }
function Cache([string]$action,[string]$kind) {
  $value = & node scripts/setup-cache.mjs $action $kind
  if ($LASTEXITCODE -ne 0) { throw 'Không cập nhật được dấu vết setup; dừng để tránh bỏ qua bước cần chạy.' }
  return $value
}
function DatabaseCommand([string]$command) {
  $lines = & node scripts/database-v18.mjs $command --database $script:db
  $script:dbExit = $LASTEXITCODE
  $script:dbText = $lines -join "`n"
  $lines | ForEach-Object { Write-Host $_ }
}
function Find-Createdb {
  $found = Get-Command createdb.exe -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  $candidates = [Collections.Generic.List[string]]::new()
  foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if ($base) { $candidates.Add((Join-Path $base 'PostgreSQL/18/bin/createdb.exe')) }
  }
  try {
    foreach ($service in (Get-CimInstance Win32_Service | Where-Object { $_.PathName -match '(?i)postgres|pg_ctl' })) {
      if ($service.PathName -match '^"([^"]+\.exe)"|^([^ ]+\.exe)') {
        $executable = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
        $candidates.Add((Join-Path (Split-Path $executable) 'createdb.exe'))
      }
    }
  } catch { }
  foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
  return $null
}
try {
  Write-Host '=============================================='
  Write-Host 'Góc Trọ - Cài đặt và khởi động trên Windows'
  Write-Host '1. Cài đặt lần đầu'
  Write-Host '2. Cập nhật và khởi động (hãy tự git pull trước)'
  Write-Host '3. Thoát'
  $mode = (Read-Host 'Chọn 1, 2 hoặc 3').Trim()
  if ($mode -eq '3') { exit 0 }
  if ($mode -notin @('1','2')) { throw 'Lựa chọn không hợp lệ.' }
  $step = 'Kiểm tra Node/npm'
  if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Cần cài Node.js 24.11+ kèm npm 11.6+, rồi mở lại setup.bat. Công cụ không tự cài phần mềm hệ thống.' }
  & node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a<24||(a===24&&b<11)?1:0)"
  if ($LASTEXITCODE -ne 0) { throw 'Cần Node.js 24.11 trở lên.' }
  $env:GOCTRO_SETUP_NPM_VERSION = (& npm.cmd --version | Out-String).Trim()
  & node -e "const [a,b]=process.argv[1].split('.').map(Number);process.exit(a<11||(a===11&&b<6)?1:0)" $env:GOCTRO_SETUP_NPM_VERSION
  if ($LASTEXITCODE -ne 0) { throw 'Cần npm 11.6 trở lên.' }
  if ($env:NODE_ENV -and $env:NODE_ENV -ne 'development') { throw 'Chỉ cho phép môi trường development; hãy kiểm tra NODE_ENV.' }
  if ($env:npm_config_ignore_scripts -eq 'true') { throw 'npm đang tắt install scripts; bật lại để cài đúng dependency theo lockfile.' }
  $step = 'Đọc cấu hình local'
  $defaultHost = 'localhost'; $defaultPort = 5432; $defaultUser = 'postgres'; $defaultDatabase = 'Goctro_dev_v18'
  $configDirectory = $env:GOCTRO_SETUP_CONFIG_DIR
  if ($env:GOCTRO_SETUP_REHEARSAL_DEFAULT -and (-not $configDirectory -or $env:GOCTRO_SETUP_REHEARSAL_DEFAULT -ne '1')) { throw 'Ánh xạ mặc định kiểm thử chỉ được dùng với cấu hình disposable riêng.' }
  if ($configDirectory) {
    $configDirectory = (Resolve-Path -LiteralPath $configDirectory).Path
    $backendEnv = Join-Path $configDirectory 'backend.env'
    $frontendEnv = Join-Path $configDirectory 'frontend.env'
    $env:GOCTRO_SETUP_RUNTIME_DIR = Join-Path $configDirectory 'runtime'
    if (-not (Test-Path -LiteralPath $backendEnv)) { throw 'Cấu hình kiểm thử riêng phải có backend.env; không dùng env thật thay thế.' }
  } else {
    $backendEnv = Join-Path $root 'backend/.env'
    $frontendEnv = Join-Path $root 'frontend/.env.local'
    if ($mode -eq '1') {
      Write-Host 'Cài đặt lần đầu dùng PostgreSQL: host=localhost; cổng=5432; user=postgres; database=Goctro_dev_v18.'
      if (-not (Test-Path -LiteralPath $backendEnv)) {
        $dbPassword = Secret 'Mật khẩu PostgreSQL (nhập ẩn, KHÔNG phải mật khẩu đăng nhập web)'
        if (-not $dbPassword) { throw 'Mật khẩu PostgreSQL không được để trống.' }
        $url = "postgresql://postgres:$([Uri]::EscapeDataString($dbPassword))@localhost:5432/Goctro_dev_v18?schema=public"
        $template = [IO.File]::ReadAllText((Join-Path $root 'backend/.env.example'))
        $template = $template -replace '(?m)^DATABASE_URL=.*', "DATABASE_URL=$url"
        $template = $template -replace '(?m)^SESSION_SECRET=.*', "SESSION_SECRET=$(RandomSecret)"
        $template = $template -replace '(?m)^CONTRACT_IDEMPOTENCY_ACTIVE_KEY_VERSION=.*','CONTRACT_IDEMPOTENCY_ACTIVE_KEY_VERSION=local-v1'
        $keyJson = '{"local-v1":"' + (RandomSecret) + '"}'
        $template = $template -replace '(?m)^CONTRACT_IDEMPOTENCY_KEYS_JSON=.*', "CONTRACT_IDEMPOTENCY_KEYS_JSON=$keyJson"
        [IO.File]::WriteAllText($backendEnv,$template,[Text.UTF8Encoding]::new($false))
        $completed.Add('Tạo cấu hình backend và secret local ngẫu nhiên')
      }
    }
  }
  if (-not (Test-Path -LiteralPath $backendEnv)) { throw 'Chưa hoàn tất cài đặt, hãy chọn Cài đặt lần đầu.' }
  if ((EnvValue $backendEnv 'NODE_ENV') -ne 'development') { throw 'Cấu hình phải ghi rõ NODE_ENV=development. Không tự sửa env hiện có.' }
  $dbUrl = EnvValue $backendEnv 'DATABASE_URL'
  try { $uri = [Uri]::new($dbUrl); $db = [Uri]::UnescapeDataString($uri.AbsolutePath.Trim('/')) } catch { throw 'DATABASE_URL không hợp lệ (giá trị được ẩn).' }
  if ($mode -eq '1' -and -not $configDirectory -and ($uri.Host -cne 'localhost' -or $uri.Port -notin @(-1,5432) -or [Uri]::UnescapeDataString(($uri.UserInfo -split ':',2)[0]) -cne 'postgres' -or $db -cne 'Goctro_dev_v18')) { throw 'Đã có cấu hình khác. Cài đặt lần đầu sẽ không ghi đè. Hãy chọn Cập nhật và khởi động để dùng cấu hình hiện tại.' }
  if ($uri.Scheme -notin @('postgresql','postgres') -or $uri.Host -notin @('localhost','127.0.0.1','::1') -or $db -notmatch '^[A-Za-z][A-Za-z0-9_]{0,62}$' -or $db -in @('postgres','template0','template1')) { throw 'Chỉ hỗ trợ target PostgreSQL local/dev rõ ràng; kiểm tra backend/.env.' }
  $dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
  $userInfo = $uri.UserInfo -split ':',2
  $databaseUser = [Uri]::UnescapeDataString($userInfo[0])
  if ($configDirectory -and ($dbPort -eq 5432 -or $db -notlike 'goctro_setup_test_*' -or $databaseUser -ne 'v18_smoke')) { throw 'Cấu hình kiểm thử phải dùng role v18_smoke, cổng khác 5432 và database goctro_setup_test_*.' }
  if ($env:GOCTRO_SETUP_REHEARSAL_DEFAULT -eq '1') {
    # Transport mapping ONLY after all disposable-target guards above; no schema/identity guard is skipped.
    $defaultHost = $uri.Host; $defaultPort = $dbPort; $defaultUser = $databaseUser; $defaultDatabase = $db
    Write-Host 'KIỂM THỬ DISPOSABLE: ánh xạ bộ mặc định sang target cô lập; không kiểm chứng runtime cổng 5432.'
  }
  $matchesDefault = $uri.Host -ceq $defaultHost -and $dbPort -eq $defaultPort -and $databaseUser -ceq $defaultUser -and $db -ceq $defaultDatabase
  if ($mode -eq '1' -and -not $matchesDefault) { throw 'Đã có cấu hình khác. Cài đặt lần đầu sẽ không ghi đè. Hãy chọn Cập nhật và khởi động để dùng cấu hình hiện tại.' }
  $passwordMissing = $userInfo.Count -lt 2 -or -not $userInfo[1] -or [Uri]::UnescapeDataString($userInfo[1]) -match '^replace-with'
  if ($passwordMissing) {
    if ($mode -eq '2') { throw 'Cấu hình hiện tại thiếu mật khẩu PostgreSQL. Chưa hoàn tất cài đặt, hãy chọn Cài đặt lần đầu nếu đúng bộ mặc định; target khác cần xử lý cấu hình hiện tại, không tự chuyển target.' }
    $dbPassword = Secret 'Mật khẩu PostgreSQL còn thiếu (nhập ẩn, KHÔNG phải mật khẩu web)'
    if (-not $dbPassword) { throw 'Mật khẩu PostgreSQL không được để trống.' }
    $builder = [UriBuilder]::new($uri); $builder.Password = [Uri]::EscapeDataString($dbPassword)
    $dbUrl = $builder.Uri.AbsoluteUri; $uri = [Uri]::new($dbUrl)
    $content = [IO.File]::ReadAllText($backendEnv)
    $replacement = 'DATABASE_URL=' + $dbUrl
    $content = [regex]::Replace($content,'(?m)^\s*DATABASE_URL=.*$', [Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement })
    [IO.File]::WriteAllText($backendEnv,$content,[Text.UTF8Encoding]::new($false))
    $completed.Add('Bổ sung mật khẩu PostgreSQL còn thiếu cho đúng target đã lưu')
  }
  if ($mode -eq '1' -and -not $configDirectory) {
    foreach ($pair in @(@('.env.example','.env'),@('frontend/.env.example','frontend/.env.local'))) {
      if (-not (Test-Path -LiteralPath $pair[1])) { Copy-Item -LiteralPath $pair[0] -Destination $pair[1]; $completed.Add("Tạo cấu hình $($pair[1])") }
    }
  }
  $target = "$($uri.Host):$dbPort/$db"
  Write-Host "Database: host=$($uri.Host); port=$dbPort; database=$db"
  if (-not (Yes 'Xác nhận target này trước khi kiểm tra/cài đặt')) { throw 'Chưa xác nhận database.' }
  foreach ($name in @('DATABASE_URL','SESSION_SECRET','FRONTEND_ORIGIN','PORT','CONTRACT_IDEMPOTENCY_ACTIVE_KEY_VERSION','CONTRACT_IDEMPOTENCY_KEYS_JSON')) {
    $value = EnvValue $backendEnv $name
    if ($value) { [Environment]::SetEnvironmentVariable($name,$value,'Process') }
  }
  if (-not $env:SESSION_SECRET -or $env:SESSION_SECRET -match 'replace-with') { throw 'SESSION_SECRET còn thiếu/placeholder. Giữ env hiện có; hãy đặt secret local ngẫu nhiên theo template rồi chạy lại.' }
  if (Test-Path -LiteralPath $frontendEnv) { $env:NEXT_PUBLIC_API_BASE_URL = EnvValue $frontendEnv 'NEXT_PUBLIC_API_BASE_URL' }
  if ($env:PORT -and $env:PORT -ne '4000') { throw 'Menu hiện dùng API cổng 4000; kiểm tra PORT trong cấu hình backend. Không tự ghi đè env.' }
  if ($env:FRONTEND_ORIGIN -and $env:FRONTEND_ORIGIN -ne 'http://localhost:3000') { throw 'FRONTEND_ORIGIN phải là http://localhost:3000 để khớp CSRF.' }
  if ($env:NEXT_PUBLIC_API_BASE_URL -and $env:NEXT_PUBLIC_API_BASE_URL -ne 'http://localhost:4000/api/v1') { throw 'NEXT_PUBLIC_API_BASE_URL phải trỏ http://localhost:4000/api/v1 cho stack local này.' }
  $env:NODE_ENV = 'development'
  $env:GOCTRO_SETUP_DATABASE_URL = $dbUrl
  $step = 'Cài dependency theo lockfile'
  $dependenciesChanged = (Cache 'check' 'dependencies') -ne 'CURRENT'
  $installed = & node scripts/setup-cache.mjs installed
  if ($LASTEXITCODE -ne 0 -or $installed -ne 'READY') { $dependenciesChanged = $true }
  if ($dependenciesChanged) {
    Write-Host 'Dependency thay đổi/thiếu hoặc chưa có dấu vết cài; chạy npm ci. Dừng process đã xác minh của project để tránh DLL bị khóa.'
    & "$PSScriptRoot/dev-stop.ps1"
    foreach ($kind in @('dependencies','prisma','runtime')) { Cache 'invalidate' $kind | Out-Null }
    & npm.cmd ci --include=dev
    $installExit = $LASTEXITCODE
    if ($installExit -ne 0) { throw 'npm ci thất bại. Kiểm tra file Next/Prisma bị khóa, quyền ghi hoặc mạng. Chưa ghi nhận cài thành công.' }
    $installed = & node scripts/setup-cache.mjs installed
    if ($LASTEXITCODE -ne 0 -or $installed -ne 'READY') { throw 'Dependency không đủ/không khớp lockfile sau cài; chưa ghi nhận thành công.' }
    Cache 'record' 'dependencies' | Out-Null
    $completed.Add('Cài dependency')
  } else { Write-Host 'Dependency không đổi và đã kiểm tra đủ; bỏ qua npm ci.' }
  $step = 'Kiểm tra baseline và database'
  $artifactResult = & node scripts/verify-baseline-integrity.mjs
  if ($LASTEXITCODE -ne 0) { $artifactResult | ForEach-Object { Write-Host $_ }; throw 'Artifact V1.8 không khớp; khôi phục bytes từ commit chuẩn. Không sửa hash provenance.' }
  Write-Host 'Toàn bộ 9 artifact V1.8 khớp working tree, Git HEAD và provenance.'
  DatabaseCommand 'state'
  if ($dbExit -eq 2 -and $mode -eq '1') {
    if (-not (Yes 'Database chưa tồn tại. Tạo database mới')) { throw 'Chưa xác nhận tạo database.' }
    $createdb = Find-Createdb
    if (-not $createdb) { throw 'Không tìm thấy createdb trong PATH, thư mục cài PostgreSQL 18 hoặc executable của Windows service. Cài PostgreSQL 18.6+ / chỉ rõ tooling; công cụ không tự cài.' }
    $userInfo = $uri.UserInfo -split ':',2
    $previousPassword = $env:PGPASSWORD
    try { $env:PGPASSWORD = if ($userInfo.Count -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { '' }; & $createdb -w -h $uri.Host -p $dbPort -U ([Uri]::UnescapeDataString($userInfo[0])) -- $db; $createExit = $LASTEXITCODE } finally { $env:PGPASSWORD = $previousPassword }
    if ($createExit -ne 0) { throw 'Không tạo được database; các bước sau bị chặn.' }
    $completed.Add('Tạo database')
    $dataState = 'empty_schema'
  } elseif ($dbExit -ne 0) {
    switch ($dbExit) {
      2 { if (-not $matchesDefault) { throw 'Database của cấu hình hiện tại chưa tồn tại. Cần xử lý cấu hình hiện tại; không tự chuyển sang bộ mặc định hoặc tạo database trong chế độ cập nhật.' }; throw 'Chưa hoàn tất cài đặt, hãy chọn Cài đặt lần đầu. Chế độ cập nhật không tạo database.' }
      3 { throw 'PostgreSQL từ chối xác thực/quyền; kiểm tra role và mật khẩu PostgreSQL. Không tạo/seed thay thế.' }
      4 { throw 'Không kết nối được PostgreSQL; kiểm tra host/cổng và dịch vụ hiện có. Công cụ không tự bật/tắt PostgreSQL.' }
      5 { throw 'Schema không tương thích V1.8. Xem khác biệt phía trên; review/backup và dùng quy trình migration được hỗ trợ. Bootstrap không phải upgrade.' }
      6 { throw 'Instance hoặc phiên bản PostgreSQL không khớp target local PostgreSQL 18.6+.' }
      default { throw 'Không kiểm tra được database; dừng các bước phụ thuộc.' }
    }
  } else {
    $match = [regex]::Match($dbText,'Database state:\s*([a-z0-9_]+);')
    if (-not $match.Success) { throw 'Không đọc được trạng thái database.' }
    $dataState = $match.Groups[1].Value
  }
  if ($mode -eq '2' -and $dataState -ne 'v18_populated' -and $dataState -ne 'v18_empty') { throw 'Chế độ cập nhật cần schema V1.8 tương thích; không bootstrap hoặc migration tự động.' }
  $seededNow = $false
  if ($mode -eq '1') {
    if ($dataState -eq 'empty_schema') {
      if (-not (Yes 'Schema đang trống. Bootstrap V1.8')) { throw 'Chưa xác nhận bootstrap.' }
      $step = 'Bootstrap V1.8'; DatabaseCommand 'bootstrap'
      if ($dbExit -ne 0) { throw 'Bootstrap thất bại; chưa chạy seed/provision/startup.' }
      $completed.Add('Bootstrap V1.8'); $dataState = 'v18_empty'
    }
    if ($dataState -eq 'v18_empty' -and (Yes 'Seed dữ liệu mẫu vào schema V1.8 đang trống')) {
      $step = 'Seed mẫu'; DatabaseCommand 'seed'
      if ($dbExit -ne 0) { throw 'Seed thất bại. Bootstrap có thể đã hoàn thành; kiểm tra nguyên nhân rồi chạy lại Cài đặt lần đầu. Guard sẽ kiểm tra lại schema/bảng trống, không bootstrap lại.' }
      $completed.Add('Seed mẫu'); $seededNow = $true; $dataState = 'v18_populated'
    } elseif ($dataState -eq 'v18_populated') { Write-Host 'Database đã có dữ liệu; bỏ qua bootstrap và seed.' }
    if ($seededNow) {
      $step = 'Thiết lập credential demo'
      & npm.cmd run dev:provision-credentials --workspace=@goctro/backend -- --mode INITIAL --database $db --confirm-target $target
      if ($LASTEXITCODE -ne 0) { throw 'Seed đã thành công nhưng mật khẩu web chưa thiết lập. Giữ dữ liệu; dùng công cụ provision riêng theo hướng dẫn, RESET cần xác nhận rõ; không seed lại.' }
      $demoSet = $true; $completed.Add('Thiết lập hai credential demo'); Cache 'invalidate' 'runtime' | Out-Null
    } elseif ($dataState -eq 'v18_populated') {
      Write-Host 'Sử dụng mật khẩu hiện có. Không provision hoặc RESET khi chạy lại setup.'
    }
  }
  $step = 'Generate Prisma'
  if ($dependenciesChanged -or (Cache 'check' 'prisma') -ne 'CURRENT') {
    & "$PSScriptRoot/dev-stop.ps1"
    Cache 'invalidate' 'prisma' | Out-Null
    & npm.cmd run db:generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma generate thất bại. Nếu DLL bị khóa, đóng process project liên quan rồi thử lại; giữ nguyên database và credential.' }
    Cache 'record' 'prisma' | Out-Null; $completed.Add('Generate Prisma')
  } else { Write-Host 'Mapping/tooling Prisma không đổi và client có sẵn; bỏ qua generate.' }
  $step = 'Khởi động ứng dụng'
  $restart = (Cache 'check' 'runtime') -ne 'CURRENT'
  if ($restart) { Write-Host 'Code/env hoặc dấu vết runtime thay đổi: cần khởi động lại process đã xác minh của project; health process cũ không chứng minh bản mới đã chạy.' }
  & "$PSScriptRoot/dev-all.ps1" -ConfirmedDatabase $db -RestartVerified:$restart
  if ($LASTEXITCODE -ne 0) { throw 'Khởi động/health check thất bại. Dữ liệu và credential ở bước thành công vẫn được giữ; sửa nguyên nhân rồi chọn Cập nhật và khởi động.' }
  Cache 'record' 'runtime' | Out-Null; $completed.Add('API health, DB health và frontend sẵn sàng')
  Write-Host 'Hoàn tất setup.' -ForegroundColor Green
  if ($demoSet) { Write-Host 'Mật khẩu demo local/dev vừa được thiết lập: Goctro123456789' }
  elseif ($dataState -eq 'v18_empty') { Write-Host 'Chưa seed mẫu; chưa thiết lập tài khoản/credential demo.' }
  else { Write-Host 'Sử dụng mật khẩu hiện có; setup không đổi credential.' }
  Write-Host 'Đăng nhập: http://localhost:3000/login'
  Write-Host 'Admin: admin.one@example.test | Resident: resident.one@example.test'
  Write-Host 'Resident demo dùng email; số điện thoại fixture chưa hợp lệ với Auth V1.'
  Write-Host 'Provider gửi invitation/reset/Zalo và storage ngoài database cần cấu hình riêng; setup không xác minh các dịch vụ này.'
  exit 0
} catch {
  Write-Host "LỖI tại bước '$step': $($_.Exception.Message)" -ForegroundColor Red
  if ($completed.Count) { Write-Host "Đã hoàn thành: $($completed -join '; ')." } else { Write-Host 'Chưa hoàn thành thao tác cài đặt/ghi database nào trong lượt này.' }
  Write-Host 'Không chạy các bước phụ thuộc sau lỗi. Giữ log này để kiểm tra; không seed/reset lại chỉ để thử.'
  exit 1
} finally {
  Remove-Item Env:GOCTRO_SETUP_DATABASE_URL -ErrorAction SilentlyContinue
  Write-Host 'Nhấn phím bất kỳ để đóng cửa sổ.'
}
