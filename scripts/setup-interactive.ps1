param([switch]$SkipCredential)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendEnv = Join-Path $root 'backend/.env'

function Fail([string]$message) { Write-Host "ERROR: $message" -ForegroundColor Red; exit 1 }
function Yes([string]$message) { (Read-Host "$message [y/N]").Trim().ToLowerInvariant() -in @('y', 'yes') }
function Secret([string]$message) { $secure = Read-Host $message -AsSecureString; $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) } }
function EnvValue([string]$name) { $line = Get-Content $backendEnv | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1; if ($line) { (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'") } else { '' } }
function SetEnv([string]$name, [string]$value) { $lines = @(Get-Content $backendEnv); $hit = $false; $lines = @($lines | ForEach-Object { if ($_ -match "^\s*$name\s*=") { $hit = $true; "$name=$value" } else { $_ } }); if (-not $hit) { $lines += "$name=$value" }; Set-Content $backendEnv $lines -Encoding utf8 }
function Enc([string]$value) { [Uri]::EscapeDataString($value) }
function Invoke-Db([string]$command, [string]$database) {
  $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', "npm run db:$command -- --database $database") -NoNewWindow -Wait -PassThru
  return [int]$process.ExitCode
}

if (-not (Test-Path $backendEnv)) { Fail 'backend/.env is missing. Run setup.bat again.' }
$testOverride = $env:GOCTRO_SETUP_TEST_DATABASE_URL
$dbUrl = if ($testOverride) { $testOverride } else { EnvValue 'DATABASE_URL' }
if (-not $dbUrl -or $dbUrl -match 'replace-with') {
  $hostName = Read-Host 'PostgreSQL host (local only)'; $port = Read-Host 'PostgreSQL port'; $databaseName = Read-Host 'Database name'; $userName = Read-Host 'PostgreSQL role/user'; $password = Secret 'PostgreSQL password (hidden; not application login password)'
  if ($hostName -notin @('localhost', '127.0.0.1', '::1') -or $databaseName -in @('postgres', 'template0', 'template1')) { Fail 'Only non-system local PostgreSQL targets are supported.' }
  $dbUrl = "postgresql://$(Enc $userName):$(Enc $password)@$hostName`:$port/$(Enc $databaseName)?schema=public"
  if (-not (Yes "Confirm writing target host=$hostName; port=$port; database=$databaseName to backend/.env?")) { Fail 'Database configuration was not confirmed.' }
  if (-not $testOverride) { $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); SetEnv 'DATABASE_URL' $dbUrl; SetEnv 'NODE_ENV' 'development'; SetEnv 'SESSION_SECRET' ([Convert]::ToBase64String($bytes)) }
}
try { $uri = [Uri]$dbUrl; $db = [Uri]::UnescapeDataString($uri.AbsolutePath.Trim('/')) } catch { Fail 'DATABASE_URL is invalid; its value is hidden.' }
if ($uri.Host -notin @('localhost', '127.0.0.1', '::1')) { Fail 'DATABASE_URL must target local PostgreSQL.' }
Write-Host "Database target: host=$($uri.Host); port=$($uri.Port); database=$db"
if (-not (Yes 'Confirm this database target before inspection/setup?')) { Fail 'Database target was not confirmed.' }
$env:GOCTRO_SETUP_DATABASE_URL = $dbUrl
$dataState = $null
try {
  $stateExit = Invoke-Db 'state' $db
  if ($stateExit -eq 2) {
    if (-not (Yes 'Database does not exist. Create it and initialize V1.8?')) { Fail 'Database was not created.' }
    $command = Get-Command createdb -ErrorAction SilentlyContinue; $createdb = if ($command) { $command.Definition } else { '' }
    if (-not $createdb) { $candidate = 'C:\Program Files\PostgreSQL\18\bin\createdb.exe'; if (Test-Path $candidate) { $createdb = $candidate } }
    if (-not $createdb) { Fail 'createdb.exe was not found in PATH or PostgreSQL 18 default install path. Install PostgreSQL or create the database manually.' }
    $userInfo = $uri.UserInfo; $colon = $userInfo.IndexOf(':'); if ($colon -ge 0) { $user = [Uri]::UnescapeDataString($userInfo.Substring(0, $colon)); $dbPassword = [Uri]::UnescapeDataString($userInfo.Substring($colon + 1)) } else { $user = [Uri]::UnescapeDataString($userInfo); $dbPassword = '' }
    $oldPassword = $env:PGPASSWORD; $env:PGPASSWORD = $dbPassword; & $createdb -h $uri.Host -p $uri.Port -U $user $db; $createExit = $LASTEXITCODE; if ($null -eq $oldPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $oldPassword }
    if ($createExit -ne 0) { Fail 'Database creation failed; bootstrap/seed were skipped.' }
    $dataState = 'empty_schema'
  } elseif ($stateExit -eq 3) { Fail 'Database authentication or permission was rejected; no write was attempted.'
  } elseif ($stateExit -eq 4) { Fail 'Database connection failed; no write was attempted.'
  } elseif ($stateExit -eq 5) { Fail 'Database schema is not compatible with reviewed V1.8; no bootstrap/seed was attempted.'
  } elseif ($stateExit -eq 6) { Fail 'Connected server identity does not match the confirmed local target; no write was attempted.'
  } elseif ($stateExit -ne 0) { Fail 'Database state inspection failed; no write was attempted.'
  } else {
    $stateText = & npm run db:state -- --database $db 2>&1 | Out-String
    $stateMatch = [regex]::Match($stateText, 'Database state:\s*([a-z0-9_]+);')
    $dataState = if ($stateMatch.Success) { $stateMatch.Groups[1].Value } else { $null }
  }
  if ($dataState -eq 'empty_schema') {
    Write-Host 'Existing database has an empty public schema; database creation will be skipped.'
    if (-not (Yes 'Bootstrap the existing empty schema with V1.8?')) { Fail 'Bootstrap was not confirmed.' }
    $bootstrapExit = Invoke-Db 'bootstrap' $db
    if ($bootstrapExit -ne 0) { Fail 'Bootstrap failed; seed and all dependent steps were skipped.' }
    $dataState = 'v18_empty'
  }
  if ($dataState -eq 'v18_empty') {
    if (Yes 'Seed the empty V1.8 schema with sample data?') { $seedExit = Invoke-Db 'seed' $db; if ($seedExit -ne 0) { Fail 'Bootstrap is complete but seed failed; no dependent steps ran. Rerun after fixing the seed cause; the safe state is V1.8 schema with empty tables.' }; $dataState = 'v18_populated' } else { Write-Host 'Seed skipped; no application data was written.' }
  }
  if ($dataState -eq 'v18_populated') { Write-Host 'Compatible populated V1.8 database detected; bootstrap and seed were skipped. Existing credentials were preserved.' }
  if ($dataState -notin @('v18_empty', 'v18_populated')) { Fail "Unexpected database state '$dataState'; no dependent steps ran." }
} finally { Remove-Item Env:GOCTRO_SETUP_DATABASE_URL -ErrorAction SilentlyContinue }
if ($testOverride) { $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); $env:SESSION_SECRET = [Convert]::ToBase64String($bytes); $env:DATABASE_URL = $dbUrl; $env:NODE_ENV = 'development' }
if (-not $SkipCredential -and (Yes 'Provision or reset DEV email credentials now?')) { $env:DATABASE_URL = $dbUrl; $env:NODE_ENV = 'development'; npm run dev:provision-credentials --workspace=@goctro/backend; if ($LASTEXITCODE -ne 0) { Fail 'Credential provisioning failed; startup skipped.' }; if (-not $testOverride) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } } else { Write-Host 'Credential provisioning skipped. Existing credentials were not changed.' }
npm run db:generate; if ($LASTEXITCODE -ne 0) { Fail 'Prisma generation failed; startup skipped.' }
npm run dev:all; if ($LASTEXITCODE -ne 0) { Fail 'Application startup failed.' }
Write-Host 'Setup completed. Login: http://localhost:3000/login' -ForegroundColor Green
Write-Host 'DEV Admin email: admin.one@example.test'
Write-Host 'DEV Resident email: resident.one@example.test'
