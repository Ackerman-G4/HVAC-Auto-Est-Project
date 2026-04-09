param(
  [int]$AppPort = 3000,
  [int]$FirestorePort = 9080,
  [string]$ProjectId = 'demo-hvac-auto',
  [int]$StartupTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'

function Test-NonEmpty {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Assert-Command {
  param([string]$Name)
  if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not available in PATH"
  }
}

function Assert-EnvAny {
  param([string[]]$Names)

  foreach ($name in $Names) {
    if (Test-NonEmpty ([Environment]::GetEnvironmentVariable($name, 'Process'))) {
      return
    }
  }

  throw "Missing required environment variable. Provide one of: $($Names -join ', ')"
}

function Assert-Env {
  param([string]$Name)

  if (-not (Test-NonEmpty ([Environment]::GetEnvironmentVariable($Name, 'Process')))) {
    throw "Missing required environment variable: $Name"
  }
}

function Assert-StrictCredentialStrategy {
  $hasServiceAccount = Test-NonEmpty ([Environment]::GetEnvironmentVariable('FIREBASE_SERVICE_ACCOUNT_JSON', 'Process'))
  $hasAdminCredentials =
    (Test-NonEmpty ([Environment]::GetEnvironmentVariable('RBAC_ADMIN_EMAIL', 'Process'))) -and
    (Test-NonEmpty ([Environment]::GetEnvironmentVariable('RBAC_ADMIN_PASSWORD', 'Process')))

  if ($hasServiceAccount -or $hasAdminCredentials) {
    if ($hasServiceAccount) {
      Write-Host 'Using strict credential strategy: FIREBASE_SERVICE_ACCOUNT_JSON present.'
    }
    else {
      Write-Host 'Using strict credential strategy: pre-provisioned RBAC admin credentials.'
    }
    return
  }

  throw 'Missing strict credential strategy. Provide FIREBASE_SERVICE_ACCOUNT_JSON, or provide both RBAC_ADMIN_EMAIL and RBAC_ADMIN_PASSWORD.'
}

function Import-DotEnvFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return 0
  }

  $loadedCount = 0
  foreach ($rawLine in (Get-Content -Path $Path)) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
      continue
    }

    $eq = $line.IndexOf('=')
    if ($eq -le 0) {
      continue
    }

    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()

    if (
      (($value.StartsWith('"')) -and ($value.EndsWith('"'))) -or
      (($value.StartsWith("'")) -and ($value.EndsWith("'")))
    ) {
      if ($value.Length -ge 2) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    if (-not (Test-NonEmpty ([Environment]::GetEnvironmentVariable($key, 'Process')))) {
      [Environment]::SetEnvironmentVariable($key, $value, 'Process')
      $loadedCount++
    }
  }

  return $loadedCount
}

function Wait-PortListening {
  param(
    [int]$Port,
    [int]$TimeoutSeconds
  )

  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    try {
      $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1
      if ($null -ne $listener) {
        return $true
      }
    }
    catch {
      # Keep waiting.
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [int]$TimeoutSeconds
  )

  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method Get -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        return $true
      }
    }
    catch {
      # Keep waiting.
    }

    Start-Sleep -Milliseconds 750
  }

  return $false
}

function Stop-BackgroundProcess {
  param(
    [System.Diagnostics.Process]$Process,
    [string]$Name
  )

  if ($null -eq $Process) {
    return
  }

  if (-not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped $Name process (PID $($Process.Id))"
  }
}

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logDir = Join-Path $workspaceRoot '.logs'
if (-not (Test-Path $logDir)) {
  New-Item -Path $logDir -ItemType Directory | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$emulatorOutLog = Join-Path $logDir "ci-firestore-$timestamp.out.log"
$emulatorErrLog = Join-Path $logDir "ci-firestore-$timestamp.err.log"
$appOutLog = Join-Path $logDir "ci-app-$timestamp.out.log"
$appErrLog = Join-Path $logDir "ci-app-$timestamp.err.log"

$emulatorProcess = $null
$appProcess = $null
$validationSucceeded = $false

try {
  Set-Location $workspaceRoot

  $envLocalCount = Import-DotEnvFile -Path (Join-Path $workspaceRoot '.env.local')
  if ($envLocalCount -gt 0) {
    Write-Host "Loaded $envLocalCount variables from .env.local"
  }

  $envCount = Import-DotEnvFile -Path (Join-Path $workspaceRoot '.env')
  if ($envCount -gt 0) {
    Write-Host "Loaded $envCount variables from .env"
  }

  Assert-Command -Name 'node'
  Assert-Command -Name 'npm'
  Assert-Command -Name 'npx'
  Assert-Command -Name 'firebase'
  Assert-Command -Name 'java'

  Assert-EnvAny -Names @('FIREBASE_WEB_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY')
  Assert-StrictCredentialStrategy

  if (-not (Test-NonEmpty $env:NEXT_PUBLIC_FIREBASE_API_KEY) -and (Test-NonEmpty $env:FIREBASE_WEB_API_KEY)) {
    $env:NEXT_PUBLIC_FIREBASE_API_KEY = $env:FIREBASE_WEB_API_KEY
  }

  $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:$FirestorePort"
  $env:FIREBASE_PROJECT_ID = $ProjectId
  $env:GCLOUD_PROJECT = $ProjectId
  $env:CI = 'true'

  Write-Host "Using FIRESTORE_EMULATOR_HOST=$($env:FIRESTORE_EMULATOR_HOST)"
  Write-Host "Using FIREBASE_PROJECT_ID=$($env:FIREBASE_PROJECT_ID)"
  Write-Host "Using GCLOUD_PROJECT=$($env:GCLOUD_PROJECT)"

  $emulatorCommand = "Set-Location '$workspaceRoot'; npm run emulator:firestore"
  $emulatorProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $emulatorCommand -PassThru -RedirectStandardOutput $emulatorOutLog -RedirectStandardError $emulatorErrLog

  Write-Host "Started Firestore emulator (PID $($emulatorProcess.Id)); waiting for port $FirestorePort..."
  if (-not (Wait-PortListening -Port $FirestorePort -TimeoutSeconds $StartupTimeoutSeconds)) {
    throw "Firestore emulator did not become ready on port $FirestorePort within $StartupTimeoutSeconds seconds."
  }

  $appCommand = "Set-Location '$workspaceRoot'; npm run dev:raw:no-turbo -- --port $AppPort"
  $appProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $appCommand -PassThru -RedirectStandardOutput $appOutLog -RedirectStandardError $appErrLog

  Write-Host "Started Next.js app (PID $($appProcess.Id)); waiting for http://127.0.0.1:$AppPort/auth/login ..."
  if (-not (Wait-HttpReady -Url "http://127.0.0.1:$AppPort/auth/login" -TimeoutSeconds $StartupTimeoutSeconds)) {
    throw "Next.js app did not become ready on port $AppPort within $StartupTimeoutSeconds seconds."
  }

  Write-Host 'Running strict system validation...'
  & npm run validate:system:strict

  if ($LASTEXITCODE -ne 0) {
    throw "validate:system:strict failed with exit code $LASTEXITCODE"
  }

  $validationSucceeded = $true
  Write-Host 'Strict system validation completed successfully.'
}
catch {
  Write-Host "CI strict validation failed: $($_.Exception.Message)" -ForegroundColor Red

  if (Test-Path $emulatorErrLog) {
    Write-Host '--- Firestore emulator stderr (last 80 lines) ---'
    Get-Content -Path $emulatorErrLog -Tail 80
    Write-Host '--- end Firestore emulator stderr ---'
  }

  if (Test-Path $emulatorOutLog) {
    Write-Host '--- Firestore emulator stdout (last 80 lines) ---'
    Get-Content -Path $emulatorOutLog -Tail 80
    Write-Host '--- end Firestore emulator stdout ---'
  }

  if (Test-Path $appErrLog) {
    Write-Host '--- App stderr (last 80 lines) ---'
    Get-Content -Path $appErrLog -Tail 80
    Write-Host '--- end App stderr ---'
  }

  if (Test-Path $appOutLog) {
    Write-Host '--- App stdout (last 80 lines) ---'
    Get-Content -Path $appOutLog -Tail 80
    Write-Host '--- end App stdout ---'
  }

  exit 1
}
finally {
  Stop-BackgroundProcess -Process $appProcess -Name 'Next.js app'
  Stop-BackgroundProcess -Process $emulatorProcess -Name 'Firestore emulator'
}

if (-not $validationSucceeded) {
  exit 1
}

exit 0
