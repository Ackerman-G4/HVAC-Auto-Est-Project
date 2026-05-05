param(
  [string]$DocxPath = 'HVAC_Accuracy_Improvement_Plan.docx',
  [string[]]$MirrorPaths = @('plan.md', 'docs/plan.md'),
  [double]$MinBodySimilarity = 0.90,
  [int]$MaxReportedDiffLines = 12,
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Add-Failure {
  param([string]$Message)
  $script:failures.Add($Message) | Out-Null
  Write-Host "FAIL $Message" -ForegroundColor Red
}

function Add-Warning {
  param([string]$Message)
  $script:warnings.Add($Message) | Out-Null
  Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Add-Pass {
  param([string]$Message)
  Write-Host "PASS $Message" -ForegroundColor Green
}

function Resolve-WorkspacePath {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $null
  }

  $candidate = $Path
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    $candidate = Join-Path $workspaceRoot $candidate
  }

  if (-not (Test-Path $candidate)) {
    Add-Failure "File not found: $candidate"
    return $null
  }

  return (Resolve-Path $candidate).Path
}

function New-LogDirectory {
  $logRoot = Join-Path $workspaceRoot '.logs'
  if (-not (Test-Path $logRoot)) {
    New-Item -Path $logRoot -ItemType Directory | Out-Null
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $logDir = Join-Path $logRoot "docx-parity-$stamp"
  New-Item -Path $logDir -ItemType Directory | Out-Null
  return $logDir
}

function Get-DocxTextFromArchive {
  param(
    [string]$DocxFile,
    [string]$ExtractDir
  )

  if (-not (Test-Path $ExtractDir)) {
    New-Item -Path $ExtractDir -ItemType Directory | Out-Null
  }

  # Some PowerShell environments only support .zip for Expand-Archive.
  $zipPath = Join-Path $ExtractDir '__source.zip'
  $contentDir = Join-Path $ExtractDir 'content'

  Copy-Item -Path $DocxFile -Destination $zipPath -Force
  Expand-Archive -Path $zipPath -DestinationPath $contentDir -Force

  $docXmlPath = Join-Path $contentDir 'word\document.xml'
  if (-not (Test-Path $docXmlPath)) {
    throw "word/document.xml was not found in extracted archive: $DocxFile"
  }

  [xml]$docXml = Get-Content -Path $docXmlPath -Raw
  $namespace = New-Object System.Xml.XmlNamespaceManager($docXml.NameTable)
  $namespace.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

  $paragraphNodes = $docXml.SelectNodes('//w:document/w:body/w:p', $namespace)
  $paragraphs = New-Object System.Collections.Generic.List[string]

  foreach ($paragraph in $paragraphNodes) {
    $textNodes = $paragraph.SelectNodes('.//w:t', $namespace)
    if ($null -eq $textNodes -or $textNodes.Count -eq 0) {
      continue
    }

    $builder = New-Object System.Text.StringBuilder
    foreach ($textNode in $textNodes) {
      [void]$builder.Append($textNode.InnerText)
    }

    $line = $builder.ToString().Trim()
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      $paragraphs.Add($line) | Out-Null
    }
  }

  return [pscustomobject]@{
    Text = ($paragraphs -join "`n")
    DocumentXmlPath = $docXmlPath
  }
}

function Convert-MaybeMojibakeUtf8 {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $Text
  }

  # Many DOCX exports contain UTF-8 text decoded as Windows-1252 (for example: "Ã¢â‚¬â€").
  if ($Text -notmatch '[\u00C2\u00C3\u00E2]') {
    return $Text
  }

  try {
    $cp1252 = [System.Text.Encoding]::GetEncoding(1252)
    $bytes = $cp1252.GetBytes($Text)
    $decoded = [System.Text.Encoding]::UTF8.GetString($bytes)

    $beforeNoise = [System.Text.RegularExpressions.Regex]::Matches($Text, '[\u00C2\u00C3\u00E2]').Count
    $afterNoise = [System.Text.RegularExpressions.Regex]::Matches($decoded, '[\u00C2\u00C3\u00E2]').Count
    if ($afterNoise -lt $beforeNoise) {
      return $decoded
    }
  }
  catch {
    # Fall back to original text if repair fails.
  }

  return $Text
}

function Convert-SymbolsToAscii {
  param([string]$Text)

  if ($null -eq $Text) {
    return ''
  }

  $converted = Convert-MaybeMojibakeUtf8 -Text $Text
  $converted = $converted.Replace([string][char]0x00A0, ' ')
  $converted = $converted.Replace([string][char]0x202F, ' ')
  $converted = $converted.Replace([string][char]0x00D7, 'x')
  $converted = $converted.Replace([string][char]0x00B2, '2')
  $converted = $converted.Replace([string][char]0x00B3, '3')
  $converted = $converted.Replace([string][char]0x00B7, '.')
  $converted = $converted.Replace([string][char]0x2013, '-')
  $converted = $converted.Replace([string][char]0x2014, '-')
  $converted = $converted.Replace([string][char]0x2212, '-')
  $converted = $converted.Replace([string][char]0x2192, '->')
  $converted = $converted.Replace([string][char]0x2193, 'v')
  $converted = $converted.Replace([string][char]0x2022, '- ')
  return $converted
}

function ConvertTo-NormalizedText {
  param([string]$Text)

  if ($null -eq $Text) {
    return ''
  }

  $normalized = Convert-SymbolsToAscii -Text $Text
  $normalized = $normalized -replace "`r`n", "`n"
  $normalized = $normalized -replace "`r", "`n"

  $normalizedLines = New-Object System.Collections.Generic.List[string]
  foreach ($rawLine in ($normalized -split "`n")) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    if ($line.StartsWith('#')) {
      $line = $line.TrimStart('#').Trim()
    }

    if ($line -match '^[\-\*\+]\s+') {
      $line = $line.Substring(1).Trim()
    }

    $line = $line -replace '\s+', ' '
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      $normalizedLines.Add($line) | Out-Null
    }
  }

  return ($normalizedLines -join "`n").Trim()
}

function ConvertTo-NormalizedHeadingLine {
  param([string]$Line)

  if ([string]::IsNullOrWhiteSpace($Line)) {
    return ''
  }

  $heading = $Line.Trim().ToLowerInvariant()
  $heading = $heading -replace '\s+', ' '
  return $heading
}

function Get-NumberedHeadings {
  param([string]$Text)

  $headings = New-Object System.Collections.Generic.List[string]
  foreach ($line in ($Text -split "`n")) {
    if ($line -match '^\d+\.\s+.+$' -or $line -match '^\d+(?:\.\d+)+\s+.+$') {
      $headings.Add((ConvertTo-NormalizedHeadingLine -Line $line)) | Out-Null
    }
  }

  return $headings
}

function ConvertTo-NormalizedEquationToken {
  param([string]$Line)

  if ([string]::IsNullOrWhiteSpace($Line)) {
    return ''
  }

  $token = Convert-SymbolsToAscii -Text $Line
  $token = $token.ToLowerInvariant()
  $token = $token -replace '\s+', ''
  $token = $token.Replace([string][char]0x00D7, 'x')
  $token = $token.Replace([string][char]0x0394, 'delta')
  $token = $token.Replace([string][char]0x03C1, 'rho')
  $token = $token.Replace([string][char]0x03BC, 'mu')
  $token = $token.Replace([string][char]0x03B1, 'alpha')
  $token = $token.Replace([string][char]0x03B2, 'beta')
  $token = $token.Replace([string][char]0x2207, 'nabla')
  return $token
}

function Get-EquationSet {
  param([string]$Text)

  $equations = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

  foreach ($line in ($Text -split "`n")) {
    $trimmed = $line.Trim()
    if ($trimmed -notmatch '=' -or $trimmed.Length -lt 5) {
      continue
    }

    # Recover concatenated package constraints from collapsed DOCX lines.
    $candidate = $trimmed -replace '(?<=[0-9])(?=[a-z][a-z0-9_\-]*>=)', ' '

    # Compare equation-like fragments so line wrapping differences do not cause false mismatches.
    # Restrict to comparator equations to avoid counting code assignments as parity equations.
    $hasComparator = $candidate -match '<=|>=|=='
    $fragments = [System.Text.RegularExpressions.Regex]::Matches(
      $candidate,
      '[a-z0-9_\./\-]+\s*(?:<=|>=|==)\s*[^,\s\)\]\}]+'
    )

    if ($fragments.Count -gt 0) {
      foreach ($fragment in $fragments) {
        $token = ConvertTo-NormalizedEquationToken -Line $fragment.Value
        if (-not [string]::IsNullOrWhiteSpace($token)) {
          [void]$equations.Add($token)
        }
      }
      continue
    }

    if (-not $hasComparator) {
      continue
    }

    $token = ConvertTo-NormalizedEquationToken -Line $candidate
    if (-not [string]::IsNullOrWhiteSpace($token)) {
      [void]$equations.Add($token)
    }
  }

  return $equations
}

function Expand-ScienceSymbols {
  param([string]$Text)

  $expanded = Convert-MaybeMojibakeUtf8 -Text $Text
  $expanded = $expanded.ToLowerInvariant()
  $expanded = $expanded.Replace([string][char]0x00D7, ' x ')
  $expanded = $expanded.Replace([string][char]0x00B0, '')
  $expanded = $expanded.Replace([string][char]0x0394, ' delta ')
  $expanded = $expanded.Replace([string][char]0x03C1, ' rho ')
  $expanded = $expanded.Replace([string][char]0x03BC, ' mu ')
  $expanded = $expanded.Replace([string][char]0x03B1, ' alpha ')
  $expanded = $expanded.Replace([string][char]0x03B2, ' beta ')
  $expanded = $expanded.Replace([string][char]0x2207, ' nabla ')
  return $expanded
}

function Get-TokenSet {
  param([string]$Text)

  $tokens = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  $expanded = Expand-ScienceSymbols -Text $Text

  $tokenMatches = [System.Text.RegularExpressions.Regex]::Matches($expanded, '[a-z0-9\.]+')
  foreach ($tokenMatch in $tokenMatches) {
    $value = $tokenMatch.Value
    if ($value.Length -le 1 -and -not ($value -match '^\d+$')) {
      continue
    }

    [void]$tokens.Add($value)
  }

  return $tokens
}

function Measure-JaccardSimilarity {
  param(
    [System.Collections.Generic.HashSet[string]]$Left,
    [System.Collections.Generic.HashSet[string]]$Right
  )

  if ($Left.Count -eq 0 -and $Right.Count -eq 0) {
    return 1.0
  }

  $intersection = 0
  foreach ($token in $Left) {
    if ($Right.Contains($token)) {
      $intersection += 1
    }
  }

  $union = $Left.Count + $Right.Count - $intersection
  if ($union -le 0) {
    return 0.0
  }

  return [math]::Round(($intersection / $union), 6)
}

function Get-Sha256Hex {
  param([string]$Text)

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha.ComputeHash($bytes)
  }
  finally {
    $sha.Dispose()
  }

  return (($hash | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Get-FirstDifferences {
  param(
    [string]$Left,
    [string]$Right,
    [int]$Limit = 10
  )

  $leftLines = $Left -split "`n"
  $rightLines = $Right -split "`n"
  $maxLength = [Math]::Max($leftLines.Count, $rightLines.Count)

  $diffs = New-Object System.Collections.Generic.List[string]
  for ($index = 0; $index -lt $maxLength; $index += 1) {
    if ($diffs.Count -ge $Limit) {
      break
    }

    $leftValue = if ($index -lt $leftLines.Count) { $leftLines[$index] } else { '<missing>' }
    $rightValue = if ($index -lt $rightLines.Count) { $rightLines[$index] } else { '<missing>' }

    if ($leftValue -ceq $rightValue) {
      continue
    }

    $leftDisplay = if ($leftValue.Length -gt 120) { $leftValue.Substring(0, 117) + '...' } else { $leftValue }
    $rightDisplay = if ($rightValue.Length -gt 120) { $rightValue.Substring(0, 117) + '...' } else { $rightValue }
    $diffs.Add("L$($index + 1): DOCX='$leftDisplay' | MIRROR='$rightDisplay'") | Out-Null
  }

  return $diffs
}

function Compare-HeadingSequence {
  param(
    [System.Collections.Generic.List[string]]$DocxHeadings,
    [System.Collections.Generic.List[string]]$MirrorHeadings
  )

  if ($DocxHeadings.Count -ne $MirrorHeadings.Count) {
    return $false
  }

  for ($index = 0; $index -lt $DocxHeadings.Count; $index += 1) {
    if ($DocxHeadings[$index] -cne $MirrorHeadings[$index]) {
      return $false
    }
  }

  return $true
}

function Get-SetDelta {
  param(
    [System.Collections.Generic.HashSet[string]]$Source,
    [System.Collections.Generic.HashSet[string]]$Target
  )

  $delta = New-Object System.Collections.Generic.List[string]
  foreach ($item in $Source) {
    if (-not $Target.Contains($item)) {
      $delta.Add($item) | Out-Null
    }
  }

  return $delta
}

function Get-WorkspaceRelativePath {
  param([string]$AbsolutePath)

  if ([string]::IsNullOrWhiteSpace($AbsolutePath)) {
    return ''
  }

  $rootPrefix = $workspaceRoot.TrimEnd('\\') + '\\'
  $absoluteText = [string]$AbsolutePath
  if ($absoluteText.ToLowerInvariant().StartsWith($rootPrefix.ToLowerInvariant())) {
    return $absoluteText.Substring($rootPrefix.Length)
  }

  if ($absoluteText.ToLowerInvariant() -eq $workspaceRoot.ToLowerInvariant()) {
    return '.'
  }

  return $AbsolutePath
}

Write-Host '=== DOCX Plan Parity Validation ==='

if ($Strict) {
  $MinBodySimilarity = [math]::Max($MinBodySimilarity, 0.97)
  Write-Host "Strict mode enabled. Effective minimum body similarity: $MinBodySimilarity"
}

if ($MinBodySimilarity -lt 0.0 -or $MinBodySimilarity -gt 1.0) {
  throw "MinBodySimilarity must be between 0.0 and 1.0 (received: $MinBodySimilarity)"
}

$docxFullPath = Resolve-WorkspacePath -Path $DocxPath
$mirrorFullPaths = New-Object System.Collections.Generic.List[string]
foreach ($mirrorPath in $MirrorPaths) {
  $resolvedMirror = Resolve-WorkspacePath -Path $mirrorPath
  if ($null -ne $resolvedMirror) {
    $mirrorFullPaths.Add($resolvedMirror) | Out-Null
  }
}

if ($null -eq $docxFullPath -or $mirrorFullPaths.Count -eq 0) {
  Write-Host ''
  Write-Host 'DOCX parity validation failed before comparison.' -ForegroundColor Red
  exit 1
}

$artifactDir = New-LogDirectory
Add-Pass "Artifacts directory: $artifactDir"

$extractDir = Join-Path $artifactDir 'docx-extracted'
try {
  $docxExtract = Get-DocxTextFromArchive -DocxFile $docxFullPath -ExtractDir $extractDir
  Add-Pass "Extracted DOCX XML from: $($docxExtract.DocumentXmlPath)"
}
catch {
  Add-Failure "Failed to extract DOCX XML: $($_.Exception.Message)"
  Write-Host ''
  Write-Host 'DOCX parity validation failed.' -ForegroundColor Red
  exit 1
}

$docxRawText = $docxExtract.Text
$docxNormalizedText = ConvertTo-NormalizedText -Text $docxRawText
$docxHeadings = Get-NumberedHeadings -Text $docxNormalizedText
$docxEquationSet = Get-EquationSet -Text $docxNormalizedText
$docxTokenSet = Get-TokenSet -Text $docxNormalizedText
$docxHash = Get-Sha256Hex -Text $docxNormalizedText

Set-Content -Path (Join-Path $artifactDir 'docx.raw.txt') -Value $docxRawText -Encoding UTF8
Set-Content -Path (Join-Path $artifactDir 'docx.normalized.txt') -Value $docxNormalizedText -Encoding UTF8

$results = New-Object System.Collections.Generic.List[object]

foreach ($mirrorFullPath in $mirrorFullPaths) {
  $mirrorRelative = [string]$mirrorFullPath
  $safeName = $mirrorRelative -replace '[\\/:*?"<>| ]', '_'

  $mirrorRawText = Get-Content -Path $mirrorFullPath -Raw
  $mirrorNormalizedText = ConvertTo-NormalizedText -Text $mirrorRawText
  $mirrorHeadings = Get-NumberedHeadings -Text $mirrorNormalizedText
  $mirrorEquationSet = Get-EquationSet -Text $mirrorNormalizedText
  $mirrorTokenSet = Get-TokenSet -Text $mirrorNormalizedText
  $mirrorHash = Get-Sha256Hex -Text $mirrorNormalizedText

  Set-Content -Path (Join-Path $artifactDir "$safeName.raw.txt") -Value $mirrorRawText -Encoding UTF8
  Set-Content -Path (Join-Path $artifactDir "$safeName.normalized.txt") -Value $mirrorNormalizedText -Encoding UTF8

  $headingSequenceMatches = Compare-HeadingSequence -DocxHeadings $docxHeadings -MirrorHeadings $mirrorHeadings
  $missingEquations = Get-SetDelta -Source $docxEquationSet -Target $mirrorEquationSet
  $extraEquations = Get-SetDelta -Source $mirrorEquationSet -Target $docxEquationSet
  $bodySimilarity = Measure-JaccardSimilarity -Left $docxTokenSet -Right $mirrorTokenSet
  $firstDiffs = Get-FirstDifferences -Left $docxNormalizedText -Right $mirrorNormalizedText -Limit $MaxReportedDiffLines

  $isPass = $true
  if (-not $headingSequenceMatches) {
    $isPass = $false
  }
  if ($missingEquations.Count -gt 0 -or $extraEquations.Count -gt 0) {
    $isPass = $false
  }
  if ($bodySimilarity -lt $MinBodySimilarity) {
    $isPass = $false
  }

  if ($isPass) {
    Add-Pass "Parity passed for $mirrorRelative (body similarity: $bodySimilarity)"
  }
  else {
    Add-Failure "Parity failed for $mirrorRelative (body similarity: $bodySimilarity, threshold: $MinBodySimilarity)"
  }

  $results.Add([pscustomobject]@{
    mirror = $mirrorRelative
    pass = $isPass
    docxNormalizedSha256 = $docxHash
    mirrorNormalizedSha256 = $mirrorHash
    headingSequenceMatches = $headingSequenceMatches
    docxHeadingCount = $docxHeadings.Count
    mirrorHeadingCount = $mirrorHeadings.Count
    missingEquationCount = $missingEquations.Count
    extraEquationCount = $extraEquations.Count
    missingEquations = @($missingEquations)
    extraEquations = @($extraEquations)
    bodySimilarity = $bodySimilarity
    minBodySimilarity = $MinBodySimilarity
    firstDifferences = @($firstDiffs)
  }) | Out-Null
}

$summary = [pscustomobject]@{
  docxPath = [string]$docxFullPath
  comparedMirrors = $results.ToArray()
  warnings = $warnings.ToArray()
  failures = $failures.ToArray()
  generatedAt = (Get-Date).ToString('o')
}

$summaryPath = Join-Path $artifactDir 'summary.json'
$summary | ConvertTo-Json -Depth 7 | Set-Content -Path $summaryPath -Encoding UTF8
Add-Pass "Wrote summary: $summaryPath"

Write-Host ''
Write-Host '=== DOCX Parity Summary ==='
foreach ($result in $results) {
  Write-Host "Mirror: $($result.mirror)"
  Write-Host "  Pass: $($result.pass)"
  Write-Host "  Heading sequence: $($result.headingSequenceMatches) ($($result.docxHeadingCount) vs $($result.mirrorHeadingCount))"
  Write-Host "  Equation delta: missing=$($result.missingEquationCount), extra=$($result.extraEquationCount)"
  Write-Host "  Body similarity: $($result.bodySimilarity) (threshold=$($result.minBodySimilarity))"

  if (-not $result.pass -and $result.firstDifferences.Count -gt 0) {
    Write-Host '  First differences:'
    foreach ($diff in $result.firstDifferences) {
      Write-Host "    $diff"
    }
  }

  Write-Host ''
}

Write-Host "Warnings: $($warnings.Count)"
Write-Host "Failures: $($failures.Count)"

if ($failures.Count -gt 0) {
  Write-Host ''
  Write-Host 'DOCX parity validation failed.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host 'DOCX parity validation passed.' -ForegroundColor Green
exit 0

