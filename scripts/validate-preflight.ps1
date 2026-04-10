param(
  [switch]$RequireJava,
  [switch]$RequireFirebaseCli,
  [switch]$RequireWebApiKey
)

$ErrorActionPreference = 'Stop'

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Test-NonEmpty {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Add-Failure {
  param([string]$Message)
  $script:failures.Add($Message) | Out-Null
  Write-Host "FAIL $Message" -ForegroundColor Red
}

function Add-Warning {
  param([string]$Message)
  $script:warnings.Add($Message) | Out-Null
  Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Add-Pass {
  param([string]$Message)
  Write-Host "PASS $Message" -ForegroundColor Green
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

function Assert-Command {
  param(
    [string]$Name,
    [bool]$Required = $true
  )

  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd -ne $null) {
    $version = $null
    try {
      $version = (& $Name --version 2>$null | Select-Object -First 1)
    }
    catch {
      $version = $null
    }

    if ([string]::IsNullOrWhiteSpace($version)) {
      Add-Pass "$Name command is available"
    }
    else {
      Add-Pass "$Name command is available ($version)"
    }
    return
  }

  if ($Required) {
    Add-Failure "$Name command is not available in PATH"
  }
  else {
    Add-Warning "$Name command is not available in PATH"
  }
}

Write-Host '=== Validation Preflight ==='

$envLocalCount = Import-DotEnvFile -Path (Join-Path $workspaceRoot '.env.local')
if ($envLocalCount -gt 0) {
  Add-Pass "Loaded $envLocalCount variables from .env.local"
}

$envCount = Import-DotEnvFile -Path (Join-Path $workspaceRoot '.env')
if ($envCount -gt 0) {
  Add-Pass "Loaded $envCount variables from .env"
}

Assert-Command -Name 'node' -Required $true
Assert-Command -Name 'npm' -Required $true
Assert-Command -Name 'npx' -Required $true

if ($RequireJava) {
  Assert-Command -Name 'java' -Required $true
}
else {
  Assert-Command -Name 'java' -Required $false
}

if ($RequireFirebaseCli) {
  Assert-Command -Name 'firebase' -Required $true
}
else {
  Assert-Command -Name 'firebase' -Required $false
}

$credentialStrategies = New-Object System.Collections.Generic.List[string]

$hasServiceAccountJson = (Test-NonEmpty $env:FIREBASE_SERVICE_ACCOUNT_JSON) -or (Test-NonEmpty $env:FIREBASE_SERVICE_ACCOUNT)
if ($hasServiceAccountJson) {
  $credentialStrategies.Add('FIREBASE_SERVICE_ACCOUNT_JSON/FIREBASE_SERVICE_ACCOUNT') | Out-Null
}

$hasDiscrete =
  (Test-NonEmpty $env:FIREBASE_PROJECT_ID) -and
  (Test-NonEmpty $env:FIREBASE_CLIENT_EMAIL) -and
  ((Test-NonEmpty $env:FIREBASE_PRIVATE_KEY) -or (Test-NonEmpty $env:FIREBASE_PRIVATE_KEY_BASE64))
if ($hasDiscrete) {
  $credentialStrategies.Add('FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY(_BASE64)') | Out-Null
}

$hasEmulatorStrategy =
  (Test-NonEmpty $env:FIRESTORE_EMULATOR_HOST) -and
  ((Test-NonEmpty $env:FIREBASE_PROJECT_ID) -or (Test-NonEmpty $env:GCLOUD_PROJECT))
if ($hasEmulatorStrategy) {
  $credentialStrategies.Add('FIRESTORE_EMULATOR_HOST + FIREBASE_PROJECT_ID/GCLOUD_PROJECT') | Out-Null
}

$gacPath = $env:GOOGLE_APPLICATION_CREDENTIALS
if (Test-NonEmpty $gacPath) {
  if (Test-Path $gacPath) {
    $credentialStrategies.Add('GOOGLE_APPLICATION_CREDENTIALS') | Out-Null
  }
  else {
    Add-Warning "GOOGLE_APPLICATION_CREDENTIALS is set but file was not found: $gacPath"
  }
}

if ($credentialStrategies.Count -gt 0) {
  Add-Pass ("Firebase Admin credential strategy detected: " + ($credentialStrategies -join '; '))
}
else {
  Add-Failure 'No Firebase Admin credential strategy detected'
}

$hasServerWebApiKey = Test-NonEmpty $env:FIREBASE_WEB_API_KEY
$hasPublicWebApiKey = Test-NonEmpty $env:NEXT_PUBLIC_FIREBASE_API_KEY

if ($hasServerWebApiKey) {
  Add-Pass 'Firebase Web API key is configured (FIREBASE_WEB_API_KEY)'
}
else {
  $missingWebApiKeyMessage = 'Missing FIREBASE_WEB_API_KEY'
  if ($hasPublicWebApiKey) {
    $missingWebApiKeyMessage += ' (NEXT_PUBLIC_FIREBASE_API_KEY is set but server routes do not use it)'
  }

  if ($RequireWebApiKey) {
    Add-Failure $missingWebApiKeyMessage
  }
  else {
    Add-Warning "$missingWebApiKeyMessage (required for strict auth endpoint validation)"
  }
}

Write-Host ''
Write-Host '=== Preflight Summary ==='
Write-Host "Failures: $($failures.Count)"
Write-Host "Warnings: $($warnings.Count)"

if ($failures.Count -gt 0) {
  Write-Host ''
  Write-Host 'Validation preflight failed.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host 'Validation preflight passed.' -ForegroundColor Green
exit 0
