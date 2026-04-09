param(
  [string]$FirestoreHost = '127.0.0.1:9080',
  [string]$ProjectId = 'demo-hvac-auto',
  [string]$JavaHome = 'C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot'
)

$ErrorActionPreference = 'Stop'

if (-not [string]::IsNullOrWhiteSpace($JavaHome) -and (Test-Path $JavaHome)) {
  $env:JAVA_HOME = $JavaHome
  if ($env:Path -notlike "$JavaHome\\bin*") {
    $env:Path = "$JavaHome\bin;$env:Path"
  }
}

$env:FIRESTORE_EMULATOR_HOST = $FirestoreHost
$env:FIREBASE_PROJECT_ID = $ProjectId
$env:GCLOUD_PROJECT = $ProjectId

Write-Host "Using FIRESTORE_EMULATOR_HOST=$($env:FIRESTORE_EMULATOR_HOST)"
Write-Host "Using FIREBASE_PROJECT_ID=$($env:FIREBASE_PROJECT_ID)"
Write-Host "Using GCLOUD_PROJECT=$($env:GCLOUD_PROJECT)"
if (-not [string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
  Write-Host "Using JAVA_HOME=$($env:JAVA_HOME)"
}

powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'validate-preflight.ps1') -RequireJava -RequireFirebaseCli -RequireWebApiKey
exit $LASTEXITCODE
