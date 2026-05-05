param(
  [string]$ProjectId = '',
  [string]$AppId = '',
  [string]$EnvFile = '.env.local'
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $workspaceRoot

function Assert-Command {
  param([string]$Name)
  if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not available in PATH"
  }
}

function Resolve-ProjectId {
  param([string]$PreferredProjectId)

  if (-not [string]::IsNullOrWhiteSpace($PreferredProjectId)) {
    return $PreferredProjectId
  }

  $firebasercPath = Join-Path $workspaceRoot '.firebaserc'
  if (-not (Test-Path $firebasercPath)) {
    return ''
  }

  try {
    $rc = Get-Content -Path $firebasercPath -Raw | ConvertFrom-Json
    if ($null -ne $rc.projects -and -not [string]::IsNullOrWhiteSpace([string]$rc.projects.default)) {
      return [string]$rc.projects.default
    }
  }
  catch {
    return ''
  }

  return ''
}

function Resolve-EnvPath {
  param([string]$PathValue)

  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }

  return (Join-Path $workspaceRoot $PathValue)
}

function Set-EnvVar {
  param(
    [string]$Source,
    [string]$Name,
    [string]$Value
  )

  $pattern = "(?m)^\s*$Name\s*=.*$"
  $line = "$Name=$Value"

  if ([regex]::IsMatch($Source, $pattern)) {
    return [regex]::Replace($Source, $pattern, $line)
  }

  if (-not [string]::IsNullOrEmpty($Source) -and -not $Source.EndsWith("`n")) {
    $Source += "`r`n"
  }

  return $Source + $line + "`r`n"
}

Assert-Command -Name 'npx'

$resolvedProjectId = Resolve-ProjectId -PreferredProjectId $ProjectId
if ([string]::IsNullOrWhiteSpace($resolvedProjectId)) {
  throw 'Unable to resolve Firebase project ID. Pass -ProjectId <project-id> or set projects.default in .firebaserc.'
}

$resolvedAppId = $AppId
if ([string]::IsNullOrWhiteSpace($resolvedAppId)) {
  $appsRaw = npx firebase-tools apps:list WEB --project $resolvedProjectId --json
  $appsJson = $appsRaw | ConvertFrom-Json

  if ($appsJson.status -ne 'success' -or $null -eq $appsJson.result -or $appsJson.result.Count -eq 0) {
    throw "No Firebase WEB app found for project $resolvedProjectId."
  }

  $resolvedAppId = [string]$appsJson.result[0].appId
}

$sdkRaw = npx firebase-tools apps:sdkconfig WEB $resolvedAppId --project $resolvedProjectId --json
$sdkJson = $sdkRaw | ConvertFrom-Json

# ---------------------------------------------------------------------------
# Extract all SDK config fields from the sdkConfig object, falling back to
# regex extraction from the fileContents JS snippet when needed.
# ---------------------------------------------------------------------------

# Map of sdkConfig property -> env var name
$configMap = [ordered]@{
  apiKey            = 'NEXT_PUBLIC_FIREBASE_API_KEY'
  authDomain        = 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'
  databaseURL       = 'NEXT_PUBLIC_FIREBASE_DATABASE_URL'
  projectId         = 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
  storageBucket     = 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'
  messagingSenderId = 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'
  appId             = 'NEXT_PUBLIC_FIREBASE_APP_ID'
  measurementId     = 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
}

$sdkConfig = $null
if ($null -ne $sdkJson.result -and $null -ne $sdkJson.result.sdkConfig) {
  $sdkConfig = $sdkJson.result.sdkConfig
}

$fileContents = ''
if ($null -ne $sdkJson.result -and -not [string]::IsNullOrWhiteSpace([string]$sdkJson.result.fileContents)) {
  $fileContents = [string]$sdkJson.result.fileContents
}

$extracted = @{}

foreach ($prop in $configMap.Keys) {
  $val = ''

  # Try structured sdkConfig object first
  if ($null -ne $sdkConfig) {
    try {
      $candidate = [string]$sdkConfig.$prop
      if (-not [string]::IsNullOrWhiteSpace($candidate)) {
        $val = $candidate
      }
    }
    catch {}
  }

  # Fall back to regex extraction from fileContents
  if ([string]::IsNullOrWhiteSpace($val) -and -not [string]::IsNullOrWhiteSpace($fileContents)) {
    $rxPattern = '{0}\s*:\s*[''"]([^''"]+)[''"]' -f $prop
    $match = [regex]::Match($fileContents, $rxPattern)
    if ($match.Success) {
      $val = $match.Groups[1].Value
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($val)) {
    $extracted[$prop] = $val
  }
}

# apiKey is mandatory
if (-not $extracted.ContainsKey('apiKey') -or [string]::IsNullOrWhiteSpace($extracted['apiKey'])) {
  throw "Failed to extract Firebase Web API key for app $resolvedAppId."
}

# ---------------------------------------------------------------------------
# Write all extracted values into the target env file
# ---------------------------------------------------------------------------

$envPath = Resolve-EnvPath -PathValue $EnvFile
if (-not (Test-Path $envPath)) {
  New-Item -Path $envPath -ItemType File | Out-Null
}

$envContent = Get-Content -Path $envPath -Raw -ErrorAction SilentlyContinue
if ($null -eq $envContent) {
  $envContent = ''
}

foreach ($prop in $configMap.Keys) {
  $envName = $configMap[$prop]
  if ($extracted.ContainsKey($prop)) {
    $envContent = Set-EnvVar -Source $envContent -Name $envName -Value $extracted[$prop]
  }
}

# Server-side web API key (used by auth-rest.ts and smoke scripts)
$envContent = Set-EnvVar -Source $envContent -Name 'FIREBASE_WEB_API_KEY' -Value $extracted['apiKey']

Set-Content -Path $envPath -Value $envContent -NoNewline

$writtenCount = $extracted.Count + 1  # +1 for FIREBASE_WEB_API_KEY
Write-Host "Updated $EnvFile with $writtenCount Firebase config vars for project $resolvedProjectId."
foreach ($prop in $extracted.Keys) {
  Write-Host "  $($configMap[$prop]) = $($extracted[$prop].Substring(0, [Math]::Min(12, $extracted[$prop].Length)))..."
}

