param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [string]$AdminEmail = '',
  [SecureString]$AdminPassword,
  [switch]$SkipAdminBootstrap,
  [switch]$EnsureAdminRole,
  [switch]$StrictAdminPositive
)

$ErrorActionPreference = 'Stop'
$PSDefaultParameterValues['Invoke-WebRequest:DisableKeepAlive'] = $true
$PSDefaultParameterValues['Invoke-RestMethod:DisableKeepAlive'] = $true

function Test-NonEmpty {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Test-TrueString {
  param([string]$Value)
  return (Test-NonEmpty $Value) -and ($Value.Trim().ToLowerInvariant() -eq 'true')
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

function Register-RbacAdminUser {
  param(
    [string]$Url,
    [string]$RegisterEmail,
    [SecureString]$RegisterPassword,
    [bool]$CanIgnoreConflict,
    [string]$Role = 'engineer'
  )

  $plainRegisterPassword = ConvertTo-PlainText -SecureValue $RegisterPassword

  $payload = @{
    email = $RegisterEmail
    password = $plainRegisterPassword
    name = 'RBAC Smoke Admin'
    role = $Role
  } | ConvertTo-Json -Depth 8

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/auth/register" -Method Post -ContentType 'application/json' -Body $payload
    Write-Host "Admin bootstrap register status: $($response.StatusCode)"
    return
  }
  catch {
    $detail = Get-HttpErrorDetail -ErrorRecord $_

    if ($CanIgnoreConflict -and $detail.StatusCode -eq 409) {
      Write-Host 'Admin bootstrap register returned 409 (user exists); continuing.'
      return
    }

    if (-not [string]::IsNullOrWhiteSpace($detail.Body)) {
      throw "Failed to bootstrap RBAC admin user (status=$($detail.StatusCode)): $($detail.Body)"
    }

    throw "Failed to bootstrap RBAC admin user: $($_.Exception.Message)"
  }
}

function Resolve-AllowLocalAdminBootstrap {
  $hasEmulatorContext = Test-NonEmpty $env:FIRESTORE_EMULATOR_HOST
  $allowAdminSelfAssignment = Test-TrueString $env:ALLOW_ADMIN_SELF_ASSIGNMENT
  return $hasEmulatorContext -and $allowAdminSelfAssignment
}

function Set-AdminRole {
  param([string]$TargetEmail)

  Write-Host "Promoting $TargetEmail to admin role..."

  & npm run auth:set-role -- --email "$TargetEmail" --role admin
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to assign admin role for $TargetEmail. Ensure Firebase Admin credentials are configured for this shell."
  }

  Write-Host 'Admin role assignment succeeded.'
}

$resolvedAdminEmail = if (Test-NonEmpty $AdminEmail) {
  $AdminEmail
}
elseif (Test-NonEmpty $env:RBAC_ADMIN_EMAIL) {
  $env:RBAC_ADMIN_EMAIL
}
elseif (Test-NonEmpty $env:AUTH_SMOKE_ADMIN_EMAIL) {
  $env:AUTH_SMOKE_ADMIN_EMAIL
}
else {
  ''
}

$secretFromParam = ConvertTo-PlainText -SecureValue $AdminPassword
$resolvedAdminSecret = if (Test-NonEmpty $secretFromParam) {
  $secretFromParam
}
elseif (Test-NonEmpty $env:RBAC_ADMIN_PASSWORD) {
  $env:RBAC_ADMIN_PASSWORD
}
elseif (Test-NonEmpty $env:AUTH_SMOKE_ADMIN_PASSWORD) {
  $env:AUTH_SMOKE_ADMIN_PASSWORD
}
else {
  ''
}

$generatedCredentials = $false
if (-not (Test-NonEmpty $resolvedAdminEmail) -or -not (Test-NonEmpty $resolvedAdminSecret)) {
  if ($SkipAdminBootstrap) {
    throw 'RBAC positive validation requires RBAC_ADMIN_EMAIL and RBAC_ADMIN_PASSWORD when -SkipAdminBootstrap is used.'
  }

  $stamp = "$(Get-Date -Format 'yyyyMMddHHmmss')$(Get-Random -Minimum 100 -Maximum 999)"
  $resolvedAdminEmail = "smoke.rbac.admin.$stamp@example.com"
  $resolvedAdminSecret = "StrongPass$stamp!"
  $generatedCredentials = $true

  Write-Host "Generated temporary RBAC admin user: $resolvedAdminEmail"
}

$canUseLocalAdminBootstrap = Resolve-AllowLocalAdminBootstrap

if ($generatedCredentials) {
  try {
    $secureGeneratedAdminSecret = ConvertTo-SecureString -String $resolvedAdminSecret -AsPlainText -Force
    if ($canUseLocalAdminBootstrap) {
      Register-RbacAdminUser -Url $BaseUrl -RegisterEmail $resolvedAdminEmail -RegisterPassword $secureGeneratedAdminSecret -CanIgnoreConflict $false -Role 'admin'
      Write-Host 'Using emulator local-admin bootstrap path for strict RBAC validation.'
    }
    else {
      Register-RbacAdminUser -Url $BaseUrl -RegisterEmail $resolvedAdminEmail -RegisterPassword $secureGeneratedAdminSecret -CanIgnoreConflict $false -Role 'engineer'
      Set-AdminRole -TargetEmail $resolvedAdminEmail
    }
  }
  catch {
    if ($StrictAdminPositive) {
      throw
    }

    Write-Warning "Admin bootstrap could not complete strict promotion: $($_.Exception.Message)"
    Write-Warning 'Falling back to non-strict RBAC validation for this run.'
    $env:RBAC_ADMIN_EMAIL = ''
    $env:RBAC_ADMIN_PASSWORD = ''

    $smokeScript = Join-Path $PSScriptRoot 'smoke-rbac.ps1'
    Write-Host 'Running RBAC smoke validation in fallback mode...'
    & powershell -ExecutionPolicy Bypass -File $smokeScript -BaseUrl $BaseUrl
    exit $LASTEXITCODE
  }
}
elseif ($EnsureAdminRole) {
  try {
    Set-AdminRole -TargetEmail $resolvedAdminEmail
  }
  catch {
    if ($StrictAdminPositive) {
      throw
    }

    Write-Warning "Admin role assurance failed: $($_.Exception.Message)"
    Write-Warning 'Falling back to non-strict RBAC validation for this run.'
    $smokeScript = Join-Path $PSScriptRoot 'smoke-rbac.ps1'
    & powershell -ExecutionPolicy Bypass -File $smokeScript -BaseUrl $BaseUrl
    exit $LASTEXITCODE
  }
}
elseif ($StrictAdminPositive -and $canUseLocalAdminBootstrap) {
  $secureResolvedAdminSecret = ConvertTo-SecureString -String $resolvedAdminSecret -AsPlainText -Force
  Register-RbacAdminUser -Url $BaseUrl -RegisterEmail $resolvedAdminEmail -RegisterPassword $secureResolvedAdminSecret -CanIgnoreConflict $true -Role 'admin'
}

$env:RBAC_ADMIN_EMAIL = $resolvedAdminEmail
$env:RBAC_ADMIN_PASSWORD = $resolvedAdminSecret

$smokeScript = Join-Path $PSScriptRoot 'smoke-rbac.ps1'

Write-Host 'Running RBAC positive smoke validation...'
& powershell -ExecutionPolicy Bypass -File $smokeScript -BaseUrl $BaseUrl -RequireAdminPositive
exit $LASTEXITCODE
