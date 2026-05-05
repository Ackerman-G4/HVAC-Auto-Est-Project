$target = Join-Path (Split-Path -Parent $PSCommandPath) 'powershell/validate-docx-parity.ps1'
& $target @args
exit $LASTEXITCODE

