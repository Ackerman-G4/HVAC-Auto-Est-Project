param(
  [string]$ProjectId = 'demo-hvac-auto',
  [int]$AppPort = 3000,
  [int]$FirestorePort = 9080,
  [string]$JavaHome,
  [switch]$NoTurbo,
  [switch]$ReuseRunningEmulator,
  [switch]$ReuseRunningApp
)

$ErrorActionPreference = 'Stop'
$script:StartedEmulator = $false
$script:EmulatorProcess = $null
$script:EmulatorOutLog = $null
$script:EmulatorErrLog = $null

function Write-Info {
  param([string]$Message)
  Write-Host "[info] $Message" -ForegroundColor Cyan
}

function Write-WarnMsg {
  param([string]$Message)
  Write-Host "[warn] $Message" -ForegroundColor Yellow
}

function Write-ErrorMsg {
  param([string]$Message)
  Write-Host "[error] $Message" -ForegroundColor Red
}

function Assert-Command {
  param([string]$Name)
  if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not available in PATH"
  }
}

function Use-JavaHome {
  param([string]$Candidate)

  if ([string]::IsNullOrWhiteSpace($Candidate)) {
    return $false
  }

  if (-not (Test-Path $Candidate)) {
    return $false
  }

  $javaExe = Join-Path $Candidate 'bin\java.exe'
  if (-not (Test-Path $javaExe)) {
    return $false
  }

  $env:JAVA_HOME = $Candidate
  if ($env:Path -notlike "$Candidate\\bin*") {
    $env:Path = "$Candidate\bin;$env:Path"
  }

  return $true
}

function Ensure-Java {
  param([string]$PreferredJavaHome)

  if ($null -ne (Get-Command java -ErrorAction SilentlyContinue)) {
    return
  }

  if (Use-JavaHome -Candidate $PreferredJavaHome) {
    Write-Info "JAVA_HOME set to $($env:JAVA_HOME)"
    return
  }

  if (Use-JavaHome -Candidate $env:JAVA_HOME) {
    Write-Info "JAVA_HOME set to $($env:JAVA_HOME)"
    return
  }

  $candidateHomes = New-Object System.Collections.Generic.List[string]
  $candidateHomes.Add('C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot') | Out-Null

  if (Test-Path 'C:\Program Files\Microsoft') {
    Get-ChildItem -Path 'C:\Program Files\Microsoft' -Directory -Filter 'jdk*' -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { $candidateHomes.Add($_.FullName) | Out-Null }
  }

  if (Test-Path 'C:\Program Files\Java') {
    Get-ChildItem -Path 'C:\Program Files\Java' -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { $candidateHomes.Add($_.FullName) | Out-Null }
  }

  foreach ($candidate in ($candidateHomes | Select-Object -Unique)) {
    if (Use-JavaHome -Candidate $candidate) {
      Write-Info "JAVA_HOME auto-detected: $($env:JAVA_HOME)"
      return
    }
  }

  throw "Java runtime was not found. Install a JDK or rerun with -JavaHome 'C:\\path\\to\\jdk'."
}

function Get-PortOwner {
  param([int]$Port)
  try {
    return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -First 1
  }
  catch {
    return $null
  }
}

function Get-ProcessDescription {
  param([int]$ProcessId)

  $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  if ($null -ne $cim) {
    if ([string]::IsNullOrWhiteSpace($cim.CommandLine)) {
      return "$($cim.Name) (PID $ProcessId)"
    }
    return "$($cim.Name) (PID $ProcessId) command: $($cim.CommandLine)"
  }

  $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($null -ne $proc) {
    return "$($proc.ProcessName) (PID $ProcessId)"
  }

  return "PID $ProcessId"
}

function Wait-PortListening {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 30
  )

  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    if ($null -ne (Get-PortOwner -Port $Port)) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Get-WorkspaceNextDevProcess {
  param([string]$WorkspacePath)

  $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  if ($null -eq $processes) {
    return $null
  }

  $match = $processes | Where-Object {
    ($_.CommandLine -like '*next\dist\server\lib\start-server.js*') -and
    ($_.CommandLine -like "*$WorkspacePath*")
  } | Select-Object -First 1

  return $match
}

function Stop-StartedEmulator {
  if (-not $script:StartedEmulator) {
    return
  }

  if ($null -eq $script:EmulatorProcess) {
    return
  }

  if (-not $script:EmulatorProcess.HasExited) {
    Stop-Process -Id $script:EmulatorProcess.Id -Force -ErrorAction SilentlyContinue
    Write-Info "Stopped Firestore emulator process (PID $($script:EmulatorProcess.Id))"
  }
}

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $workspaceRoot

try {
  Write-Info 'Running local stack preflight checks'
  Assert-Command -Name 'node'
  Assert-Command -Name 'npm'
  Assert-Command -Name 'npx'

  $runningNext = Get-WorkspaceNextDevProcess -WorkspacePath $workspaceRoot
  $reuseApp = $false
  $reusedNextProcessId = $null
  if ($null -ne $runningNext) {
    if ($ReuseRunningApp) {
      $reuseApp = $true
      $reusedNextProcessId = [int]$runningNext.ProcessId
      Write-WarnMsg "A Next.js dev server is already running for this workspace (PID $reusedNextProcessId). Reusing it because -ReuseRunningApp was provided."
    }
    else {
      throw "A Next.js dev server is already running for this workspace (PID $($runningNext.ProcessId)). Stop it and retry, or run with -ReuseRunningApp. Example: taskkill /PID $($runningNext.ProcessId) /F"
    }
  }

  $appOwner = Get-PortOwner -Port $AppPort
  if ($null -ne $appOwner) {
    if ($reuseApp -and ([int]$appOwner.OwningProcess -eq $reusedNextProcessId)) {
      Write-WarnMsg "App port $AppPort is already in use by the reused Next.js process (PID $reusedNextProcessId)."
    }
    else {
      $desc = Get-ProcessDescription -ProcessId $appOwner.OwningProcess
      throw "App port $AppPort is already in use by $desc. Stop that process and retry. Example: taskkill /PID $($appOwner.OwningProcess) /F"
    }
  }
  elseif ($reuseApp) {
    throw "A Next.js process was detected (PID $reusedNextProcessId) but app port $AppPort is not listening. Stop stale process and retry."
  }

  $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:$FirestorePort"
  $env:FIREBASE_PROJECT_ID = $ProjectId
  $env:GCLOUD_PROJECT = $ProjectId

  Write-Info "Using FIRESTORE_EMULATOR_HOST=$($env:FIRESTORE_EMULATOR_HOST)"
  Write-Info "Using FIREBASE_PROJECT_ID=$($env:FIREBASE_PROJECT_ID)"
  Write-Info "Using GCLOUD_PROJECT=$($env:GCLOUD_PROJECT)"

  $firestoreOwner = Get-PortOwner -Port $FirestorePort
  $reuseEmulator = $false
  if ($null -ne $firestoreOwner) {
    $desc = Get-ProcessDescription -ProcessId $firestoreOwner.OwningProcess
    if ($ReuseRunningEmulator -or $reuseApp) {
      $reuseEmulator = $true
      $reason = if ($ReuseRunningEmulator) { '-ReuseRunningEmulator was provided' } else { 'an existing app process is being reused' }
      Write-WarnMsg "Firestore port $FirestorePort is already in use. Reusing existing process: $desc ($reason)."
    }
    else {
      throw "Firestore port $FirestorePort is already in use by $desc. Stop it and retry, or run with -ReuseRunningEmulator if this is your existing emulator instance."
    }
  }

  if (-not $reuseEmulator) {
    Ensure-Java -PreferredJavaHome $JavaHome

    $logDir = Join-Path $workspaceRoot '.logs'
    if (-not (Test-Path $logDir)) {
      New-Item -Path $logDir -ItemType Directory | Out-Null
    }

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $script:EmulatorOutLog = Join-Path $logDir "firestore-emulator-$timestamp.out.log"
    $script:EmulatorErrLog = Join-Path $logDir "firestore-emulator-$timestamp.err.log"

    $emulatorCommand = "Set-Location '$workspaceRoot'; npx firebase-tools emulators:start --only firestore --project $ProjectId --config firebase.json"
    $script:EmulatorProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $emulatorCommand -PassThru -RedirectStandardOutput $script:EmulatorOutLog -RedirectStandardError $script:EmulatorErrLog
    $script:StartedEmulator = $true

    Write-Info "Started Firestore emulator (PID $($script:EmulatorProcess.Id)). Waiting for port $FirestorePort"
    if (-not (Wait-PortListening -Port $FirestorePort -TimeoutSeconds 30)) {
      Stop-StartedEmulator
      throw "Firestore emulator did not become ready on port $FirestorePort within 30 seconds. Check logs: $($script:EmulatorOutLog) and $($script:EmulatorErrLog)"
    }

    Write-Info "Firestore emulator is listening on port $FirestorePort"
  }

  if ($reuseApp) {
    Write-Info "Local stack checks passed. Waiting on reused Next.js process (PID $reusedNextProcessId). Press Ctrl+C to stop waiting."
    try {
      Wait-Process -Id $reusedNextProcessId -ErrorAction Stop
    }
    catch {
      Write-WarnMsg "Reused Next.js process (PID $reusedNextProcessId) is no longer running."
    }
    exit 0
  }

  $devScript = if ($NoTurbo) { 'dev:no-turbo' } else { 'dev' }
  Write-Info "Starting Next.js: npm run $devScript -- --port $AppPort"

  & npm run $devScript -- --port $AppPort
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Next.js dev server exited with code $exitCode"
  }
}
catch {
  Write-ErrorMsg $_.Exception.Message
  exit 1
}
finally {
  Stop-StartedEmulator
}
