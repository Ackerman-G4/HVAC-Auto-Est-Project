param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [string]$EngineerEmail = '',
  [SecureString]$EngineerPassword,
  [switch]$KeepProject
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

function Invoke-RestJson {
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

function Assert-RequestReturnsStatus {
  param(
    [string]$Uri,
    [hashtable]$Headers,
    [int]$ExpectedStatus,
    [string]$Label
  )

  try {
    Invoke-WebRequest -UseBasicParsing -Uri $Uri -Method Get -Headers $Headers | Out-Null
    throw "Expected status $ExpectedStatus for $Label but request succeeded."
  }
  catch {
    $detail = Get-HttpErrorDetail -ErrorRecord $_
    Assert-True ($detail.StatusCode -eq $ExpectedStatus) "$Label expected status $ExpectedStatus but got $($detail.StatusCode)"
  }
}

function Register-SnapshotSmokeEngineer {
  param(
    [string]$Url,
    [string]$Email,
    [string]$Password,
    [bool]$CanIgnoreConflict
  )

  $payload = ConvertTo-JsonBody @{
    email = $Email
    password = $Password
    name = 'Snapshot Playback Smoke Engineer'
    role = 'engineer'
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/auth/register" -Method Post -ContentType 'application/json' -Body $payload
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
      throw "Failed to bootstrap snapshot playback engineer (status=$($detail.StatusCode)): $($detail.Body)"
    }

    throw "Failed to bootstrap snapshot playback engineer: $($_.Exception.Message)"
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

  $response = Invoke-RestJson -Uri "$Url/api/auth/login" -Method Post -ContentType 'application/json' -Body $payload
  $token = [string]$response.token
  if (-not (Test-NonEmpty $token)) {
    throw 'Engineer login token missing for snapshot playback smoke run.'
  }

  return $token
}

$projectId = $null
$simId = $null
$runId1 = $null
$runId2 = $null
$authHeaders = $null

try {
  Write-Host '[1/12] Preparing engineer credentials...'
  $resolvedEmail = if (Test-NonEmpty $EngineerEmail) { $EngineerEmail } elseif (Test-NonEmpty $env:AUTH_SMOKE_EMAIL) { $env:AUTH_SMOKE_EMAIL } elseif (Test-NonEmpty $env:RBAC_ENGINEER_EMAIL) { $env:RBAC_ENGINEER_EMAIL } else { '' }
  $secretFromParam = ConvertTo-PlainText -SecureValue $EngineerPassword
  $resolvedSecret = if (Test-NonEmpty $secretFromParam) { $secretFromParam } elseif (Test-NonEmpty $env:AUTH_SMOKE_PASSWORD) { $env:AUTH_SMOKE_PASSWORD } elseif (Test-NonEmpty $env:RBAC_ENGINEER_PASSWORD) { $env:RBAC_ENGINEER_PASSWORD } else { '' }

  $generatedCredentials = $false
  if (-not (Test-NonEmpty $resolvedEmail) -or -not (Test-NonEmpty $resolvedSecret)) {
    $stamp = "$(Get-Date -Format 'yyyyMMddHHmmss')$(Get-Random -Minimum 100 -Maximum 999)"
    $resolvedEmail = "smoke.snapshot.$stamp@example.com"
    $resolvedSecret = "StrongPass$stamp!"
    $generatedCredentials = $true
    Write-Host "Generated temporary snapshot playback engineer: $resolvedEmail"
  }

  Register-SnapshotSmokeEngineer -Url $BaseUrl -Email $resolvedEmail -Password $resolvedSecret -CanIgnoreConflict (-not $generatedCredentials)
  $engineerToken = Get-EngineerLoginToken -Url $BaseUrl -Email $resolvedEmail -Password $resolvedSecret
  $authHeaders = @{ Authorization = "Bearer $engineerToken" }
  Write-Host 'PASS engineer bootstrap/login'

  Write-Host '[2/12] Creating project...'
  $projectResp = Invoke-RestJson -Uri "$BaseUrl/api/projects" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    name = "Smoke Snapshot Playback $(Get-Date -Format 'yyyyMMddHHmmss')"
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
  $projectId = [string]$projectResp.project.id
  Assert-True (Test-NonEmpty $projectId) 'Project id missing.'
  Write-Host 'PASS create project'

  Write-Host '[3/12] Creating room-scope simulation case...'
  $simCaseResp = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    name = 'Smoke Snapshot Case'
    runSource = 'internal'
    geometry = @{
      roomId = 'snapshot-smoke-room'
      lengthM = 6
      widthM = 4
      heightM = 3
      raisedFloorHeightM = 0
      ceilingPlenumHeightM = 0
      walls = @()
      hvacUnits = @(
        @{
          id = 'hvac-1'
          type = 'crac'
          name = 'Smoke CRAC'
          position = @{ x = 0.4; y = 0.4; z = 0 }
          width = 0.8
          depth = 0.8
          height = 2.0
          capacityKW = 12
          capacityTR = 3.4
          airflowCFM = 1200
          supplyTempC = 17
          returnTempC = 24
          orientation = 0
          powerInputKW = 3.2
          status = 'active'
        }
      )
      racks = @(
        @{
          id = 'rack-1'
          name = 'Rack 1'
          position = @{ x = 2.2; y = 1.8; z = 0 }
          width = 0.6
          depth = 1.0
          height = 2.0
          powerDensity = 'medium'
          powerKW = 6
          airflowCFM = 900
          orientation = 0
          rackUnits = 42
          filledUnits = 36
        }
      )
      tiles = @(
        @{
          x = 2
          y = 2
          openArea = 0.25
          tileSize = 0.6
        }
      )
      obstructions = @()
    }
    solver = @{
      algorithm = 'SIMPLE'
      maxIterations = 30
      convergenceTarget = 0.001
      relaxation = @{
        pressure = 0.3
        velocity = 0.7
        temperature = 0.8
        turbulence = 0.5
      }
      timeStepS = 0
      maxCFL = 1.0
      adaptiveTimeStep = $true
    }
  })

  $simId = [string]$simCaseResp.case.id
  Assert-True (Test-NonEmpty $simId) 'Simulation case id missing.'
  Assert-True ($simCaseResp.case.simulationScope -eq 'room') 'Expected room-scope simulation case.'
  Write-Host 'PASS create simulation case'

  Write-Host '[4/12] Starting internal run #1...'
  $run1Resp = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/run" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    source = 'internal'
  })
  $runId1 = [string]$run1Resp.run.id
  Assert-True (Test-NonEmpty $runId1) 'Run #1 id missing.'
  Assert-True ($run1Resp.run.status -eq 'completed') "Expected run #1 to complete, got '$($run1Resp.run.status)'."
  Write-Host 'PASS run #1 completed'

  Write-Host '[5/12] Validating run history includes run #1...'
  $runsResp = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs?limit=10" -Method Get -Headers $authHeaders
  Assert-True (($runsResp.runs.Count) -ge 1) 'Expected at least one run in history.'
  $run1FromHistory = $runsResp.runs | Where-Object { $_.id -eq $runId1 } | Select-Object -First 1
  Assert-True ($null -ne $run1FromHistory) 'Run #1 not found in run history.'
  Write-Host 'PASS run history lookup'

  Write-Host '[6/12] Listing snapshots for run #1...'
  $snapshotsRun1Resp = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs/$runId1/snapshots?limit=50" -Method Get -Headers $authHeaders
  Assert-True (($snapshotsRun1Resp.snapshots.Count) -ge 1) 'Expected at least one snapshot for run #1.'
  $latestRun1Snapshot = $snapshotsRun1Resp.snapshots | Select-Object -Last 1
  $run1Iteration = [int]$latestRun1Snapshot.iteration
  Assert-True ($run1Iteration -gt 0) 'Snapshot iteration should be positive.'
  Assert-True ($latestRun1Snapshot.availableFields -contains 'temperature') 'Snapshot meta missing temperature field.'
  Assert-True ($latestRun1Snapshot.availableFields -contains 'velocity') 'Snapshot meta missing velocity field.'
  Write-Host "PASS run #1 snapshot list (iteration $run1Iteration)"

  Write-Host '[7/12] Fetching partial snapshot fields (temperature, velocity)...'
  $partialSnapshotResp = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs/$runId1/snapshots/$run1Iteration?fields=temperature,velocity" -Method Get -Headers $authHeaders
  Assert-True (($partialSnapshotResp.snapshot.fields.Count) -eq 2) 'Expected exactly two fields from partial snapshot request.'
  $partialFieldNames = @($partialSnapshotResp.snapshot.fields | ForEach-Object { [string]$_.name })
  Assert-True ($partialFieldNames -contains 'temperature') 'Partial snapshot response missing temperature field.'
  Assert-True ($partialFieldNames -contains 'velocity') 'Partial snapshot response missing velocity field.'
  Write-Host 'PASS partial snapshot field fetch'

  Write-Host '[8/12] Fetching full snapshot and single pressure field...'
  $fullSnapshotResp = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs/$runId1/snapshots/$run1Iteration" -Method Get -Headers $authHeaders
  Assert-True (($fullSnapshotResp.snapshot.fields.Count) -ge 4) 'Expected full snapshot to include all persisted fields.'

  $pressureFieldResp = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs/$runId1/snapshots/$run1Iteration/fields/pressure" -Method Get -Headers $authHeaders
  Assert-True ($pressureFieldResp.field.name -eq 'pressure') 'Expected pressure field payload.'
  Assert-True ([int]$pressureFieldResp.meta.iteration -eq $run1Iteration) 'Single-field response iteration mismatch.'
  Write-Host 'PASS full/single-field snapshot fetch'

  Write-Host '[9/12] Verifying invalid request handling on snapshot APIs...'
  Assert-RequestReturnsStatus -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs/$runId1/snapshots/0" -Headers $authHeaders -ExpectedStatus 400 -Label 'invalid snapshot iteration'
  Assert-RequestReturnsStatus -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs/$runId1/snapshots/$run1Iteration/fields/notAField" -Headers $authHeaders -ExpectedStatus 400 -Label 'invalid snapshot field name'
  Write-Host 'PASS invalid snapshot request handling'

  Write-Host '[10/12] Starting internal run #2 to validate run switching...'
  $run2Resp = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/run" -Method Post -ContentType 'application/json' -Headers $authHeaders -Body (ConvertTo-JsonBody @{
    source = 'internal'
  })
  $runId2 = [string]$run2Resp.run.id
  Assert-True (Test-NonEmpty $runId2) 'Run #2 id missing.'
  Assert-True ($runId2 -ne $runId1) 'Run #2 id should differ from run #1.'
  Assert-True ($run2Resp.run.status -eq 'completed') "Expected run #2 to complete, got '$($run2Resp.run.status)'."
  Write-Host 'PASS run #2 completed'

  Write-Host '[11/12] Verifying snapshots are accessible per run id...'
  $snapshotsRun2Resp = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs/$runId2/snapshots?limit=50" -Method Get -Headers $authHeaders
  Assert-True (($snapshotsRun2Resp.snapshots.Count) -ge 1) 'Expected at least one snapshot for run #2.'

  $run1SnapshotsAgain = Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId/simulations/$simId/runs/$runId1/snapshots?limit=50" -Method Get -Headers $authHeaders
  Assert-True (($run1SnapshotsAgain.snapshots.Count) -ge 1) 'Expected run #1 snapshots to remain available.'
  Write-Host 'PASS run-specific snapshot access'

  Write-Host '[12/12] Snapshot playback API smoke flow completed successfully.'
  Write-Host ''
  Write-Host 'SNAPSHOT PLAYBACK SMOKE: ALL CHECKS PASSED'
  exit 0
}
catch {
  $detail = Get-HttpErrorDetail -ErrorRecord $_
  $message = $_.Exception.Message

  Write-Host ''
  Write-Host "SNAPSHOT PLAYBACK SMOKE FAILED: $message"

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
      Invoke-RestJson -Uri "$BaseUrl/api/projects/$projectId" -Method Delete -Headers $authHeaders | Out-Null
      Write-Host "Cleanup: deleted smoke project $projectId"
    }
    catch {
      Write-Warning "Cleanup failed for project $projectId: $($_.Exception.Message)"
    }
  }
}
