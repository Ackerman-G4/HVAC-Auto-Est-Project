param(
  [int]$AppPort = 3000,
  [int]$FirestorePort = 9080,
  [string]$ProjectId = 'demo-hvac-auto',
  [int]$StartupTimeoutSeconds = 120,
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['Invoke-WebRequest:DisableKeepAlive'] = $true
$PSDefaultParameterValues['Invoke-RestMethod:DisableKeepAlive'] = $true

function Test-NonEmpty {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Test-TrueString {
  param([string]$Value)
  return (Test-NonEmpty $Value) -and ($Value.Trim().ToLowerInvariant() -eq 'true')
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

function ConvertTo-JsonBody {
  param([object]$Object)
  return ($Object | ConvertTo-Json -Depth 8)
}

function Get-HttpErrorDetail {
  param([System.Management.Automation.ErrorRecord]$ErrorRecord)

  $statusCode = $null
  $body = $null

  try {
    $response = $ErrorRecord.Exception.Response
    if ($null -ne $response) {
      try {
        $statusCode = [int]$response.StatusCode
      }
      catch {
        $statusCode = $null
      }

      try {
        $stream = $response.GetResponseStream()
        if ($null -ne $stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $body = $reader.ReadToEnd()
          $reader.Dispose()
          $stream.Dispose()
        }
      }
      catch {
        $body = $null
      }
    }
  }
  catch {
    $statusCode = $null
    $body = $null
  }

  return [pscustomobject]@{
    StatusCode = $statusCode
    Body = $body
  }
}

function Ensure-StrictAdminCredentials {
  $resolvedEmail = [Environment]::GetEnvironmentVariable('RBAC_ADMIN_EMAIL', 'Process')
  $resolvedSecret = [Environment]::GetEnvironmentVariable('RBAC_ADMIN_PASSWORD', 'Process')

  if ((Test-NonEmpty $resolvedEmail) -and (Test-NonEmpty $resolvedSecret)) {
    Write-Host "Using existing strict local admin credentials: $resolvedEmail"
    return [pscustomobject]@{
      Email = $resolvedEmail
      Password = $resolvedSecret
    }
  }

  $stamp = "$(Get-Date -Format 'yyyyMMddHHmmss')$(Get-Random -Minimum 100 -Maximum 999)"

  if (-not (Test-NonEmpty $resolvedEmail)) {
    $resolvedEmail = "strict.local.admin.$stamp@example.com"
  }

  if (-not (Test-NonEmpty $resolvedSecret)) {
    $resolvedSecret = "StrongPass$stamp!"
  }

  [Environment]::SetEnvironmentVariable('RBAC_ADMIN_EMAIL', $resolvedEmail, 'Process')
  [Environment]::SetEnvironmentVariable('RBAC_ADMIN_PASSWORD', $resolvedSecret, 'Process')

  Write-Host "Prepared strict local admin credentials: $resolvedEmail"

  return [pscustomobject]@{
    Email = $resolvedEmail
    Password = $resolvedSecret
  }
}

function Ensure-StrictAdminUser {
  param(
    [string]$Url,
    [string]$Email,
    [string]$Password
  )

  $payload = ConvertTo-JsonBody @{
    email = $Email
    password = $Password
    name = 'Strict Local Admin'
    role = 'admin'
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/auth/register" -Method Post -ContentType 'application/json' -Body $payload
    Write-Host "Strict local admin bootstrap register status: $($response.StatusCode)"
    return
  }
  catch {
    $detail = Get-HttpErrorDetail -ErrorRecord $_
    if ($detail.StatusCode -eq 409) {
      Write-Host 'Strict local admin bootstrap register returned 409 (user exists); continuing.'
      return
    }

    if (-not [string]::IsNullOrWhiteSpace($detail.Body)) {
      throw "Failed to bootstrap strict local admin user (status=$($detail.StatusCode)): $($detail.Body)"
    }

    throw "Failed to bootstrap strict local admin user: $($_.Exception.Message)"
  }
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

function Test-PortListening {
  param([int]$Port)

  try {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1
    return ($null -ne $listener)
  }
  catch {
    return $false
  }
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

function Test-AppReady {
  param(
    [string]$BaseUrl,
    [string]$FallbackBaseUrl,
    [int]$TimeoutSeconds = 6
  )

  $ready = Wait-HttpReady -Url "$BaseUrl/auth/login" -TimeoutSeconds $TimeoutSeconds
  if (-not $ready) {
    $ready = Wait-HttpReady -Url "$FallbackBaseUrl/auth/login" -TimeoutSeconds 4
  }

  return $ready
}

function Start-LocalValidationApp {
  param(
    [string]$WorkspaceRoot,
    [int]$AppPort,
    [int]$FirestorePort,
    [string]$ProjectId,
    [string]$AppOutLog,
    [string]$AppErrLog,
    [string]$BaseUrl,
    [string]$FallbackBaseUrl,
    [int]$StartupTimeoutSeconds
  )

  $appCommand = "`$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:$FirestorePort'; `$env:FIREBASE_PROJECT_ID='$ProjectId'; `$env:GCLOUD_PROJECT='$ProjectId'; `$env:FIRESTORE_PREFER_REST='true'; `$env:GOOGLE_APPLICATION_CREDENTIALS=''; Set-Location '$WorkspaceRoot'; npm run start -- --port $AppPort"
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $appCommand -PassThru -RedirectStandardOutput $AppOutLog -RedirectStandardError $AppErrLog

  Write-Host "Started local validation app (PID $($process.Id)); waiting for $BaseUrl/auth/login (fallback $FallbackBaseUrl/auth/login) ..."
  $ready = Test-AppReady -BaseUrl $BaseUrl -FallbackBaseUrl $FallbackBaseUrl -TimeoutSeconds $StartupTimeoutSeconds
  if (-not $ready) {
    Stop-BackgroundProcess -Process $process -Name 'Local validation app (startup failure)'
    throw "Validation app did not become ready on port $AppPort within $StartupTimeoutSeconds seconds."
  }

  return $process
}

function Invoke-ValidationStepWithAppRecovery {
  param(
    [string]$Label,
    [scriptblock]$Action,
    [ref]$AppProcess,
    [string]$WorkspaceRoot,
    [int]$AppPort,
    [int]$FirestorePort,
    [string]$ProjectId,
    [string]$AppOutLog,
    [string]$AppErrLog,
    [string]$BaseUrl,
    [string]$FallbackBaseUrl,
    [int]$StartupTimeoutSeconds
  )

  try {
    Invoke-ValidationStep -Label $Label -Action $Action
    return
  }
  catch {
    $stepFailure = $_
    $processExited = ($null -eq $AppProcess.Value) -or $AppProcess.Value.HasExited
    $appHealthy = $false

    if (-not $processExited) {
      $appHealthy = Test-AppReady -BaseUrl $BaseUrl -FallbackBaseUrl $FallbackBaseUrl -TimeoutSeconds 6
    }

    if (-not $processExited -and $appHealthy) {
      throw $stepFailure
    }

    Write-Warning "$Label failed while app was unavailable. Restarting app and retrying once."
    Stop-BackgroundProcess -Process $AppProcess.Value -Name 'Local validation app'
    $AppProcess.Value = Start-LocalValidationApp -WorkspaceRoot $WorkspaceRoot -AppPort $AppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $AppOutLog -AppErrLog $AppErrLog -BaseUrl $BaseUrl -FallbackBaseUrl $FallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds

    Invoke-ValidationStep -Label "$Label (retry)" -Action $Action
  }
}

function Get-AvailablePort {
  param(
    [int]$PreferredPort,
    [int]$MaxAttempts = 20
  )

  for ($offset = 0; $offset -lt $MaxAttempts; $offset += 1) {
    $candidate = $PreferredPort + $offset
    if (-not (Test-PortListening -Port $candidate)) {
      return $candidate
    }
  }

  throw "Unable to find an available app port starting from $PreferredPort"
}

function Invoke-ValidationStep {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host "Running $Label..."
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logDir = Join-Path $workspaceRoot '.logs'
if (-not (Test-Path $logDir)) {
  New-Item -Path $logDir -ItemType Directory | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$emulatorOutLog = Join-Path $logDir "local-firestore-$timestamp.out.log"
$emulatorErrLog = Join-Path $logDir "local-firestore-$timestamp.err.log"
$appOutLog = Join-Path $logDir "local-app-$timestamp.out.log"
$appErrLog = Join-Path $logDir "local-app-$timestamp.err.log"

$emulatorProcess = $null
$appProcess = $null
$validationSucceeded = $false
$startedEmulator = $false
$startedApp = $false
$strictAdmin = $null

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
  Assert-Command -Name 'firebase'
  Assert-Command -Name 'java'

  Assert-EnvAny -Names @('FIREBASE_WEB_API_KEY')

  if (-not (Test-NonEmpty $env:NEXT_PUBLIC_FIREBASE_API_KEY) -and (Test-NonEmpty $env:FIREBASE_WEB_API_KEY)) {
    $env:NEXT_PUBLIC_FIREBASE_API_KEY = $env:FIREBASE_WEB_API_KEY
  }

  $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:$FirestorePort"
  $env:FIREBASE_PROJECT_ID = $ProjectId
  $env:GCLOUD_PROJECT = $ProjectId
  $env:FIRESTORE_PREFER_REST = 'true'
  $env:ENABLE_BUILDING_SIMULATION = 'true'
  $env:NEXT_PUBLIC_ENABLE_BUILDING_SIMULATION = 'true'
  $env:AUTH_RATE_LIMIT_DISABLED = 'true'

  if (Test-NonEmpty $env:GOOGLE_APPLICATION_CREDENTIALS) {
    Write-Host 'Clearing GOOGLE_APPLICATION_CREDENTIALS for local emulator validation context.'
    $env:GOOGLE_APPLICATION_CREDENTIALS = ''
  }

  if ($Strict) {
    $env:ALLOW_ADMIN_SELF_ASSIGNMENT = 'true'
    $strictAdmin = Ensure-StrictAdminCredentials
    Write-Host 'Strict local mode enabled with ALLOW_ADMIN_SELF_ASSIGNMENT=true for emulator-only validation.'
  }

  Write-Host "Using FIRESTORE_EMULATOR_HOST=$($env:FIRESTORE_EMULATOR_HOST)"
  Write-Host "Using FIREBASE_PROJECT_ID=$($env:FIREBASE_PROJECT_ID)"
  Write-Host "Using GCLOUD_PROJECT=$($env:GCLOUD_PROJECT)"
  Write-Host "Using FIRESTORE_PREFER_REST=$($env:FIRESTORE_PREFER_REST)"
  Write-Host "Using ENABLE_BUILDING_SIMULATION=$($env:ENABLE_BUILDING_SIMULATION)"
  Write-Host "Using NEXT_PUBLIC_ENABLE_BUILDING_SIMULATION=$($env:NEXT_PUBLIC_ENABLE_BUILDING_SIMULATION)"
  Write-Host "Using AUTH_RATE_LIMIT_DISABLED=$($env:AUTH_RATE_LIMIT_DISABLED)"

  if (Test-PortListening -Port $FirestorePort) {
    Write-Host "Reusing running process on Firestore emulator port $FirestorePort."
  }
  else {
    $emulatorCommand = "Set-Location '$workspaceRoot'; npm run emulator:firestore"
    $emulatorProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $emulatorCommand -PassThru -RedirectStandardOutput $emulatorOutLog -RedirectStandardError $emulatorErrLog
    $startedEmulator = $true

    Write-Host "Started Firestore emulator (PID $($emulatorProcess.Id)); waiting for port $FirestorePort..."
    if (-not (Wait-PortListening -Port $FirestorePort -TimeoutSeconds $StartupTimeoutSeconds)) {
      throw "Firestore emulator did not become ready on port $FirestorePort within $StartupTimeoutSeconds seconds."
    }
  }

  $effectiveAppPort = Get-AvailablePort -PreferredPort $AppPort
  if ($effectiveAppPort -ne $AppPort) {
    Write-Host "Preferred app port $AppPort is in use; using $effectiveAppPort instead."
  }

  $baseUrl = "http://127.0.0.1:$effectiveAppPort"
  $fallbackBaseUrl = "http://localhost:$effectiveAppPort"

  Write-Host 'Building app for local validation server...'
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "build failed with exit code $LASTEXITCODE"
  }

  $appProcess = Start-LocalValidationApp -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds
  $startedApp = $true

  if ($Strict -and $null -ne $strictAdmin) {
    Ensure-StrictAdminUser -Url $baseUrl -Email $strictAdmin.Email -Password $strictAdmin.Password
  }

  if ($Strict) {
    Invoke-ValidationStep -Label 'validate:preflight:strict:local' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'validate-preflight-strict-local.ps1') -FirestoreHost "127.0.0.1:$FirestorePort" -ProjectId $ProjectId
    }

    Invoke-ValidationStepWithAppRecovery -Label 'validate:auth:positive' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'validate-auth-positive.ps1') -BaseUrl $baseUrl
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds

    Invoke-ValidationStepWithAppRecovery -Label 'validate:rbac:positive:strict' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'validate-rbac-positive.ps1') -BaseUrl $baseUrl -StrictAdminPositive
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds

    Invoke-ValidationStepWithAppRecovery -Label 'validate:dual-control' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'smoke-dual-control.ps1') -BaseUrl $baseUrl
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds

    Invoke-ValidationStepWithAppRecovery -Label 'validate:building-simulation' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'smoke-building-simulation.ps1') -BaseUrl $baseUrl
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds

    Invoke-ValidationStepWithAppRecovery -Label 'validate:catalog:admin:strict' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'smoke-catalog-admin.ps1') -BaseUrl $baseUrl -Strict
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds
  }
  else {
    Invoke-ValidationStep -Label 'validate:preflight' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'validate-preflight.ps1')
    }

    Invoke-ValidationStepWithAppRecovery -Label 'validate:auth' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'smoke-auth.ps1') -BaseUrl $baseUrl
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds

    Invoke-ValidationStepWithAppRecovery -Label 'validate:rbac' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'smoke-rbac.ps1') -BaseUrl $baseUrl
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds

    Invoke-ValidationStepWithAppRecovery -Label 'validate:dual-control' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'smoke-dual-control.ps1') -BaseUrl $baseUrl
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds

    Invoke-ValidationStepWithAppRecovery -Label 'validate:building-simulation' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'smoke-building-simulation.ps1') -BaseUrl $baseUrl
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds

    Invoke-ValidationStepWithAppRecovery -Label 'validate:catalog:admin' -Action {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'smoke-catalog-admin.ps1') -BaseUrl $baseUrl
    } -AppProcess ([ref]$appProcess) -WorkspaceRoot $workspaceRoot -AppPort $effectiveAppPort -FirestorePort $FirestorePort -ProjectId $ProjectId -AppOutLog $appOutLog -AppErrLog $appErrLog -BaseUrl $baseUrl -FallbackBaseUrl $fallbackBaseUrl -StartupTimeoutSeconds $StartupTimeoutSeconds
  }

  if ($startedApp) {
    Stop-BackgroundProcess -Process $appProcess -Name 'Local validation app'
    $startedApp = $false
    $appProcess = $null
  }

  Invoke-ValidationStep -Label 'validate:quality' -Action {
    & npm run validate:quality
  }

  $validationSucceeded = $true
  Write-Host 'Local system validation completed successfully.'
}
catch {
  Write-Host "Local system validation failed: $($_.Exception.Message)" -ForegroundColor Red

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
  if ($startedApp) {
    Stop-BackgroundProcess -Process $appProcess -Name 'Next.js app'
  }

  if ($startedEmulator) {
    Stop-BackgroundProcess -Process $emulatorProcess -Name 'Firestore emulator'
  }
}

if (-not $validationSucceeded) {
  exit 1
}

exit 0
