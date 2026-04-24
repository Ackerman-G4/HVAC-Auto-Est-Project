param(
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$EngineerEmail = '',
  [SecureString]$EngineerPassword
)

$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['Invoke-WebRequest:DisableKeepAlive'] = $true
$PSDefaultParameterValues['Invoke-RestMethod:DisableKeepAlive'] = $true

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "ASSERTION FAILED: $Message"
  }
}

function Test-NonEmpty {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function ConvertTo-PlainText {
  param([SecureString]$SecureValue)

  if ($null -eq $SecureValue) {
    return ''
  }

  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function ConvertTo-JsonBody {
  param([object]$Object)
  return ($Object | ConvertTo-Json -Depth 12)
}

function Invoke-RestMethodWithRetry {
  param(
    [string]$Operation,
    [hashtable]$Params,
    [int]$MaxAttempts = 5,
    [int]$InitialDelayMs = 750
  )

  $opLabel = if (Test-NonEmpty $Operation) { $Operation } else { 'HTTP request' }

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      return Invoke-RestMethod @Params
    }
    catch {
      $detail = Get-HttpErrorDetail -ErrorRecord $_
      $message = $_.Exception.Message

      $isTransient = (
        $message -match 'underlying connection was closed|unexpected error occurred on a receive|timed out|Unable to connect'
      ) -or ($null -eq $detail.StatusCode) -or ($detail.StatusCode -ge 500)

      if (-not $isTransient -or $attempt -ge $MaxAttempts) {
        throw
      }

      $delayMs = [Math]::Min(5000, $InitialDelayMs * $attempt)
      Write-Warning "$opLabel transient failure (attempt $attempt/$MaxAttempts): $message"
      Write-Host "Retrying $opLabel in ${delayMs}ms..."
      [System.Threading.Thread]::Sleep($delayMs)
    }
  }
}

function Invoke-WebRequestWithRetry {
  param(
    [string]$Operation,
    [hashtable]$Params,
    [int]$MaxAttempts = 5,
    [int]$InitialDelayMs = 750
  )

  $opLabel = if (Test-NonEmpty $Operation) { $Operation } else { 'HTTP request' }

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      return Invoke-WebRequest @Params
    }
    catch {
      $detail = Get-HttpErrorDetail -ErrorRecord $_
      $message = $_.Exception.Message

      $isTransient = (
        $message -match 'underlying connection was closed|unexpected error occurred on a receive|timed out|Unable to connect'
      ) -or ($null -eq $detail.StatusCode) -or ($detail.StatusCode -ge 500)

      if (-not $isTransient -or $attempt -ge $MaxAttempts) {
        throw
      }

      $delayMs = [Math]::Min(5000, $InitialDelayMs * $attempt)
      Write-Warning "$opLabel transient failure (attempt $attempt/$MaxAttempts): $message"
      Write-Host "Retrying $opLabel in ${delayMs}ms..."
      [System.Threading.Thread]::Sleep($delayMs)
    }
  }
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

function Register-DualControlEngineer {
  param(
    [string]$Url,
    [string]$Email,
    [string]$Password,
    [bool]$CanIgnoreConflict
  )

  $payload = ConvertTo-JsonBody @{
    email = $Email
    password = $Password
    name = 'Dual Control Smoke Engineer'
    role = 'engineer'
  }

  try {
    $response = Invoke-WebRequestWithRetry -Operation 'Engineer bootstrap register' -Params @{
      UseBasicParsing = $true
      Uri = "$Url/api/auth/register"
      Method = 'Post'
      ContentType = 'application/json'
      Body = $payload
    }
    Write-Host "Engineer bootstrap register status: $($response.StatusCode)"
    return
  }
  catch {
    $detail = Get-HttpErrorDetail -ErrorRecord $_

    if ($CanIgnoreConflict -and $detail.StatusCode -eq 409) {
      Write-Host 'Engineer bootstrap register returned 409 (user exists); continuing.'
      return
    }

    if (-not [string]::IsNullOrWhiteSpace($detail.Body)) {
      throw "Failed to bootstrap dual-control engineer (status=$($detail.StatusCode)): $($detail.Body)"
    }

    throw "Failed to bootstrap dual-control engineer: $($_.Exception.Message)"
  }
}

function Get-EngineerLoginToken {
  param(
    [string]$Url,
    [string]$Email,
    [string]$Password
  )

  $payload = ConvertTo-JsonBody @{
    email = $Email
    password = $Password
  }

  $response = Invoke-RestMethodWithRetry -Operation 'Engineer login' -Params @{
    Uri = "$Url/api/auth/login"
    Method = 'Post'
    ContentType = 'application/json'
    Body = $payload
  }
  $token = [string]$response.token
  if (-not (Test-NonEmpty $token)) {
    throw 'Engineer login token missing for dual-control smoke run.'
  }

  return $token
}

$projectId = $null
$roomId = $null
$selectionId = $null
$itemId = $null
$authHeaders = $null

try {
  Write-Host '[1/16] Preparing engineer credentials...'
  $resolvedEmail = if (Test-NonEmpty $EngineerEmail) { $EngineerEmail } elseif (Test-NonEmpty $env:AUTH_SMOKE_EMAIL) { $env:AUTH_SMOKE_EMAIL } elseif (Test-NonEmpty $env:RBAC_ENGINEER_EMAIL) { $env:RBAC_ENGINEER_EMAIL } else { '' }
  $secretFromParam = ConvertTo-PlainText -SecureValue $EngineerPassword
  $resolvedSecret = if (Test-NonEmpty $secretFromParam) { $secretFromParam } elseif (Test-NonEmpty $env:AUTH_SMOKE_PASSWORD) { $env:AUTH_SMOKE_PASSWORD } elseif (Test-NonEmpty $env:RBAC_ENGINEER_PASSWORD) { $env:RBAC_ENGINEER_PASSWORD } else { '' }

  $generatedCredentials = $false
  if (-not (Test-NonEmpty $resolvedEmail) -or -not (Test-NonEmpty $resolvedSecret)) {
    $stamp = "$(Get-Date -Format 'yyyyMMddHHmmss')$(Get-Random -Minimum 100 -Maximum 999)"
    $resolvedEmail = "smoke.dual.$stamp@example.com"
    $resolvedSecret = "StrongPass$stamp!"
    $generatedCredentials = $true
    Write-Host "Generated temporary dual-control engineer: $resolvedEmail"
  }

  Register-DualControlEngineer -Url $BaseUrl -Email $resolvedEmail -Password $resolvedSecret -CanIgnoreConflict (-not $generatedCredentials)
  Write-Host 'PASS engineer credential bootstrap'

  Write-Host '[2/16] Logging in as engineer...'
  $engineerToken = Get-EngineerLoginToken -Url $BaseUrl -Email $resolvedEmail -Password $resolvedSecret
  $authHeaders = @{ Authorization = "Bearer $engineerToken" }
  Write-Host 'PASS engineer login'

  Write-Host '[3/16] Creating project...'
  $projectResp = Invoke-RestMethodWithRetry -Operation 'Create project' -Params @{
    Uri = "$BaseUrl/api/projects"
    Method = 'Post'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
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
    Headers = $authHeaders
  }
  $projectId = $projectResp.project.id
  Assert-True (-not [string]::IsNullOrWhiteSpace($projectId)) 'Project id missing'
  Write-Host 'PASS create project'

  Write-Host '[4/16] Adding room with cooling load...'
  $roomResp = Invoke-RestMethodWithRetry -Operation 'Create room' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/rooms"
    Method = 'Post'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
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
    Headers = $authHeaders
  }
  $roomId = $roomResp.room.id
  Assert-True ($null -ne $roomResp.room.coolingLoad) 'Cooling load not created'
  Write-Host 'PASS add room + cooling load'

  Write-Host '[5/16] Auto-sizing equipment...'
  $autoResp = Invoke-RestMethodWithRetry -Operation 'Auto-size equipment' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/equipment"
    Method = 'Post'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
      autoSize = $true
      budgetLevel = 'mid-range'
    })
    Headers = $authHeaders
  }
  Assert-True ($autoResp.results.Count -gt 0) 'No equipment results generated'
  $selectionId = $autoResp.results[0].equipment.id
  Assert-True (-not [string]::IsNullOrWhiteSpace($selectionId)) 'Equipment selection id missing'
  Write-Host 'PASS auto-size equipment'

  Write-Host '[6/16] Generating BOQ...'
  $boqResp = Invoke-RestMethodWithRetry -Operation 'Generate BOQ' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/boq"
    Method = 'Post'
    ContentType = 'application/json'
    Body = '{}'
    Headers = $authHeaders
  }
  Assert-True ($boqResp.boq.grandTotal -gt 0) 'BOQ grand total should be > 0'
  Write-Host 'PASS generate BOQ'

  Write-Host '[7/16] Capturing first BOQ item...'
  $projectGet = Invoke-RestMethodWithRetry -Operation 'Load project detail' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId"
    Method = 'Get'
    Headers = $authHeaders
  }
  Assert-True ($projectGet.project.boqItems.Count -gt 0) 'No BOQ items returned from project detail'
  $itemId = $projectGet.project.boqItems[0].id
  Assert-True (-not [string]::IsNullOrWhiteSpace($itemId)) 'BOQ item id missing'
  Write-Host 'PASS load project detail'

  Write-Host '[8/16] Saving pricing overrides...'
  $pricingResp = Invoke-RestMethodWithRetry -Operation 'Save pricing overrides' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId"
    Method = 'Put'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
      laborMultiplierOverride = 0.42
      overheadPercentOverride = 0.18
      contingencyPercentOverride = 0.07
      vatRateOverride = 0.11
    })
    Headers = $authHeaders
  }
  Assert-True ($pricingResp.project.isBoqStale -eq $true) 'Project should be BOQ stale after pricing override'
  Write-Host 'PASS pricing overrides'

  Write-Host '[9/16] Saving room load overrides...'
  $roomOverrideResp = Invoke-RestMethodWithRetry -Operation 'Save room override' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/rooms/$roomId"
    Method = 'Put'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
      userTrOverride = 2.5
      userBtuOverride = 30000
      overrideReason = 'Smoke test room override'
    })
    Headers = $authHeaders
  }
  Assert-True ($roomOverrideResp.room.coolingLoad.isOverridden -eq $true) 'Room load should be overridden'
  Write-Host 'PASS room load override'

  Write-Host '[10/16] Saving equipment overrides...'
  $equipOverrideResp = Invoke-RestMethodWithRetry -Operation 'Save equipment override' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/equipment/$selectionId"
    Method = 'Put'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
      userQuantityOverride = 2
      userUnitPriceOverride = 12345.67
      overrideReason = 'Smoke test equipment override'
    })
    Headers = $authHeaders
  }
  Assert-True ($equipOverrideResp.equipment.isOverridden -eq $true) 'Equipment should be overridden'
  Write-Host 'PASS equipment override'

  Write-Host '[11/16] Regenerating BOQ...'
  $boqRegenResp = Invoke-RestMethodWithRetry -Operation 'Regenerate BOQ' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/boq"
    Method = 'Post'
    ContentType = 'application/json'
    Body = '{}'
    Headers = $authHeaders
  }
  Assert-True ($boqRegenResp.boq.grandTotal -gt 0) 'Regenerated BOQ grand total should be > 0'
  $projectAfterRegen = Invoke-RestMethodWithRetry -Operation 'Load project after BOQ regen' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId"
    Method = 'Get'
    Headers = $authHeaders
  }
  Assert-True ($projectAfterRegen.project.boqItems.Count -gt 0) 'No BOQ items available after regeneration'
  $itemId = $projectAfterRegen.project.boqItems[0].id
  Assert-True (-not [string]::IsNullOrWhiteSpace($itemId)) 'BOQ item id missing after regeneration'
  Write-Host 'PASS regenerate BOQ'

  Write-Host '[12/16] Overriding BOQ item...'
  $boqItemOverrideResp = Invoke-RestMethodWithRetry -Operation 'Override BOQ item' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/boq/$itemId"
    Method = 'Put'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
      unitPrice = 999.99
      overrideReason = 'Smoke test BOQ override'
    })
    Headers = $authHeaders
  }
  Assert-True ($boqItemOverrideResp.item.isOverridden -eq $true) 'BOQ item should be overridden'
  Write-Host 'PASS BOQ item override'

  Write-Host '[13/16] Resetting BOQ item to suggested...'
  $boqItemResetResp = Invoke-RestMethodWithRetry -Operation 'Reset BOQ item' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/boq/$itemId"
    Method = 'Put'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
      useSuggested = $true
      userUnitPriceOverride = $null
    })
    Headers = $authHeaders
  }
  Assert-True ($boqItemResetResp.item.isOverridden -eq $false) 'BOQ item override should clear'
  Write-Host 'PASS BOQ item reset'

  Write-Host '[14/16] Resetting room load to suggested...'
  $roomResetResp = Invoke-RestMethodWithRetry -Operation 'Reset room load override' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/rooms/$roomId"
    Method = 'Put'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
      userTrOverride = $null
      userBtuOverride = $null
    })
    Headers = $authHeaders
  }
  Assert-True ($roomResetResp.room.coolingLoad.isOverridden -eq $false) 'Room load override should clear'
  Write-Host 'PASS room load reset'

  Write-Host '[15/16] Resetting equipment to suggested...'
  $equipResetResp = Invoke-RestMethodWithRetry -Operation 'Reset equipment override' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/equipment/$selectionId"
    Method = 'Put'
    ContentType = 'application/json'
    Body = (ConvertTo-JsonBody @{
      useSuggested = $true
      userQuantityOverride = $null
      userUnitPriceOverride = $null
    })
    Headers = $authHeaders
  }
  Assert-True ($equipResetResp.equipment.isOverridden -eq $false) 'Equipment override should clear'
  Write-Host 'PASS equipment reset'

  Write-Host '[16/16] Verifying pricing policy override state in BOQ GET...'
  $boqGetResp = Invoke-RestMethodWithRetry -Operation 'Get BOQ pricing policy state' -Params @{
    Uri = "$BaseUrl/api/projects/$projectId/boq"
    Method = 'Get'
    Headers = $authHeaders
  }
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
  if (-not [string]::IsNullOrWhiteSpace($projectId) -and $null -ne $authHeaders) {
    try {
      Invoke-RestMethodWithRetry -Operation 'Cleanup project delete' -Params @{
        Uri = "$BaseUrl/api/projects/${projectId}?permanent=true"
        Method = 'Delete'
        Headers = $authHeaders
      } | Out-Null
      Write-Host 'Cleanup complete: test project deleted'
    }
    catch {
      Write-Warning "Cleanup failed for project $projectId"
    }
  }
}
