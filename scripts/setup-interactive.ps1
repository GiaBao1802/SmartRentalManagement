param([switch]$SkipCredential)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendEnv = Join-Path $root 'backend/.env'
function Fail([string]$m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }
function Ask([string]$m) { $v=Read-Host $m; if([string]::IsNullOrWhiteSpace($v)){Fail 'Input is required.'}; $v.Trim() }
function Yes([string]$m) { (Read-Host "$m [y/N]").Trim().ToLowerInvariant() -in @('y','yes') }
function Secret([string]$m) { $s=Read-Host $m -AsSecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)} }
function EnvValue([string]$n) { $l=Get-Content $backendEnv | Where-Object {$_ -match "^\s*$n\s*="} | Select-Object -First 1; if($l){(($l -split '=',2)[1]).Trim().Trim('"').Trim("'")}else{''} }
function SetEnv([string]$n,[string]$v) { $lines=@(Get-Content $backendEnv); $hit=$false; $lines=@($lines|%{if($_ -match "^\s*$n\s*="){$hit=$true;"$n=$v"}else{$_}}); if(-not $hit){$lines+="$n=$v"}; Set-Content $backendEnv $lines -Encoding utf8 }
function Enc([string]$v) {[Uri]::EscapeDataString($v)}
if(-not(Test-Path $backendEnv)){Fail 'backend/.env is missing. Run setup.bat again.'}
$testOverride = $env:GOCTRO_SETUP_TEST_DATABASE_URL
$dbUrl = if ($testOverride) { $testOverride } else { EnvValue 'DATABASE_URL' }
if(-not $dbUrl -or $dbUrl -match 'replace-with') {
  $h=Ask 'PostgreSQL host (local only)'; $p=Ask 'PostgreSQL port'; $d=Ask 'Database name'; $u=Ask 'PostgreSQL role/user'; $pw=Secret 'PostgreSQL password (hidden; not application login password)'
  if($h -notin @('localhost','127.0.0.1','::1') -or $d -in @('postgres','template0','template1')){Fail 'Only non-system local PostgreSQL targets are supported.'}
  $dbUrl="postgresql://$(Enc $u):$(Enc $pw)@$h`:$p/$(Enc $d)?schema=public"
  if(-not(Yes "Confirm writing target host=$h; port=$p; database=$d to backend/.env?")){Fail 'Database configuration was not confirmed.'}
  if(-not $testOverride){$bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes);SetEnv 'DATABASE_URL' $dbUrl; SetEnv 'NODE_ENV' 'development'; SetEnv 'SESSION_SECRET' ([Convert]::ToBase64String($bytes))}
}
try{$uri=[Uri]$dbUrl;$db=[Uri]::UnescapeDataString($uri.AbsolutePath.Trim('/'))}catch{Fail 'DATABASE_URL is invalid; its value is hidden.'}
if($uri.Host -notin @('localhost','127.0.0.1','::1')){Fail 'DATABASE_URL must target local PostgreSQL.'}
Write-Host "Database target: host=$($uri.Host); port=$($uri.Port); database=$db"; if(-not(Yes 'Confirm this database target before inspection/setup?')){Fail 'Database target was not confirmed.'}
$env:GOCTRO_SETUP_DATABASE_URL=$dbUrl
try { npm run db:inspect -- --database $db; if($LASTEXITCODE -ne 0){if(-not(Yes 'Inspect failed. Is this a new empty database that may be created and initialized?')){Fail 'Inspect failed; database was not changed.'}; $command=Get-Command createdb -ErrorAction SilentlyContinue; $createdb=if($command){$command.Definition}else{''}; if(-not $createdb){$candidate='C:\Program Files\PostgreSQL\18\bin\createdb.exe';if(Test-Path $candidate){$createdb=$candidate}}; if(-not $createdb){Fail 'createdb.exe was not found in PATH or PostgreSQL 18 default install path. Install PostgreSQL or create the database manually.'}; $userInfo=$uri.UserInfo; $colon=$userInfo.IndexOf(':'); if($colon -ge 0){$user=[Uri]::UnescapeDataString($userInfo.Substring(0,$colon));$pw=[Uri]::UnescapeDataString($userInfo.Substring($colon+1))}else{$user=[Uri]::UnescapeDataString($userInfo);$pw=''}; $old=$env:PGPASSWORD; $env:PGPASSWORD=$pw; & $createdb -h $uri.Host -p $uri.Port -U $user $db; $rc=$LASTEXITCODE; if($null -eq $old){Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue}else{$env:PGPASSWORD=$old}; if($rc -ne 0){Fail 'Database creation failed; bootstrap/seed were skipped.'}; npm run db:bootstrap -- --database $db;if($LASTEXITCODE -ne 0){Fail 'Bootstrap failed; dependent steps skipped.'};npm run db:seed -- --database $db;if($LASTEXITCODE -ne 0){Fail 'Seed failed; dependent steps skipped.'};npm run db:inspect -- --database $db;if($LASTEXITCODE -ne 0){Fail 'Post-seed inspect failed.'}}else{Write-Host 'Compatible V1.8 database detected; no bootstrap/seed was run.'}} finally {Remove-Item Env:GOCTRO_SETUP_DATABASE_URL -ErrorAction SilentlyContinue}
if($testOverride){$bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes);$env:SESSION_SECRET=[Convert]::ToBase64String($bytes)}
if($testOverride){$env:DATABASE_URL=$dbUrl;$env:NODE_ENV='development'}
if(-not $SkipCredential -and (Yes 'Provision or reset DEV email credentials now?')){$env:DATABASE_URL=$dbUrl;$env:NODE_ENV='development';npm run dev:provision-credentials --workspace=@goctro/backend;if($LASTEXITCODE -ne 0){Fail 'Credential provisioning failed; startup skipped.'};if(-not $testOverride){Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue}}else{Write-Host 'Credential provisioning skipped. Existing credentials were not verified.'}
npm run db:generate;if($LASTEXITCODE -ne 0){Fail 'Prisma generation failed; startup skipped.'};npm run dev:all;if($LASTEXITCODE -ne 0){Fail 'Application startup failed.'}
Write-Host 'Setup completed. Login: http://localhost:3000/login' -ForegroundColor Green;Write-Host 'DEV Admin email: admin.one@example.test';Write-Host 'DEV Resident email: resident.one@example.test'
