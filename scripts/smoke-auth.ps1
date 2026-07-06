param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [string]$Email = '',
  [PSCredential]$Credential,
  [switch]$RequirePositive
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

function ConvertTo-JsonBody {
  param([object]$Object)
  return ($Object | ConvertTo-Json -Depth 12)
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

$resolvedEmail = if (Test-NonEmpty $Email) { $Email } else { $env:AUTH_SMOKE_EMAIL }
$secretFromCredential = if ($null -ne $Credential) { ConvertTo-PlainText -SecureValue $Credential.Password } else { '' }
$resolvedSecret = if (Test-NonEmpty $secretFromCredential) { $secretFromCredential } else { $env:AUTH_SMOKE_PASSWORD }
$canRunPositive = (Test-NonEmpty $resolvedEmail) -and (Test-NonEmpty $resolvedSecret)

try {
  Write-Host '[1/7] Login missing fields should return 400...'
  $loginMissing = Invoke-JsonEndpoint -Uri "$BaseUrl/api/auth/login" -Method 'POST' -Body @{} -Headers $null
  Assert-Status -Actual $loginMissing.StatusCode -Expected 400 -Message 'Login missing-fields status mismatch'
  Assert-True (-not [string]::IsNullOrWhiteSpace($loginMissing.Json.error)) 'Login missing-fields error missing'
  Write-Host 'PASS login missing-fields validation'

  Write-Host '[2/7] Register missing fields should return 400...'
  $registerMissing = Invoke-JsonEndpoint -Uri "$BaseUrl/api/auth/register" -Method 'POST' -Body @{} -Headers $null
  Assert-Status -Actual $registerMissing.StatusCode -Expected 400 -Message 'Register missing-fields status mismatch'
  Assert-True (-not [string]::IsNullOrWhiteSpace($registerMissing.Json.error)) 'Register missing-fields error missing'
  Write-Host 'PASS register missing-fields validation'

  Write-Host '[3/7] Profile without token should return 401...'
  $profileNoToken = Invoke-JsonEndpoint -Uri "$BaseUrl/api/auth/profile" -Method 'GET' -Body $null -Headers $null
  Assert-Status -Actual $profileNoToken.StatusCode -Expected 401 -Message 'Profile missing-token status mismatch'
  Write-Host 'PASS profile missing-token validation'

  Write-Host '[4/7] Profile with malformed token should return 401...'
  $profileInvalidToken = Invoke-JsonEndpoint -Uri "$BaseUrl/api/auth/profile" -Method 'GET' -Body $null -Headers @{ Authorization = 'Bearer not-a-real-token' }
  Assert-Status -Actual $profileInvalidToken.StatusCode -Expected 401 -Message 'Profile invalid-token status mismatch'
  Write-Host 'PASS profile invalid-token validation'

  if ($canRunPositive) {
    Write-Host '[5/7] Login with known account should return token...'
    $loginSuccess = Invoke-JsonEndpoint -Uri "$BaseUrl/api/auth/login" -Method 'POST' -Body @{
      email = $resolvedEmail
      password = $resolvedSecret
    } -Headers $null
    Assert-Status -Actual $loginSuccess.StatusCode -Expected 200 -Message 'Login success status mismatch'
    $token = if ($null -ne $loginSuccess.Json) { [string]$loginSuccess.Json.token } else { '' }
    Assert-True (-not [string]::IsNullOrWhiteSpace($token)) 'Login token missing'
    Write-Host 'PASS login success validation'

    Write-Host '[6/7] Profile with valid bearer token should return user payload...'
    $profileSuccess = Invoke-JsonEndpoint -Uri "$BaseUrl/api/auth/profile" -Method 'GET' -Body $null -Headers @{ Authorization = "Bearer $token" }
    Assert-Status -Actual $profileSuccess.StatusCode -Expected 200 -Message 'Profile success status mismatch'
    $userId = if ($null -ne $profileSuccess.Json -and $null -ne $profileSuccess.Json.user) { [string]$profileSuccess.Json.user.id } else { '' }
    Assert-True (-not [string]::IsNullOrWhiteSpace($userId)) 'Profile user id missing'
    Write-Host 'PASS profile success validation'

    Write-Host '[7/7] Login with invalid password should return 401...'
    $invalidPassword = Invoke-JsonEndpoint -Uri "$BaseUrl/api/auth/login" -Method 'POST' -Body @{
      email = $resolvedEmail
      password = "${resolvedSecret}-invalid"
    } -Headers $null
    Assert-Status -Actual $invalidPassword.StatusCode -Expected 401 -Message 'Invalid-password status mismatch'
    Write-Host 'PASS invalid-password validation'
  }
  else {
    if ($RequirePositive) {
      throw 'Positive auth checks require AUTH_SMOKE_EMAIL and AUTH_SMOKE_PASSWORD (or -Email/-Credential).'
    }

    Write-Warning 'Skipping positive auth checks. Provide AUTH_SMOKE_EMAIL and AUTH_SMOKE_PASSWORD to enable full auth validation.'
    Write-Host '[5/7] SKIPPED login success validation'
    Write-Host '[6/7] SKIPPED profile success validation'
    Write-Host '[7/7] SKIPPED invalid-password validation'
  }

  Write-Host ''
  Write-Host 'AUTH SMOKE: ALL CHECKS PASSED'
  exit 0
}
catch {
  Write-Host ''
  Write-Host ("AUTH SMOKE FAILED: " + $_.Exception.Message)

  if ($_.Exception.Message -match 'connect|refused|actively refused') {
    Write-Host 'Hint: Start the app first (npm run dev) before running this script.'
  }

  exit 1
}
