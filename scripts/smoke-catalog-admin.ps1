param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [string]$ProjectId = 'demo-hvac-auto',
  [string]$AdminEmail = '',
  [SecureString]$AdminPassword,
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'

function Test-NonEmpty {
  param([string]$Value)
  return -not [string]::IsNullOrWhiteSpace($Value)
}

function Test-TrueString {
  param([string]$Value)
  return (Test-NonEmpty $Value) -and ($Value.Trim().ToLowerInvariant() -eq 'true')
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

function Register-CatalogAdminUser {
  param(
    [string]$Url,
    [string]$RegisterEmail,
    [SecureString]$RegisterPassword,
    [string]$Role = 'engineer'
  )

  $plainRegisterPassword = ConvertTo-PlainText -SecureValue $RegisterPassword

  $register = Invoke-JsonEndpoint -Uri "$Url/api/auth/register" -Method 'POST' -Body @{
    email = $RegisterEmail
    password = $plainRegisterPassword
    name = 'Catalog Smoke Admin'
    role = $Role
  } -Headers $null

  if ($register.StatusCode -ne 200 -and $register.StatusCode -ne 409) {
    throw "Failed to bootstrap catalog admin user (status=$($register.StatusCode)): $($register.Body)"
  }

  if ($register.StatusCode -eq 409) {
    Write-Host 'Catalog admin bootstrap register returned 409 (user exists); continuing.'
  }
}

function Resolve-AllowLocalRoleBootstrap {
  return Test-TrueString $env:ALLOW_ADMIN_SELF_ASSIGNMENT
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

function Get-AdminCredentialSet {
  param(
    [string]$Url,
    [string]$ExplicitEmail,
    [SecureString]$ExplicitPassword,
    [switch]$RequireStrict,
    [switch]$AllowBootstrap
  )

  $resolvedEmail = if (Test-NonEmpty $ExplicitEmail) {
    $ExplicitEmail
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

  $plainFromParam = ConvertTo-PlainText -SecureValue $ExplicitPassword
  $resolvedSecret = if (Test-NonEmpty $plainFromParam) {
    $plainFromParam
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

  if ((Test-NonEmpty $resolvedEmail) -and (Test-NonEmpty $resolvedSecret)) {
    return [pscustomobject]@{
      Email = $resolvedEmail
      Password = (ConvertTo-SecureString -String $resolvedSecret -AsPlainText -Force)
      Bootstrapped = $false
    }
  }

  if ($RequireStrict -and $AllowBootstrap) {
    $stamp = "$(Get-Date -Format 'yyyyMMddHHmmss')$(Get-Random -Minimum 100 -Maximum 999)"
    $resolvedEmail = "smoke.catalog.admin.$stamp@example.com"
    $resolvedSecret = "StrongPass$stamp!"
    $generatedSecurePassword = ConvertTo-SecureString -String $resolvedSecret -AsPlainText -Force

    Write-Host "Generated temporary catalog admin user: $resolvedEmail"

    if (Resolve-AllowLocalRoleBootstrap) {
      Register-CatalogAdminUser -Url $Url -RegisterEmail $resolvedEmail -RegisterPassword $generatedSecurePassword -Role 'admin'
    }
    else {
      Register-CatalogAdminUser -Url $Url -RegisterEmail $resolvedEmail -RegisterPassword $generatedSecurePassword -Role 'engineer'
      Set-AdminRole -TargetEmail $resolvedEmail
    }

    return [pscustomobject]@{
      Email = $resolvedEmail
      Password = $generatedSecurePassword
      Bootstrapped = $true
    }
  }

  if ($RequireStrict) {
    throw 'Catalog admin smoke strict mode requires RBAC_ADMIN_EMAIL and RBAC_ADMIN_PASSWORD, or emulator bootstrap capability.'
  }

  Write-Warning 'Skipping catalog admin smoke checks: admin credentials are not configured.'
  return $null
}

function Resolve-AllowBootstrap {
  return Test-NonEmpty $env:FIRESTORE_EMULATOR_HOST
}

function Build-AdminAuthContext {
  param(
    [string]$Url,
    [string]$ExplicitEmail,
    [SecureString]$ExplicitPassword,
    [switch]$RequireStrict
  )

  $allowBootstrap = Resolve-AllowBootstrap
  return Get-AdminCredentialSet -Url $Url -ExplicitEmail $ExplicitEmail -ExplicitPassword $ExplicitPassword -RequireStrict:$RequireStrict -AllowBootstrap:$allowBootstrap
}

function Get-CleanupCredentialInput {
  param(
    [string]$ExplicitEmail,
    [SecureString]$ExplicitPassword,
    [object]$ResolvedAdmin
  )

  $email = $ExplicitEmail
  if (-not (Test-NonEmpty $email)) {
    if ($null -ne $ResolvedAdmin -and (Test-NonEmpty $ResolvedAdmin.Email)) {
      $email = [string]$ResolvedAdmin.Email
    }
    elseif (Test-NonEmpty $env:RBAC_ADMIN_EMAIL) {
      $email = $env:RBAC_ADMIN_EMAIL
    }
    elseif (Test-NonEmpty $env:AUTH_SMOKE_ADMIN_EMAIL) {
      $email = $env:AUTH_SMOKE_ADMIN_EMAIL
    }
  }

  $password = ConvertTo-PlainText -SecureValue $ExplicitPassword
  if (-not (Test-NonEmpty $password)) {
    if ($null -ne $ResolvedAdmin) {
      $resolvedPassword = ConvertTo-PlainText -SecureValue $ResolvedAdmin.Password
      if (Test-NonEmpty $resolvedPassword) {
        $password = $resolvedPassword
      }
    }

    if (-not (Test-NonEmpty $password)) {
      if (Test-NonEmpty $env:RBAC_ADMIN_PASSWORD) {
        $password = $env:RBAC_ADMIN_PASSWORD
      }
      elseif (Test-NonEmpty $env:AUTH_SMOKE_ADMIN_PASSWORD) {
        $password = $env:AUTH_SMOKE_ADMIN_PASSWORD
      }
    }
  }

  return [pscustomobject]@{
    Email = $email
    Password = $password
  }
}

function Get-LoginToken {
  param(
    [string]$Url,
    [string]$Email,
    [SecureString]$Password
  )

  $plainPassword = ConvertTo-PlainText -SecureValue $Password

  $login = Invoke-JsonEndpoint -Uri "$Url/api/auth/login" -Method 'POST' -Body @{
    email = $Email
    password = $plainPassword
  } -Headers $null

  Assert-Status -Actual $login.StatusCode -Expected 200 -Message 'Admin login status mismatch'

  $token = if ($null -ne $login.Json) { [string]$login.Json.token } else { '' }
  Assert-True (Test-NonEmpty $token) 'Admin login token missing'

  $role = if ($null -ne $login.Json -and $null -ne $login.Json.user) {
    [string]$login.Json.user.role
  }
  else {
    ''
  }

  return [pscustomobject]@{
    Token = $token
    Role = $role
  }
}

function Get-EmulatorAuditLogCount {
  param(
    [string]$FirestoreHost,
    [string]$FirestoreProjectId,
    [string]$Entity,
    [string]$EntityId,
    [string]$Action
  )

  $query = @{
    structuredQuery = @{
      from = @(@{ collectionId = 'auditLogs' })
      where = @{
        compositeFilter = @{
          op = 'AND'
          filters = @(
            @{
              fieldFilter = @{
                field = @{ fieldPath = 'projectId' }
                op = 'EQUAL'
                value = @{ stringValue = 'system' }
              }
            },
            @{
              fieldFilter = @{
                field = @{ fieldPath = 'entity' }
                op = 'EQUAL'
                value = @{ stringValue = $Entity }
              }
            },
            @{
              fieldFilter = @{
                field = @{ fieldPath = 'entityId' }
                op = 'EQUAL'
                value = @{ stringValue = $EntityId }
              }
            },
            @{
              fieldFilter = @{
                field = @{ fieldPath = 'action' }
                op = 'EQUAL'
                value = @{ stringValue = $Action }
              }
            }
          )
        }
      }
      limit = 5
    }
  }

  $queryBody = $query | ConvertTo-Json -Depth 30
  $url = "http://$FirestoreHost/v1/projects/$FirestoreProjectId/databases/(default)/documents:runQuery"

  $result = Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body $queryBody
  $rows = @($result)
  return (@($rows | Where-Object { $null -ne $_.document })).Count
}

function Wait-ForAuditLog {
  param(
    [string]$FirestoreHost,
    [string]$FirestoreProjectId,
    [string]$Entity,
    [string]$EntityId,
    [string]$Action,
    [int]$Attempts = 8,
    [int]$DelayMs = 250
  )

  $count = 0
  for ($i = 0; $i -lt $Attempts; $i += 1) {
    $count = Get-EmulatorAuditLogCount -FirestoreHost $FirestoreHost -FirestoreProjectId $FirestoreProjectId -Entity $Entity -EntityId $EntityId -Action $Action
    if ($count -gt 0) {
      return $count
    }

    Start-Sleep -Milliseconds $DelayMs
  }

  return $count
}

function Wait-ForAuditLogIncrease {
  param(
    [string]$FirestoreHost,
    [string]$FirestoreProjectId,
    [string]$Entity,
    [string]$EntityId,
    [string]$Action,
    [int]$BaselineCount,
    [int]$Attempts = 8,
    [int]$DelayMs = 250
  )

  $count = $BaselineCount
  for ($i = 0; $i -lt $Attempts; $i += 1) {
    $count = Get-EmulatorAuditLogCount -FirestoreHost $FirestoreHost -FirestoreProjectId $FirestoreProjectId -Entity $Entity -EntityId $EntityId -Action $Action
    if ($count -gt $BaselineCount) {
      return $count
    }

    Start-Sleep -Milliseconds $DelayMs
  }

  return $count
}

$createdSupplierId = ''
$createdMaterialId = ''
$previousSettings = $null
$settingsMutated = $false
$settingsAuditBaseline = -1
$resolvedAdmin = $null

try {
  Write-Host '[1/16] Resolving admin credentials...'
  $admin = Build-AdminAuthContext -Url $BaseUrl -ExplicitEmail $AdminEmail -ExplicitPassword $AdminPassword -RequireStrict:$Strict
  if ($null -eq $admin) {
    Write-Host 'CATALOG ADMIN SMOKE: SKIPPED (admin credentials unavailable)'
    exit 0
  }

  $resolvedAdmin = $admin

  Write-Host '[2/16] Logging in as admin...'
  $adminLogin = Get-LoginToken -Url $BaseUrl -Email $admin.Email -Password $admin.Password
  Assert-True (Test-NonEmpty $adminLogin.Token) 'Admin token should be present'
  if ($adminLogin.Role -ne 'admin') {
    throw "Expected admin role but received '$($adminLogin.Role)'"
  }

  $adminHeaders = @{ Authorization = "Bearer $($adminLogin.Token)" }
  $stamp = "$(Get-Date -Format 'yyyyMMddHHmmss')$(Get-Random -Minimum 100 -Maximum 999)"

  Write-Host '[3/16] Capturing current settings snapshot (200)...'
  $currentSettings = Invoke-JsonEndpoint -Uri "$BaseUrl/api/settings" -Method 'GET' -Body $null -Headers $adminHeaders
  Assert-Status -Actual $currentSettings.StatusCode -Expected 200 -Message 'Settings GET status mismatch'
  $previousSettings = if ($null -ne $currentSettings.Json -and $null -ne $currentSettings.Json.settings) {
    $currentSettings.Json.settings
  }
  else {
    $null
  }
  Write-Host 'PASS settings snapshot capture'

  Write-Host '[4/16] Settings update should reject invalid payload (400)...'
  $invalidSettingsUpdate = Invoke-JsonEndpoint -Uri "$BaseUrl/api/settings" -Method 'PUT' -Body @{
    placementRules = 'invalid-string-not-array'
  } -Headers $adminHeaders
  Assert-Status -Actual $invalidSettingsUpdate.StatusCode -Expected 400 -Message 'Settings invalid-update status mismatch'
  Write-Host 'PASS invalid settings update validation'

  if (Test-NonEmpty $env:FIRESTORE_EMULATOR_HOST) {
    Write-Host '[5/16] Capturing settings audit baseline...'
    $settingsAuditBaseline = Get-EmulatorAuditLogCount -FirestoreHost $env:FIRESTORE_EMULATOR_HOST -FirestoreProjectId $ProjectId -Entity 'settings' -EntityId 'global' -Action 'updated'
    Write-Host 'PASS settings audit baseline capture'
  }
  else {
    Write-Host '[5/16] SKIPPED settings audit baseline capture (FIRESTORE_EMULATOR_HOST not set)'
  }

  Write-Host '[6/16] Updating settings (200)...'
  $updateSettings = Invoke-JsonEndpoint -Uri "$BaseUrl/api/settings" -Method 'PUT' -Body @{
    companyName = "Catalog Smoke Company $stamp"
  } -Headers $adminHeaders
  Assert-Status -Actual $updateSettings.StatusCode -Expected 200 -Message 'Settings update status mismatch'
  $settingsMutated = $true
  Write-Host 'PASS settings update'

  Write-Host '[7/16] Material create should reject invalid payload (400)...'
  $invalidMaterialCreate = Invoke-JsonEndpoint -Uri "$BaseUrl/api/materials" -Method 'POST' -Body @{
    name = "Catalog Smoke Material Invalid $stamp"
    category = 'validation_smoke'
    unit = 'pc'
    unitPricePHP = -1
  } -Headers $adminHeaders
  Assert-Status -Actual $invalidMaterialCreate.StatusCode -Expected 400 -Message 'Material invalid-create status mismatch'
  Write-Host 'PASS invalid material create validation'

  Write-Host '[8/16] Creating supplier (201)...'
  $createSupplier = Invoke-JsonEndpoint -Uri "$BaseUrl/api/suppliers" -Method 'POST' -Body @{
    name = "Catalog Smoke Supplier $stamp"
    type = 'distributor'
    website = 'https://example.com'
    location = 'Metro Manila'
    contactInfo = '0917-000-0000'
    coverageArea = 'NCR'
    categories = @('ducting', 'controls')
  } -Headers $adminHeaders
  Assert-Status -Actual $createSupplier.StatusCode -Expected 201 -Message 'Supplier create status mismatch'
  $createdSupplierId = if ($null -ne $createSupplier.Json -and $null -ne $createSupplier.Json.supplier) { [string]$createSupplier.Json.supplier.id } else { '' }
  Assert-True (Test-NonEmpty $createdSupplierId) 'Created supplier id missing'
  Write-Host 'PASS supplier create'

  Write-Host '[9/16] Creating material (201)...'
  $createMaterial = Invoke-JsonEndpoint -Uri "$BaseUrl/api/materials" -Method 'POST' -Body @{
    name = "Catalog Smoke Material $stamp"
    category = 'validation_smoke'
    unit = 'pc'
    unitPricePHP = 456.78
    specification = 'Smoke validation payload'
    supplierId = $createdSupplierId
  } -Headers $adminHeaders
  Assert-Status -Actual $createMaterial.StatusCode -Expected 201 -Message 'Material create status mismatch'
  $createdMaterialId = if ($null -ne $createMaterial.Json -and $null -ne $createMaterial.Json.material) { [string]$createMaterial.Json.material.id } else { '' }
  Assert-True (Test-NonEmpty $createdMaterialId) 'Created material id missing'
  Write-Host 'PASS material create'

  Write-Host '[10/16] Supplier update should reject invalid payload (400)...'
  $invalidSupplierUpdate = Invoke-JsonEndpoint -Uri "$BaseUrl/api/suppliers/$createdSupplierId" -Method 'PUT' -Body @{
    categories = 'invalid-string-not-array'
  } -Headers $adminHeaders
  Assert-Status -Actual $invalidSupplierUpdate.StatusCode -Expected 400 -Message 'Supplier invalid-update status mismatch'
  Write-Host 'PASS invalid supplier update validation'

  Write-Host '[11/16] Updating supplier (200)...'
  $updateSupplier = Invoke-JsonEndpoint -Uri "$BaseUrl/api/suppliers/$createdSupplierId" -Method 'PUT' -Body @{
    name = "Catalog Smoke Supplier Updated $stamp"
    type = 'local'
    categories = @('ducting', 'controls', 'maintenance')
  } -Headers $adminHeaders
  Assert-Status -Actual $updateSupplier.StatusCode -Expected 200 -Message 'Supplier update status mismatch'
  Write-Host 'PASS supplier update'

  Write-Host '[12/16] Material update should reject invalid payload (400)...'
  $invalidMaterialUpdate = Invoke-JsonEndpoint -Uri "$BaseUrl/api/materials/$createdMaterialId" -Method 'PUT' -Body @{
    unitPricePHP = -10
  } -Headers $adminHeaders
  Assert-Status -Actual $invalidMaterialUpdate.StatusCode -Expected 400 -Message 'Material invalid-update status mismatch'
  Write-Host 'PASS invalid material update validation'

  Write-Host '[13/16] Updating material (200)...'
  $updateMaterial = Invoke-JsonEndpoint -Uri "$BaseUrl/api/materials/$createdMaterialId" -Method 'PUT' -Body @{
    name = "Catalog Smoke Material Updated $stamp"
    unitPricePHP = 789.01
    specification = 'Updated by smoke script'
  } -Headers $adminHeaders
  Assert-Status -Actual $updateMaterial.StatusCode -Expected 200 -Message 'Material update status mismatch'
  Write-Host 'PASS material update'

  Write-Host '[14/16] Deleting material (200)...'
  $deleteMaterial = Invoke-JsonEndpoint -Uri "$BaseUrl/api/materials/$createdMaterialId" -Method 'DELETE' -Body $null -Headers $adminHeaders
  Assert-Status -Actual $deleteMaterial.StatusCode -Expected 200 -Message 'Material delete status mismatch'
  Write-Host 'PASS material delete'

  Write-Host '[15/16] Deleting supplier (200)...'
  $deleteSupplier = Invoke-JsonEndpoint -Uri "$BaseUrl/api/suppliers/$createdSupplierId" -Method 'DELETE' -Body $null -Headers $adminHeaders
  Assert-Status -Actual $deleteSupplier.StatusCode -Expected 200 -Message 'Supplier delete status mismatch'
  Write-Host 'PASS supplier delete'

  Write-Host '[16/16] Verifying mutation audit logs when emulator is available...'
  if (-not (Test-NonEmpty $env:FIRESTORE_EMULATOR_HOST)) {
    if ($Strict) {
      throw 'FIRESTORE_EMULATOR_HOST must be set for strict catalog audit-log verification.'
    }

    Write-Warning 'Skipping audit-log checks because FIRESTORE_EMULATOR_HOST is not set.'
  }
  else {
    if ($settingsAuditBaseline -lt 0) {
      $settingsAuditBaseline = Get-EmulatorAuditLogCount -FirestoreHost $env:FIRESTORE_EMULATOR_HOST -FirestoreProjectId $ProjectId -Entity 'settings' -EntityId 'global' -Action 'updated'
    }

    $settingsUpdateAuditCount = Wait-ForAuditLogIncrease -FirestoreHost $env:FIRESTORE_EMULATOR_HOST -FirestoreProjectId $ProjectId -Entity 'settings' -EntityId 'global' -Action 'updated' -BaselineCount $settingsAuditBaseline
    Assert-True ($settingsUpdateAuditCount -gt $settingsAuditBaseline) 'Missing updated audit log for settings mutation'

    $materialCreateAuditCount = Wait-ForAuditLog -FirestoreHost $env:FIRESTORE_EMULATOR_HOST -FirestoreProjectId $ProjectId -Entity 'material' -EntityId $createdMaterialId -Action 'created'
    Assert-True ($materialCreateAuditCount -gt 0) 'Missing created audit log for material mutation'

    $materialUpdateAuditCount = Wait-ForAuditLog -FirestoreHost $env:FIRESTORE_EMULATOR_HOST -FirestoreProjectId $ProjectId -Entity 'material' -EntityId $createdMaterialId -Action 'updated'
    Assert-True ($materialUpdateAuditCount -gt 0) 'Missing updated audit log for material mutation'

    $materialDeleteAuditCount = Wait-ForAuditLog -FirestoreHost $env:FIRESTORE_EMULATOR_HOST -FirestoreProjectId $ProjectId -Entity 'material' -EntityId $createdMaterialId -Action 'deleted'
    Assert-True ($materialDeleteAuditCount -gt 0) 'Missing deleted audit log for material mutation'

    $supplierCreateAuditCount = Wait-ForAuditLog -FirestoreHost $env:FIRESTORE_EMULATOR_HOST -FirestoreProjectId $ProjectId -Entity 'supplier' -EntityId $createdSupplierId -Action 'created'
    Assert-True ($supplierCreateAuditCount -gt 0) 'Missing created audit log for supplier mutation'

    $supplierUpdateAuditCount = Wait-ForAuditLog -FirestoreHost $env:FIRESTORE_EMULATOR_HOST -FirestoreProjectId $ProjectId -Entity 'supplier' -EntityId $createdSupplierId -Action 'updated'
    Assert-True ($supplierUpdateAuditCount -gt 0) 'Missing updated audit log for supplier mutation'

    $supplierDeleteAuditCount = Wait-ForAuditLog -FirestoreHost $env:FIRESTORE_EMULATOR_HOST -FirestoreProjectId $ProjectId -Entity 'supplier' -EntityId $createdSupplierId -Action 'deleted'
    Assert-True ($supplierDeleteAuditCount -gt 0) 'Missing deleted audit log for supplier mutation'
  }

  Write-Host 'Catalog admin smoke completed successfully.'
  Write-Host ''
  Write-Host 'CATALOG ADMIN SMOKE: ALL CHECKS PASSED'

  $createdMaterialId = ''
  $createdSupplierId = ''
  exit 0
}
catch {
  $detail = Get-HttpErrorDetail -ErrorRecord $_
  $message = $_.Exception.Message

  Write-Host ''
  Write-Host ("CATALOG ADMIN SMOKE FAILED: " + $message)

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
finally {
  $cleanupCredentialInput = Get-CleanupCredentialInput -ExplicitEmail $AdminEmail -ExplicitPassword $AdminPassword -ResolvedAdmin $resolvedAdmin
  $resolvedCleanupEmail = [string]$cleanupCredentialInput.Email
  $passwordCandidate = [string]$cleanupCredentialInput.Password

  $needsCleanup =
    (Test-NonEmpty $createdMaterialId) -or
    (Test-NonEmpty $createdSupplierId) -or
    ($settingsMutated -and $null -ne $previousSettings)

  if ($needsCleanup -and (Test-NonEmpty $resolvedCleanupEmail) -and (Test-NonEmpty $passwordCandidate)) {
    try {
      $cleanupLogin = Invoke-JsonEndpoint -Uri "$BaseUrl/api/auth/login" -Method 'POST' -Body @{
        email = $resolvedCleanupEmail
        password = $passwordCandidate
      } -Headers $null

      if ($cleanupLogin.StatusCode -eq 200 -and $null -ne $cleanupLogin.Json -and $null -ne $cleanupLogin.Json.token) {
        $cleanupHeaders = @{ Authorization = "Bearer $($cleanupLogin.Json.token)" }

        if (Test-NonEmpty $createdMaterialId) {
          [void](Invoke-JsonEndpoint -Uri "$BaseUrl/api/materials/$createdMaterialId" -Method 'DELETE' -Body $null -Headers $cleanupHeaders)
        }

        if (Test-NonEmpty $createdSupplierId) {
          [void](Invoke-JsonEndpoint -Uri "$BaseUrl/api/suppliers/$createdSupplierId" -Method 'DELETE' -Body $null -Headers $cleanupHeaders)
        }

        if ($settingsMutated -and $null -ne $previousSettings) {
          [void](Invoke-JsonEndpoint -Uri "$BaseUrl/api/settings" -Method 'PUT' -Body $previousSettings -Headers $cleanupHeaders)
        }
      }
    }
    catch {
      Write-Warning 'Cleanup attempt failed; records may remain from partial smoke run.'
    }
  }
}
