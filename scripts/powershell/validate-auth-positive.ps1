param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [string]$Email = '',
  [SecureString]$Password,
  [switch]$SkipUserBootstrap
)

$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['Invoke-WebRequest:DisableKeepAlive'] = $true
$PSDefaultParameterValues['Invoke-RestMethod:DisableKeepAlive'] = $true

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

function Register-SmokeUser {
  param(
    [string]$Url,
    [string]$RegisterEmail,
    [PSCredential]$RegisterCredential,
    [bool]$CanIgnoreConflict
  )

  $plainSecret = ConvertTo-PlainText -SecureValue $RegisterCredential.Password
  if (-not (Test-NonEmpty $plainSecret)) {
    throw 'Bootstrap password was not provided.'
  }

  $payload = @{
    email = $RegisterEmail
    password = $plainSecret
    name = 'Auth Smoke User'
    role = 'engineer'
  } | ConvertTo-Json -Depth 8

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/auth/register" -Method Post -ContentType 'application/json' -Body $payload
    Write-Host "Bootstrap register status: $($response.StatusCode)"
    return
  }
  catch {
    $statusCode = $null
    $rawBody = ''

    try {
      $resp = $_.Exception.Response
      if ($null -ne $resp) {
        $statusCode = [int]$resp.StatusCode
        $stream = $resp.GetResponseStream()
        if ($null -ne $stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $rawBody = $reader.ReadToEnd()
          $reader.Dispose()
          $stream.Dispose()
        }
      }
    }
    catch {
      $statusCode = $null
      $rawBody = ''
    }

    if ($CanIgnoreConflict -and $statusCode -eq 409) {
      Write-Host 'Bootstrap register returned 409 (user exists); continuing with provided credentials.'
      return
    }

    if ([string]::IsNullOrWhiteSpace($rawBody)) {
      throw "Failed to bootstrap auth smoke user (status=$statusCode): $($_.Exception.Message)"
    }

    throw "Failed to bootstrap auth smoke user (status=$statusCode): $rawBody"
  }
}

$resolvedEmail = if (Test-NonEmpty $Email) { $Email } elseif (Test-NonEmpty $env:AUTH_SMOKE_EMAIL) { $env:AUTH_SMOKE_EMAIL } else { '' }
$secretFromParam = ConvertTo-PlainText -SecureValue $Password
$resolvedSecret = if (Test-NonEmpty $secretFromParam) { $secretFromParam } elseif (Test-NonEmpty $env:AUTH_SMOKE_PASSWORD) { $env:AUTH_SMOKE_PASSWORD } else { '' }

$generatedCredentials = $false
if (-not (Test-NonEmpty $resolvedEmail) -or -not (Test-NonEmpty $resolvedSecret)) {
  if ($SkipUserBootstrap) {
    throw 'Positive auth validation requires AUTH_SMOKE_EMAIL and AUTH_SMOKE_PASSWORD when -SkipUserBootstrap is used.'
  }

  $stamp = "$(Get-Date -Format 'yyyyMMddHHmmss')$(Get-Random -Minimum 100 -Maximum 999)"
  $resolvedEmail = "smoke.auth.$stamp@example.com"
  $resolvedSecret = "StrongPass$stamp!"
  $generatedCredentials = $true

  Write-Host "Generated temporary auth smoke user: $resolvedEmail"
}

if (-not $SkipUserBootstrap) {
  $secureBootstrapSecret = ConvertTo-SecureString -String $resolvedSecret -AsPlainText -Force
  $bootstrapCredential = New-Object System.Management.Automation.PSCredential ('smoke-user', $secureBootstrapSecret)
  Register-SmokeUser -Url $BaseUrl -RegisterEmail $resolvedEmail -RegisterCredential $bootstrapCredential -CanIgnoreConflict (-not $generatedCredentials)
}

$env:AUTH_SMOKE_EMAIL = $resolvedEmail
$env:AUTH_SMOKE_PASSWORD = $resolvedSecret

Write-Host 'Running positive auth smoke validation...'
$smokeScript = Join-Path $PSScriptRoot 'smoke-auth.ps1'
& powershell -ExecutionPolicy Bypass -File $smokeScript -BaseUrl $BaseUrl -RequirePositive
exit $LASTEXITCODE
