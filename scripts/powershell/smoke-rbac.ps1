param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [string]$EngineerEmail = '',
  [SecureString]$EngineerPassword,
  [string]$AdminEmail = '',
  [SecureString]$AdminPassword,
  [switch]$RequireAdminPositive
)

$ErrorActionPreference = 'Stop'

function Test-NonEmpty {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "ASSERTION FAILED: $Message"
  }
}

function Assert-Status {
  param(
    [int]$Actual,
    [int]$Expected,
    [string]$Message
  )

  if ($Actual -ne $Expected) {
    throw "ASSERTION FAILED: $Message (expected=$Expected actual=$Actual)"
  }
}

function ConvertTo-JsonBody {
  param([object]$Object)
  return ($Object | ConvertTo-Json -Depth 12)
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

function Invoke-JsonEndpoint {
  param(
    [string]$Uri,
    [string]$Method,
    [object]$Body,
    [hashtable]$Headers
  )

  $invokeArgs = @{
    Uri = $Uri
    Method = $Method
    UseBasicParsing = $true
  }

  if ($null -ne $Headers) {
    $invokeArgs['Headers'] = $Headers
  }

  if ($null -ne $Body) {
    $invokeArgs['ContentType'] = 'application/json'
    $invokeArgs['Body'] = (ConvertTo-JsonBody $Body)
  }

  $statusCode = $null
  $rawBody = ''

  try {
    $response = Invoke-WebRequest @invokeArgs
    $statusCode = [int]$response.StatusCode
    $rawBody = $response.Content
  }
  catch {
    $detail = Get-HttpErrorDetail -ErrorRecord $_
    if ($null -eq $detail.StatusCode) {
      throw
    }
    $statusCode = [int]$detail.StatusCode
    $rawBody = if ($null -ne $detail.Body) { [string]$detail.Body } else { '' }
  }

  $json = $null
  if (-not [string]::IsNullOrWhiteSpace($rawBody)) {
    try {
      $json = $rawBody | ConvertFrom-Json
    }
    catch {
      $json = $null
    }
  }

  return [pscustomobject]@{
    StatusCode = $statusCode
    Body = $rawBody
    Json = $json
  }
}

function Get-EngineerCredentials {
  param(
    [string]$Url,
    [string]$ExplicitEmail,
    [SecureString]$ExplicitPassword
  )

  $resolvedEmail = if (Test-NonEmpty $ExplicitEmail) {
    $ExplicitEmail
  }
  elseif (Test-NonEmpty $env:RBAC_ENGINEER_EMAIL) {
    $env:RBAC_ENGINEER_EMAIL
  }
  else {
    ''
  }

  $plainFromParam = ConvertTo-PlainText -SecureValue $ExplicitPassword
  $resolvedSecret = if (Test-NonEmpty $plainFromParam) {
    $plainFromParam
  }
  elseif (Test-NonEmpty $env:RBAC_ENGINEER_PASSWORD) {
    $env:RBAC_ENGINEER_PASSWORD
  }
  else {
    ''
  }

  $generated = $false
  if (-not (Test-NonEmpty $resolvedEmail) -or -not (Test-NonEmpty $resolvedSecret)) {
    $stamp = "$(Get-Date -Format 'yyyyMMddHHmmss')$(Get-Random -Minimum 100 -Maximum 999)"
    $resolvedEmail = "smoke.rbac.$stamp@example.com"
    $resolvedSecret = "StrongPass$stamp!"
    $generated = $true
    Write-Host "Generated temporary engineer user: $resolvedEmail"
  }

  if ($generated) {
    $register = Invoke-JsonEndpoint -Uri "$Url/api/auth/register" -Method 'POST' -Body @{
      email = $resolvedEmail
      password = $resolvedSecret
      name = 'RBAC Smoke Engineer'
      role = 'engineer'
    } -Headers $null

    if ($register.StatusCode -ne 200 -and $register.StatusCode -ne 409) {
      throw "Failed to bootstrap engineer user (status=$($register.StatusCode)): $($register.Body)"
    }

    if ($register.StatusCode -eq 409) {
      Write-Host 'Bootstrap register returned 409 (user exists); continuing with generated credentials.'
    }
  }

  return [pscustomobject]@{
    Email = $resolvedEmail
    Password = (ConvertTo-SecureString -String $resolvedSecret -AsPlainText -Force)
  }
}

function Get-LoginToken {
  param(
    [string]$Url,
    [string]$Email,
    [SecureString]$Password,
    [string]$Label
  )

  $plainPassword = ConvertTo-PlainText -SecureValue $Password

  $login = Invoke-JsonEndpoint -Uri "$Url/api/auth/login" -Method 'POST' -Body @{
    email = $Email
    password = $plainPassword
  } -Headers $null

  Assert-Status -Actual $login.StatusCode -Expected 200 -Message "$Label login status mismatch"

  $token = if ($null -ne $login.Json) { [string]$login.Json.token } else { '' }
  Assert-True (Test-NonEmpty $token) "$Label login token missing"

  $role = ''
  if ($null -ne $login.Json -and $null -ne $login.Json.user) {
    $role = [string]$login.Json.user.role
  }

  return [pscustomobject]@{
    Token = $token
    Role = $role
  }
}

function Test-IsCredentialServerError {
  param(
    [object]$Response
  )

  if ($null -eq $Response) {
    return $false
  }

  if ([int]$Response.StatusCode -lt 500) {
    return $false
  }

  $body = [string]$Response.Body
  return ($body -match 'Could not load the default credentials')
}

function Assert-RoleGateAllowed {
  param(
    [object]$Response,
    [string]$Operation,
    [switch]$AllowCredentialServerError
  )

  if ($null -eq $Response) {
    throw "$Operation did not return a response."
  }

  $status = [int]$Response.StatusCode
  if ($status -eq 401 -or $status -eq 403) {
    throw "$Operation failed role gate (status=$status)."
  }

  if ($status -ge 500) {
    if ($AllowCredentialServerError -and (Test-IsCredentialServerError -Response $Response)) {
      Write-Warning "$Operation reached role gate but backend is unavailable due to missing Firebase Admin credentials."
      return
    }

    throw "$Operation returned HTTP $status. Body: $($Response.Body)"
  }
}

try {
  Write-Host '[1/10] /api/settings without token should return 401...'
  $settingsNoToken = Invoke-JsonEndpoint -Uri "$BaseUrl/api/settings" -Method 'GET' -Body $null -Headers $null
  Assert-Status -Actual $settingsNoToken.StatusCode -Expected 401 -Message 'Settings GET missing-token status mismatch'
  Write-Host 'PASS settings missing-token check'

  Write-Host '[2/10] Preparing engineer credentials and token...'
  $engineer = Get-EngineerCredentials -Url $BaseUrl -ExplicitEmail $EngineerEmail -ExplicitPassword $EngineerPassword
  $engineerLogin = Get-LoginToken -Url $BaseUrl -Email $engineer.Email -Password $engineer.Password -Label 'Engineer'
  Write-Host 'PASS engineer login'

  $engineerHeaders = @{ Authorization = "Bearer $($engineerLogin.Token)" }

  Write-Host '[3/10] Engineer should read /api/equipment (200)...'
  $equipmentByEngineer = Invoke-JsonEndpoint -Uri "$BaseUrl/api/equipment" -Method 'GET' -Body $null -Headers $engineerHeaders
  Assert-Status -Actual $equipmentByEngineer.StatusCode -Expected 200 -Message 'Equipment GET engineer status mismatch'
  Assert-True ($null -ne $equipmentByEngineer.Json -and $null -ne $equipmentByEngineer.Json.equipment) 'Equipment payload missing for engineer'
  Write-Host 'PASS engineer read access'

  Write-Host '[4/10] Engineer should be blocked from /api/settings PUT (403)...'
  $settingsPutByEngineer = Invoke-JsonEndpoint -Uri "$BaseUrl/api/settings" -Method 'PUT' -Body @{ companyName = 'RBAC Smoke' } -Headers $engineerHeaders
  Assert-Status -Actual $settingsPutByEngineer.StatusCode -Expected 403 -Message 'Settings PUT engineer status mismatch'
  Write-Host 'PASS engineer settings-write denied'

  Write-Host '[5/10] Engineer should be blocked from admin-only material update (403)...'
  $materialPutByEngineer = Invoke-JsonEndpoint -Uri "$BaseUrl/api/materials/rbac-smoke-test-id" -Method 'PUT' -Body @{ name = 'RBAC Smoke' } -Headers $engineerHeaders
  Assert-Status -Actual $materialPutByEngineer.StatusCode -Expected 403 -Message 'Material PUT engineer status mismatch'
  Write-Host 'PASS engineer material-write denied'

  Write-Host '[6/10] Engineer should be blocked from admin-only supplier update (403)...'
  $supplierPutByEngineer = Invoke-JsonEndpoint -Uri "$BaseUrl/api/suppliers/rbac-smoke-test-id" -Method 'PUT' -Body @{ name = 'RBAC Smoke Supplier' } -Headers $engineerHeaders
  Assert-Status -Actual $supplierPutByEngineer.StatusCode -Expected 403 -Message 'Supplier PUT engineer status mismatch'
  Write-Host 'PASS engineer supplier-write denied'

  Write-Host '[7/10] Engineer should be blocked from admin-only material create (403)...'
  $materialPostByEngineer = Invoke-JsonEndpoint -Uri "$BaseUrl/api/materials" -Method 'POST' -Body @{
    name = 'RBAC Smoke Material'
    category = 'misc'
    unit = 'pc'
    unitPricePHP = 1
  } -Headers $engineerHeaders
  Assert-Status -Actual $materialPostByEngineer.StatusCode -Expected 403 -Message 'Material POST engineer status mismatch'
  Write-Host 'PASS engineer material-create denied'

  $resolvedAdminEmail = if (Test-NonEmpty $AdminEmail) { $AdminEmail } elseif (Test-NonEmpty $env:RBAC_ADMIN_EMAIL) { $env:RBAC_ADMIN_EMAIL } elseif (Test-NonEmpty $env:AUTH_SMOKE_ADMIN_EMAIL) { $env:AUTH_SMOKE_ADMIN_EMAIL } else { '' }
  $adminSecretFromParam = ConvertTo-PlainText -SecureValue $AdminPassword
  $resolvedAdminSecret = if (Test-NonEmpty $adminSecretFromParam) { $adminSecretFromParam } elseif (Test-NonEmpty $env:RBAC_ADMIN_PASSWORD) { $env:RBAC_ADMIN_PASSWORD } elseif (Test-NonEmpty $env:AUTH_SMOKE_ADMIN_PASSWORD) { $env:AUTH_SMOKE_ADMIN_PASSWORD } else { '' }

  $canRunAdminPositive = (Test-NonEmpty $resolvedAdminEmail) -and (Test-NonEmpty $resolvedAdminSecret)

  if (-not $canRunAdminPositive) {
    if ($RequireAdminPositive) {
      throw 'Admin-positive RBAC checks require RBAC_ADMIN_EMAIL and RBAC_ADMIN_PASSWORD (or -AdminEmail/-AdminPassword).'
    }

    Write-Warning 'Skipping admin-positive RBAC checks. Set RBAC_ADMIN_EMAIL and RBAC_ADMIN_PASSWORD to validate admin allow-paths.'
    Write-Host '[8/10] SKIPPED admin material-write allow-path'
    Write-Host '[9/10] SKIPPED admin supplier-write allow-path'
    Write-Host '[10/10] SKIPPED admin settings-write allow-path'
  }
  else {
    Write-Host '[8/10] Admin should pass role gate on material update path...'
    $adminSecureSecret = ConvertTo-SecureString -String $resolvedAdminSecret -AsPlainText -Force
    $adminLogin = Get-LoginToken -Url $BaseUrl -Email $resolvedAdminEmail -Password $adminSecureSecret -Label 'Admin'
    $adminHeaders = @{ Authorization = "Bearer $($adminLogin.Token)" }

    $materialPutByAdmin = Invoke-JsonEndpoint -Uri "$BaseUrl/api/materials/rbac-smoke-test-id" -Method 'PUT' -Body @{ name = 'RBAC Smoke' } -Headers $adminHeaders
    Assert-RoleGateAllowed -Response $materialPutByAdmin -Operation 'Admin material update' -AllowCredentialServerError
    Write-Host 'PASS admin material role-gate allow-path'

    Write-Host '[9/10] Admin should pass role gate on supplier update path...'
    $supplierPutByAdmin = Invoke-JsonEndpoint -Uri "$BaseUrl/api/suppliers/rbac-smoke-test-id" -Method 'PUT' -Body @{ name = 'RBAC Smoke Supplier' } -Headers $adminHeaders
    Assert-RoleGateAllowed -Response $supplierPutByAdmin -Operation 'Admin supplier update' -AllowCredentialServerError
    Write-Host 'PASS admin supplier role-gate allow-path'

    Write-Host '[10/10] Admin should pass role gate on settings update path...'
    $settingsPutByAdmin = Invoke-JsonEndpoint -Uri "$BaseUrl/api/settings" -Method 'PUT' -Body @{ companyName = 'RBAC Smoke Company' } -Headers $adminHeaders
    Assert-RoleGateAllowed -Response $settingsPutByAdmin -Operation 'Admin settings update' -AllowCredentialServerError
    Write-Host 'PASS admin settings-write allow-path'
  }

  Write-Host ''
  Write-Host 'RBAC SMOKE: ALL CHECKS PASSED'
  exit 0
}
catch {
  $detail = Get-HttpErrorDetail -ErrorRecord $_
  $message = $_.Exception.Message

  Write-Host ''
  Write-Host ("RBAC SMOKE FAILED: " + $message)

  if ($null -ne $detail.StatusCode) {
    Write-Host "HTTP status: $($detail.StatusCode)"
  }

  if (-not [string]::IsNullOrWhiteSpace($detail.Body)) {
    Write-Host "HTTP body: $($detail.Body)"
  }

  if ($message -match 'connect|refused|actively refused') {
    Write-Host 'Hint: Start the app first (npm run dev) before running this script.'
  }

  exit 1
}
