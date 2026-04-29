param(
  [switch]$ForceRaw,
  [switch]$ForceLocal
)

$ErrorActionPreference = 'Stop'

function Test-NonEmpty {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Test-TrueString {
  param([string]$Value)
  if (-not (Test-NonEmpty $Value)) {
    return $false
  }

  $normalized = $Value.Trim().ToLowerInvariant()
  return ($normalized -eq 'true') -or ($normalized -eq '1') -or ($normalized -eq 'yes')
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

function Invoke-NpmScript {
  param([string]$ScriptName)

  & npm run $ScriptName
  exit $LASTEXITCODE
}

if ($ForceRaw -and $ForceLocal) {
  throw 'Use either -ForceRaw or -ForceLocal, not both.'
}

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $workspaceRoot

$envLocalCount = Import-DotEnvFile -Path (Join-Path $workspaceRoot '.env.local')
if ($envLocalCount -gt 0) {
  Write-Host "Loaded $envLocalCount variables from .env.local"
}

$envCount = Import-DotEnvFile -Path (Join-Path $workspaceRoot '.env')
if ($envCount -gt 0) {
  Write-Host "Loaded $envCount variables from .env"
}

if ($ForceRaw) {
  Write-Host 'Forced raw strict validation path.'
  Invoke-NpmScript -ScriptName 'validate:system:strict:raw'
}

if ($ForceLocal) {
  Write-Host 'Forced strict local orchestration path.'
  Invoke-NpmScript -ScriptName 'validate:system:strict:local'
}

$isCi = Test-TrueString $env:CI

$hasServiceAccountJson =
  (Test-NonEmpty $env:FIREBASE_SERVICE_ACCOUNT_JSON) -or
  (Test-NonEmpty $env:FIREBASE_SERVICE_ACCOUNT)

$hasServiceAccountDiscrete =
  (Test-NonEmpty $env:FIREBASE_PROJECT_ID) -and
  (Test-NonEmpty $env:FIREBASE_CLIENT_EMAIL) -and
  ((Test-NonEmpty $env:FIREBASE_PRIVATE_KEY) -or (Test-NonEmpty $env:FIREBASE_PRIVATE_KEY_BASE64))

$gacPath = $env:GOOGLE_APPLICATION_CREDENTIALS
$hasGoogleApplicationCredentials =
  (Test-NonEmpty $gacPath) -and (Test-Path $gacPath)

$hasPreProvisionedAdminCredentials =
  (Test-NonEmpty $env:RBAC_ADMIN_EMAIL) -and
  (Test-NonEmpty $env:RBAC_ADMIN_PASSWORD)

$hasRawStrictCredentialStrategy =
  $hasServiceAccountJson -or
  $hasServiceAccountDiscrete -or
  $hasGoogleApplicationCredentials -or
  $hasPreProvisionedAdminCredentials

if ($isCi -or $hasRawStrictCredentialStrategy) {
  if ($isCi) {
    Write-Host 'CI environment detected; running raw strict validation chain.'
  }
  else {
    Write-Host 'Strict credential strategy detected; running raw strict validation chain.'
  }

  Invoke-NpmScript -ScriptName 'validate:system:strict:raw'
}

Write-Warning 'No raw strict credential strategy detected in local shell.'
Write-Host 'Routing to strict local orchestration (emulator + dedicated app + temporary local strict admin)...'
Invoke-NpmScript -ScriptName 'validate:system:strict:local'
