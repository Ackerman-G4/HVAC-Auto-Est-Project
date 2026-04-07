param(
  [string]$ProjectId = '',
  [string]$AppId = '',
  [string]$EnvFile = '.env.local'
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
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

$apiKey = ''
if ($null -ne $sdkJson.result -and $null -ne $sdkJson.result.sdkConfig) {
  try {
    $apiKey = [string]$sdkJson.result.sdkConfig.apiKey
  }
  catch {
    $apiKey = ''
  }
}

if ([string]::IsNullOrWhiteSpace($apiKey) -and $null -ne $sdkJson.result) {
  $fileContents = [string]$sdkJson.result.fileContents
  if (-not [string]::IsNullOrWhiteSpace($fileContents)) {
    $match = [regex]::Match($fileContents, 'apiKey\s*:\s*[''\"]([^''\"]+)[''\"]')
    if ($match.Success) {
      $apiKey = $match.Groups[1].Value
    }
  }
}

if ([string]::IsNullOrWhiteSpace($apiKey)) {
  throw "Failed to extract Firebase Web API key for app $resolvedAppId."
}

$envPath = Resolve-EnvPath -PathValue $EnvFile
if (-not (Test-Path $envPath)) {
  New-Item -Path $envPath -ItemType File | Out-Null
}

$envContent = Get-Content -Path $envPath -Raw -ErrorAction SilentlyContinue
if ($null -eq $envContent) {
  $envContent = ''
}

$envContent = Set-EnvVar -Source $envContent -Name 'NEXT_PUBLIC_FIREBASE_API_KEY' -Value $apiKey
$envContent = Set-EnvVar -Source $envContent -Name 'FIREBASE_WEB_API_KEY' -Value $apiKey

Set-Content -Path $envPath -Value $envContent -NoNewline

Write-Host "Updated $EnvFile with NEXT_PUBLIC_FIREBASE_API_KEY and FIREBASE_WEB_API_KEY for project $resolvedProjectId."
