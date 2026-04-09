param(
  [int]$AppPort = 3000,
  [switch]$NoTurbo,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = 'Stop'

function Write-Info {
  param([string]$Message)
  Write-Host "[info] $Message" -ForegroundColor Cyan
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

function Resolve-AppPort {
  param(
    [int]$DefaultPort,
    [string[]]$Args
  )

  $resolved = $DefaultPort

  for ($index = 0; $index -lt $Args.Count; $index++) {
    $arg = [string]$Args[$index]

    if ($arg -eq '--port' -or $arg -eq '-p') {
      if ($index + 1 -ge $Args.Count) {
        throw 'Missing value after --port.'
      }

      $candidate = 0
      if (-not [int]::TryParse([string]$Args[$index + 1], [ref]$candidate)) {
        throw "Invalid --port value: $($Args[$index + 1])"
      }

      $resolved = $candidate
      $index++
      continue
    }

    if ($arg -match '^--port=(\d+)$') {
      $candidate = 0
      if (-not [int]::TryParse($Matches[1], [ref]$candidate)) {
        throw "Invalid --port value: $arg"
      }

      $resolved = $candidate
    }
  }

  return $resolved
}

function Get-ForwardedArgs {
  param([string[]]$Args)

  $forward = New-Object System.Collections.Generic.List[string]

  for ($index = 0; $index -lt $Args.Count; $index++) {
    $arg = [string]$Args[$index]

    if ($arg -eq '--port' -or $arg -eq '-p') {
      $index++
      continue
    }

    if ($arg -match '^--port=\d+$') {
      continue
    }

    $forward.Add($arg) | Out-Null
  }

  return $forward.ToArray()
}

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $workspaceRoot

$resolvedPort = Resolve-AppPort -DefaultPort $AppPort -Args $RemainingArgs
$forwardArgs = Get-ForwardedArgs -Args $RemainingArgs

$runningNext = Get-WorkspaceNextDevProcess -WorkspacePath $workspaceRoot
$portOwner = Get-PortOwner -Port $resolvedPort

if ($null -ne $runningNext) {
  $runningProcessId = [int]$runningNext.ProcessId

  if (($null -ne $portOwner) -and ([int]$portOwner.OwningProcess -ne $runningProcessId)) {
    $desc = Get-ProcessDescription -ProcessId $portOwner.OwningProcess
    throw "A workspace Next.js process exists (PID $runningProcessId) but app port $resolvedPort is owned by $desc. Stop conflicting processes and retry."
  }

  Write-Info "Next.js dev server is already running for this workspace (PID $runningProcessId). Reusing existing process on port $resolvedPort."
  exit 0
}

if ($null -ne $portOwner) {
  $desc = Get-ProcessDescription -ProcessId $portOwner.OwningProcess
  throw "App port $resolvedPort is already in use by $desc. Stop that process and retry, or run npm run dev -- --port <other-port>."
}

$rawScript = if ($NoTurbo) { 'dev:raw:no-turbo' } else { 'dev:raw' }
$npmArgs = @('run', $rawScript, '--', '--port', [string]$resolvedPort)
if ($forwardArgs.Count -gt 0) {
  $npmArgs += $forwardArgs
}

Write-Info "Starting Next.js: npm $($npmArgs -join ' ')"
& npm @npmArgs
exit $LASTEXITCODE
