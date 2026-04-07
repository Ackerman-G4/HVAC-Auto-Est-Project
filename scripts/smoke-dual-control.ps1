param(
  [string]$BaseUrl = 'http://127.0.0.1:3000'
)

$ErrorActionPreference = 'Stop'

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "ASSERTION FAILED: $Message"
  }
}

function ConvertTo-JsonBody {
  param([object]$Object)
  return ($Object | ConvertTo-Json -Depth 12)
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

$projectId = $null
$roomId = $null
$selectionId = $null
$itemId = $null

try {
  Write-Host '[1/14] Creating project...'
  $projectResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects" -Method Post -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    name = "Smoke DualControl $(Get-Date -Format 'yyyyMMddHHmmss')"
    clientName = 'Smoke Client'
    buildingType = 'commercial'
    location = 'Quezon City'
    city = 'Manila'
    totalFloorArea = 120
    outdoorDB = 35
    outdoorRH = 55
    indoorDB = 24
    indoorRH = 50
  })
  $projectId = $projectResp.project.id
  Assert-True (-not [string]::IsNullOrWhiteSpace($projectId)) 'Project id missing'
  Write-Host 'PASS create project'

  Write-Host '[2/14] Adding room with cooling load...'
  $roomResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/rooms" -Method Post -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    name = 'Smoke Room'
    floorNumber = 1
    spaceType = 'office'
    area = 35
    perimeter = 24
    ceilingHeight = 2.7
    wallConstruction = 'concrete_block_200mm'
    windowType = 'single_clear_6mm'
    windowArea = 5
    windowOrientation = 'N'
    occupantCount = 4
    lightingDensity = 15
    equipmentLoad = 500
    hasRoofExposure = $false
  })
  $roomId = $roomResp.room.id
  Assert-True ($null -ne $roomResp.room.coolingLoad) 'Cooling load not created'
  Write-Host 'PASS add room + cooling load'

  Write-Host '[3/14] Auto-sizing equipment...'
  $autoResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/equipment" -Method Post -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    autoSize = $true
    budgetLevel = 'mid-range'
  })
  Assert-True ($autoResp.results.Count -gt 0) 'No equipment results generated'
  $selectionId = $autoResp.results[0].equipment.id
  Assert-True (-not [string]::IsNullOrWhiteSpace($selectionId)) 'Equipment selection id missing'
  Write-Host 'PASS auto-size equipment'

  Write-Host '[4/14] Generating BOQ...'
  $boqResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/boq" -Method Post -ContentType 'application/json' -Body '{}'
  Assert-True ($boqResp.boq.grandTotal -gt 0) 'BOQ grand total should be > 0'
  Write-Host 'PASS generate BOQ'

  Write-Host '[5/14] Capturing first BOQ item...'
  $projectGet = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId" -Method Get
  Assert-True ($projectGet.project.boqItems.Count -gt 0) 'No BOQ items returned from project detail'
  $itemId = $projectGet.project.boqItems[0].id
  Assert-True (-not [string]::IsNullOrWhiteSpace($itemId)) 'BOQ item id missing'
  Write-Host 'PASS load project detail'

  Write-Host '[6/14] Saving pricing overrides...'
  $pricingResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId" -Method Put -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    laborMultiplierOverride = 0.42
    overheadPercentOverride = 0.18
    contingencyPercentOverride = 0.07
    vatRateOverride = 0.11
  })
  Assert-True ($pricingResp.project.isBoqStale -eq $true) 'Project should be BOQ stale after pricing override'
  Write-Host 'PASS pricing overrides'

  Write-Host '[7/14] Saving room load overrides...'
  $roomOverrideResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/rooms/$roomId" -Method Put -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    userTrOverride = 2.5
    userBtuOverride = 30000
    overrideReason = 'Smoke test room override'
  })
  Assert-True ($roomOverrideResp.room.coolingLoad.isOverridden -eq $true) 'Room load should be overridden'
  Write-Host 'PASS room load override'

  Write-Host '[8/14] Saving equipment overrides...'
  $equipOverrideResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/equipment/$selectionId" -Method Put -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    userQuantityOverride = 2
    userUnitPriceOverride = 12345.67
    overrideReason = 'Smoke test equipment override'
  })
  Assert-True ($equipOverrideResp.equipment.isOverridden -eq $true) 'Equipment should be overridden'
  Write-Host 'PASS equipment override'

  Write-Host '[9/14] Regenerating BOQ...'
  $boqRegenResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/boq" -Method Post -ContentType 'application/json' -Body '{}'
  Assert-True ($boqRegenResp.boq.grandTotal -gt 0) 'Regenerated BOQ grand total should be > 0'
  $projectAfterRegen = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId" -Method Get
  Assert-True ($projectAfterRegen.project.boqItems.Count -gt 0) 'No BOQ items available after regeneration'
  $itemId = $projectAfterRegen.project.boqItems[0].id
  Assert-True (-not [string]::IsNullOrWhiteSpace($itemId)) 'BOQ item id missing after regeneration'
  Write-Host 'PASS regenerate BOQ'

  Write-Host '[10/14] Overriding BOQ item...'
  $boqItemOverrideResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/boq/$itemId" -Method Put -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    unitPrice = 999.99
    overrideReason = 'Smoke test BOQ override'
  })
  Assert-True ($boqItemOverrideResp.item.isOverridden -eq $true) 'BOQ item should be overridden'
  Write-Host 'PASS BOQ item override'

  Write-Host '[11/14] Resetting BOQ item to suggested...'
  $boqItemResetResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/boq/$itemId" -Method Put -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    useSuggested = $true
    userUnitPriceOverride = $null
  })
  Assert-True ($boqItemResetResp.item.isOverridden -eq $false) 'BOQ item override should clear'
  Write-Host 'PASS BOQ item reset'

  Write-Host '[12/14] Resetting room load to suggested...'
  $roomResetResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/rooms/$roomId" -Method Put -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    userTrOverride = $null
    userBtuOverride = $null
  })
  Assert-True ($roomResetResp.room.coolingLoad.isOverridden -eq $false) 'Room load override should clear'
  Write-Host 'PASS room load reset'

  Write-Host '[13/14] Resetting equipment to suggested...'
  $equipResetResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/equipment/$selectionId" -Method Put -ContentType 'application/json' -Body (ConvertTo-JsonBody @{
    useSuggested = $true
    userQuantityOverride = $null
    userUnitPriceOverride = $null
  })
  Assert-True ($equipResetResp.equipment.isOverridden -eq $false) 'Equipment override should clear'
  Write-Host 'PASS equipment reset'

  Write-Host '[14/14] Verifying pricing policy override state in BOQ GET...'
  $boqGetResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/boq" -Method Get
  Assert-True ($boqGetResp.pricingPolicy.laborMultiplier.isOverridden -eq $true) 'Pricing policy override state should be true'
  Write-Host 'PASS pricing policy override state'

  Write-Host ''
  Write-Host 'DUAL-CONTROL SMOKE: ALL CHECKS PASSED'
  exit 0
}
catch {
  $detail = Get-HttpErrorDetail -ErrorRecord $_
  $message = $_.Exception.Message

  Write-Host ''
  Write-Host "DUAL-CONTROL SMOKE FAILED: $message"

  if ($null -ne $detail.StatusCode) {
    Write-Host "HTTP status: $($detail.StatusCode)"
  }

  if (-not [string]::IsNullOrWhiteSpace($detail.Body)) {
    Write-Host "HTTP body: $($detail.Body)"
  }

  $errorBlob = "$message`n$($detail.Body)"
  if ($errorBlob -match 'Could not load the default credentials') {
    Write-Host 'Hint: Firebase Admin credentials are missing for the running API process.'
    Write-Host 'Set one of the following before running npm run dev:'
    Write-Host '  1) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY'
    Write-Host '  2) FIREBASE_SERVICE_ACCOUNT_JSON'
    Write-Host '  3) GOOGLE_APPLICATION_CREDENTIALS (path to service-account JSON)'
  }

  exit 1
}
finally {
  if (-not [string]::IsNullOrWhiteSpace($projectId)) {
    try {
      Invoke-RestMethod -Uri "$BaseUrl/api/projects/${projectId}?permanent=true" -Method Delete | Out-Null
      Write-Host 'Cleanup complete: test project deleted'
    }
    catch {
      Write-Warning "Cleanup failed for project $projectId"
    }
  }
}
