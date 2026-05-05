param(
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$EngineerEmail = '',
  [SecureString]$EngineerPassword,
  [switch]$KeepProject
)

$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['Invoke-WebRequest:DisableKeepAlive'] = $true

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
  return ($Object | ConvertTo-Json -Depth 16)
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

function Invoke-RestMethod {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Uri,
    [string]$Method = 'Get',
    [string]$ContentType,
    [object]$Body,
    [hashtable]$Headers
  )

  $maxAttempts = 5
  $initialDelayMs = 750

  $invokeArgs = @{
    Uri = $Uri
    Method = $Method
  }

  if ($null -ne $Headers) {
    $invokeArgs['Headers'] = $Headers
  }

  if ($PSBoundParameters.ContainsKey('ContentType')) {
    $invokeArgs['ContentType'] = $ContentType
  }

  if ($PSBoundParameters.ContainsKey('Body')) {
    $invokeArgs['Body'] = $Body
  }

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
      return Microsoft.PowerShell.Utility\Invoke-RestMethod @invokeArgs
    }
    catch {
      $detail = Get-HttpErrorDetail -ErrorRecord $_
      $message = $_.Exception.Message

      $isTransient = (
        $message -match 'underlying connection was closed|unexpected error occurred on a receive|timed out|Unable to connect'
      ) -or ($null -eq $detail.StatusCode) -or ($detail.StatusCode -ge 500)

      if (-not $isTransient -or $attempt -ge $maxAttempts) {
        throw
      }

      $delayMs = [Math]::Min(5000, $initialDelayMs * $attempt)
      Write-Warning "HTTP request transient failure (attempt $attempt/$maxAttempts): $message"
      Write-Host "Retrying HTTP request in ${delayMs}ms..."
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

function Register-BuildingSmokeEngineer {
  param(
    [string]$Url,
    [string]$Email,
    [string]$Password,
    [bool]$CanIgnoreConflict
  )

  $payload = ConvertTo-JsonBody @{
    email = $Email
    password = $Password
    name = 'Building Smoke Engineer'
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
      throw "Failed to bootstrap building smoke engineer (status=$($detail.StatusCode)): $($detail.Body)"
    }

    throw "Failed to bootstrap building smoke engineer: $($_.Exception.Message)"
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

  $response = Invoke-RestMethod -Uri "$Url/api/auth/login" -Method Post -ContentType 'application/json' -Body $payload
  $token = [string]$response.token
  if (-not (Test-NonEmpty $token)) {
    throw 'Engineer login token missing for building smoke run.'
  }

  return $token
}

function Get-Connection {
  param(
    [object[]]$Connections,
    [string]$RoomA,
    [string]$RoomB
  )

  return $Connections | Where-Object {
    ($_.fromRoom -eq $RoomA -and $_.toRoom -eq $RoomB) -or ($_.fromRoom -eq $RoomB -and $_.toRoom -eq $RoomA)
  } | Select-Object -First 1
}

$projectId = $null
$simId = $null
$authHeaders = $null

try {
  Write-Host '[1/13] Preparing engineer credentials...'
  $resolvedEmail = if (Test-NonEmpty $EngineerEmail) { $EngineerEmail } elseif (Test-NonEmpty $env:AUTH_SMOKE_EMAIL) { $env:AUTH_SMOKE_EMAIL } elseif (Test-NonEmpty $env:RBAC_ENGINEER_EMAIL) { $env:RBAC_ENGINEER_EMAIL } else { '' }
  $secretFromParam = ConvertTo-PlainText -SecureValue $EngineerPassword
  $resolvedSecret = if (Test-NonEmpty $secretFromParam) { $secretFromParam } elseif (Test-NonEmpty $env:AUTH_SMOKE_PASSWORD) { $env:AUTH_SMOKE_PASSWORD } elseif (Test-NonEmpty $env:RBAC_ENGINEER_PASSWORD) { $env:RBAC_ENGINEER_PASSWORD } else { '' }

  $generatedCredentials = $false
  if (-not (Test-NonEmpty $resolvedEmail) -or -not (Test-NonEmpty $resolvedSecret)) {
    $stamp = "$(Get-Date -Format 'yyyyMMddHHmmss')$(Get-Random -Minimum 100 -Maximum 999)"
    $resolvedEmail = "smoke.building.$stamp@example.com"
    $resolvedSecret = "StrongPass$stamp!"
    $generatedCredentials = $true
    Write-Host "Generated temporary building smoke engineer: $resolvedEmail"
  }

  Register-BuildingSmokeEngineer -Url $BaseUrl -Email $resolvedEmail -Password $resolvedSecret -CanIgnoreConflict (-not $generatedCredentials)
  $engineerToken = Get-EngineerLoginToken -Url $BaseUrl -Email $resolvedEmail -Password $resolvedSecret
  $authHeaders = @{ Authorization = "Bearer $engineerToken" }
  Write-Host 'PASS engineer bootstrap/login'

  Write-Host '[2/13] Creating project...'
  $projectResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    name = "Smoke Building Sim $(Get-Date -Format 'yyyyMMddHHmmss')"
    clientName = 'Smoke Client'
    buildingType = 'office'
    location = 'Quezon City'
    city = 'Manila'
    totalFloorArea = 260
    outdoorDB = 35
    outdoorRH = 55
    indoorDB = 24
    indoorRH = 50
  })
  $projectId = [string]$projectResp.project.id
  Assert-True (Test-NonEmpty $projectId) 'Project id missing.'
  Write-Host 'PASS create project'

  Write-Host '[3/13] Creating floors...'
  $floor1 = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/floors" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    floorNumber = 1
    name = 'Floor 1'
    ceilingHeight = 3.0
    scale = 50
  })
  $floor2 = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/floors" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    floorNumber = 2
    name = 'Floor 2'
    ceilingHeight = 3.0
    scale = 50
  })
  $floor1Id = [string]$floor1.floor.id
  $floor2Id = [string]$floor2.floor.id
  Assert-True (Test-NonEmpty $floor1Id) 'Floor 1 id missing.'
  Assert-True (Test-NonEmpty $floor2Id) 'Floor 2 id missing.'
  Write-Host 'PASS create floors'

  Write-Host '[4/13] Creating rooms for building geometry...'
  $roomAResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/rooms" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    name = 'Room A'
    floorNumber = 1
    spaceType = 'office'
    area = 60
    perimeter = 32
    ceilingHeight = 3.0
    equipmentLoad = 4500
    occupantCount = 4
    polygon = @{ x = 0; y = 0; width = 500; height = 300; scale = 50 }
  })
  $roomBResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/rooms" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    name = 'Room B'
    floorNumber = 1
    spaceType = 'office'
    area = 60
    perimeter = 32
    ceilingHeight = 3.0
    equipmentLoad = 3200
    occupantCount = 3
    polygon = @{ x = 500; y = 0; width = 500; height = 300; scale = 50 }
  })
  $roomCResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/rooms" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    name = 'Room C'
    floorNumber = 2
    spaceType = 'office'
    area = 50
    perimeter = 30
    ceilingHeight = 3.0
    equipmentLoad = 2800
    occupantCount = 2
    polygon = @{ x = 0; y = 0; width = 500; height = 300; scale = 50 }
  })

  $roomAId = [string]$roomAResp.room.id
  $roomBId = [string]$roomBResp.room.id
  $roomCId = [string]$roomCResp.room.id
  Assert-True (Test-NonEmpty $roomAId) 'Room A id missing.'
  Assert-True (Test-NonEmpty $roomBId) 'Room B id missing.'
  Assert-True (Test-NonEmpty $roomCId) 'Room C id missing.'
  Write-Host 'PASS create rooms'

  Write-Host '[5/13] Saving connection override on floor 1...'
  Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulation-layout" -Method Put -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    floorId = $floor1Id
    hvacPlacements = @()
    tilePlacements = @()
    connectionOverrides = @(
      @{
        id = "override-$roomAId-$roomBId"
        fromRoomId = $roomAId
        toRoomId = $roomBId
        type = 'duct'
        openingAreaM2 = 1.8
        resistance = 0.75
        enabled = $true
      }
    )
    canvasScale = 50
  }) | Out-Null
  Write-Host 'PASS save connection override'

  Write-Host '[6/13] Creating building simulation case...'
  try {
    $simCaseResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulations" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
      name = 'Smoke Building Case'
      simulationScope = 'building'
      runSource = 'internal'
    })
  }
  catch {
    $detail = Get-HttpErrorDetail -ErrorRecord $_
    if ($detail.StatusCode -eq 403 -and $detail.Body -like '*BUILDING_MODE_DISABLED*') {
      throw 'Building simulation mode is disabled. Enable ENABLE_BUILDING_SIMULATION (and NEXT_PUBLIC_ENABLE_BUILDING_SIMULATION for UI) and rerun this smoke test.'
    }
    throw
  }

  $simId = [string]$simCaseResp.case.id
  Assert-True (Test-NonEmpty $simId) 'Simulation case id missing.'
  Assert-True ($simCaseResp.case.simulationScope -eq 'building') 'Simulation scope should be building.'
  Assert-True (($simCaseResp.case.buildingGeometry.rooms.Count) -ge 3) 'Expected at least 3 building rooms.'
  $overrideConnection = Get-Connection -Connections $simCaseResp.case.buildingGeometry.connections -RoomA $roomAId -RoomB $roomBId
  Assert-True ($null -ne $overrideConnection) 'Expected connection between Room A and Room B.'
  Assert-True ($overrideConnection.type -eq 'duct') 'Expected Room A/B connection type to follow override (duct).'
  Write-Host 'PASS create building case'

  Write-Host '[7/13] Running internal building simulation...'
  $runStartResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/run" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    source = 'internal'
  })
  Assert-True ($null -ne $runStartResp.run) 'Run payload missing in run response.'
  Assert-True ($runStartResp.run.status -eq 'completed') "Expected run status 'completed', got '$($runStartResp.run.status)'."
  Assert-True ($null -ne $runStartResp.run.buildingVisualization) 'Expected building visualization payload.'
  Assert-True ($null -ne $runStartResp.run.metricsSnapshot) 'Expected run metrics snapshot payload.'
  Assert-True ($runStartResp.run.metricsSnapshot.roomMetrics.Count -ge 1) 'Expected room-level metrics in metrics snapshot.'
  Write-Host 'PASS run building simulation'

  Write-Host '[8/13] Verifying run history payloads...'
  $runsResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs?limit=5" -Method Get -Headers $authHeaders
  Assert-True (($runsResp.runs.Count) -ge 1) 'Expected at least one run in timeline.'
  $latestRun = $runsResp.runs[0]
  Assert-True ($null -ne $latestRun.metricsSnapshot) 'Run timeline missing metricsSnapshot.'
  Assert-True ($null -ne $latestRun.buildingVisualization) 'Run timeline missing buildingVisualization.'
  Assert-True ($latestRun.metricsSnapshot.airflowBalanceM3s -ne $null) 'Expected airflowBalanceM3s in run metrics snapshot.'
  Assert-True ($latestRun.metricsSnapshot.pressureImbalancePa -ne $null) 'Expected pressureImbalancePa in run metrics snapshot.'
  Assert-True ($latestRun.metricsSnapshot.ventilationEffectiveness -ne $null) 'Expected ventilationEffectiveness in run metrics snapshot.'
  Write-Host 'PASS verify run timeline payloads'

  Write-Host '[9/13] Disabling override and rebuilding case geometry...'
  Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulation-layout" -Method Put -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    floorId = $floor1Id
    hvacPlacements = @()
    tilePlacements = @()
    connectionOverrides = @(
      @{
        id = "override-$roomAId-$roomBId"
        fromRoomId = $roomAId
        toRoomId = $roomBId
        type = 'duct'
        openingAreaM2 = 1.8
        resistance = 0.75
        enabled = $false
      }
    )
    canvasScale = 50
  }) | Out-Null

  $rebuiltCaseResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId" -Method Put -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    rebuildBuildingGeometryFromProject = $true
  })

  Assert-True ($rebuiltCaseResp.case.simulationScope -eq 'building') 'Case scope changed unexpectedly after rebuild.'
  $rebuiltConnection = Get-Connection -Connections $rebuiltCaseResp.case.buildingGeometry.connections -RoomA $roomAId -RoomB $roomBId
  Assert-True ($null -eq $rebuiltConnection) 'Expected Room A/B connection to be removed after disabling override.'
  Write-Host 'PASS rebuild after override disable'

  Write-Host '[10/13] Re-enabling override and rebuilding again...'
  Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulation-layout" -Method Put -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    floorId = $floor1Id
    hvacPlacements = @()
    tilePlacements = @()
    connectionOverrides = @(
      @{
        id = "override-$roomAId-$roomBId"
        fromRoomId = $roomAId
        toRoomId = $roomBId
        type = 'duct'
        openingAreaM2 = 1.8
        resistance = 0.75
        enabled = $true
      }
    )
    canvasScale = 50
  }) | Out-Null

  $rebuiltCaseEnabledResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId" -Method Put -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    rebuildBuildingGeometryFromProject = $true
  })
  $reEnabledConnection = Get-Connection -Connections $rebuiltCaseEnabledResp.case.buildingGeometry.connections -RoomA $roomAId -RoomB $roomBId
  Assert-True ($null -ne $reEnabledConnection) 'Expected Room A/B connection after re-enabling override.'
  Assert-True ($reEnabledConnection.type -eq 'duct') 'Expected Room A/B connection type duct after re-enable.'
  Write-Host 'PASS rebuild after override re-enable'

  Write-Host '[11/13] Exporting OpenFOAM case package...'
  $exportResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/export" -Method Get -Headers $authHeaders
  Assert-True (Test-NonEmpty ([string]$exportResp.caseName)) 'OpenFOAM export caseName missing.'
  Assert-True ($null -ne $exportResp.files) 'OpenFOAM export files payload missing.'
  $fileKeys = @($exportResp.files.PSObject.Properties.Name)
  Assert-True ($fileKeys.Count -ge 5) 'OpenFOAM export should include multiple files.'
  Assert-True ($fileKeys -contains 'system/controlDict') 'OpenFOAM export missing system/controlDict.'
  Write-Host 'PASS OpenFOAM export validation'

  Write-Host '[12/13] Verifying active run status endpoint...'
  $runStatusResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/run" -Method Get -Headers $authHeaders
  Assert-True ($null -ne $runStatusResp.run) 'Expected active run payload from status endpoint.'
  Assert-True ($runStatusResp.run.status -eq 'completed') 'Expected completed status from run status endpoint.'
  Write-Host 'PASS run status endpoint'

  Write-Host '[13/13] Smoke flow completed successfully.'
  Write-Host ''
  Write-Host 'BUILDING SIMULATION SMOKE: ALL CHECKS PASSED'
  exit 0
}
catch {
  $detail = Get-HttpErrorDetail -ErrorRecord $_
  $message = $_.Exception.Message

  Write-Host ''
  Write-Host "BUILDING SIMULATION SMOKE FAILED: $message"

  if ($null -ne $detail.StatusCode) {
    Write-Host "HTTP status: $($detail.StatusCode)"
  }
  if (Test-NonEmpty $detail.Body) {
    Write-Host 'HTTP body:'
    Write-Host $detail.Body
  }

  exit 1
}
finally {
  if (-not $KeepProject -and (Test-NonEmpty $projectId) -and $null -ne $authHeaders) {
    try {
      Invoke-RestMethod -Uri "$BaseUrl/api/projects/$projectId" -Method Delete -Headers $authHeaders | Out-Null
      Write-Host "Cleanup: deleted smoke project $projectId"
    }
    catch {
      Write-Host "Cleanup warning: failed to delete smoke project $projectId"
    }
  }
}
