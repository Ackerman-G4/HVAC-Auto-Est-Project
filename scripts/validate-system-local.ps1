param(
  [string]$FirestoreHost = '127.0.0.1:9080',
  [string]$ProjectId = 'demo-hvac-auto'
)

$ErrorActionPreference = 'Stop'

$env:FIRESTORE_EMULATOR_HOST = $FirestoreHost
$env:FIREBASE_PROJECT_ID = $ProjectId
$env:GCLOUD_PROJECT = $ProjectId

Write-Host "Using FIRESTORE_EMULATOR_HOST=$($env:FIRESTORE_EMULATOR_HOST)"
Write-Host "Using FIREBASE_PROJECT_ID=$($env:FIREBASE_PROJECT_ID)"
Write-Host "Using GCLOUD_PROJECT=$($env:GCLOUD_PROJECT)"

npm run validate:system
exit $LASTEXITCODE
